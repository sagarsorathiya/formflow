/**
 * Runtime connectivity config (LDAP + SMTP), resolved as:
 *
 *     SystemSetting row (DB, admin-editable)  →  falls back to  →  .env value
 *
 * Motivation: LDAP/SMTP settings had to be edited in C:\FormFlow\.env and both
 * Windows services restarted. This makes them editable from /admin/settings.
 * Anything never saved through the UI keeps using .env exactly as before, so
 * this is backwards-compatible with an untouched deployment.
 *
 * Cache: values are memoised for CACHE_TTL_MS. The BullMQ worker is a separate
 * long-lived process that cannot be told to invalidate anything, so a short TTL
 * is what lets it pick up an admin's change without a restart. Saving from the
 * UI clears the web process's cache immediately (invalidateRuntimeConfigCache),
 * so the admin sees their change reflected at once; the worker follows within
 * the TTL.
 *
 * DEV_MOCK_LDAP and LDAP_ALLOW_INSECURE's env default stay in .env — the former
 * is a dev-only switch that must never be flippable from a production UI.
 */

import { prisma } from "./prisma";
import { env } from "./env";
import { decryptSecret, encryptSecret } from "./secret-box";
import { writeAudit } from "./audit";

const CACHE_TTL_MS = 30_000;

/** Keys allowed in SystemSetting. Anything else is rejected by the API. */
export const SETTING_KEYS = [
  "LDAP_URL",
  "LDAP_BASE_DN",
  "LDAP_BIND_DN",
  "LDAP_BIND_PASSWORD",
  "LDAP_ALLOW_INSECURE",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_FROM",
] as const;

export type SettingKey = (typeof SETTING_KEYS)[number];

/** Only these are stored encrypted. */
const SECRET_KEYS: ReadonlySet<string> = new Set<SettingKey>(["LDAP_BIND_PASSWORD"]);

export function isSecretKey(key: string): boolean {
  return SECRET_KEYS.has(key);
}

export interface RuntimeConfig {
  ldapUrl: string | null;
  ldapBaseDn: string | null;
  ldapBindDn: string | null;
  ldapBindPassword: string | null;
  ldapAllowInsecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
}

/** Which source each field actually resolved from — surfaced in the admin UI. */
export type ConfigSource = "database" | "environment" | "unset";

let cache: { value: RuntimeConfig; sources: Record<SettingKey, ConfigSource>; at: number } | null = null;

export function invalidateRuntimeConfigCache(): void {
  cache = null;
}

async function loadOverrides(): Promise<Map<string, string>> {
  const rows = await prisma.systemSetting.findMany({
    where: { key: { in: [...SETTING_KEYS] } },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    const value = row.encrypted ? decryptSecret(row.value) : row.value;
    // A null here means an undecryptable secret — skip it so the env value wins.
    if (value !== null && value !== "") map.set(row.key, value);
  }
  return map;
}

async function resolve(): Promise<{ value: RuntimeConfig; sources: Record<SettingKey, ConfigSource> }> {
  let overrides: Map<string, string>;
  try {
    overrides = await loadOverrides();
  } catch (err) {
    // DB unreachable — fail soft to .env rather than breaking login/email entirely.
    console.error("[runtime-config] failed to read SystemSetting, using .env:", err);
    overrides = new Map();
  }

  const sources = {} as Record<SettingKey, ConfigSource>;
  const pick = (key: SettingKey, envValue: string | undefined | null): string | null => {
    const dbValue = overrides.get(key);
    if (dbValue !== undefined) {
      sources[key] = "database";
      return dbValue;
    }
    if (envValue !== undefined && envValue !== null && envValue !== "") {
      sources[key] = "environment";
      return envValue;
    }
    sources[key] = "unset";
    return null;
  };

  const allowInsecureRaw = pick("LDAP_ALLOW_INSECURE", env.LDAP_ALLOW_INSECURE ? "true" : "false");
  const smtpPortRaw = pick("SMTP_PORT", String(env.SMTP_PORT));
  const parsedPort = Number(smtpPortRaw);

  return {
    value: {
      ldapUrl: pick("LDAP_URL", env.LDAP_URL),
      ldapBaseDn: pick("LDAP_BASE_DN", env.LDAP_BASE_DN),
      ldapBindDn: pick("LDAP_BIND_DN", env.LDAP_BIND_DN),
      ldapBindPassword: pick("LDAP_BIND_PASSWORD", env.LDAP_BIND_PASSWORD),
      ldapAllowInsecure: allowInsecureRaw === "true",
      smtpHost: pick("SMTP_HOST", env.SMTP_HOST) ?? "localhost",
      smtpPort: Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : 25,
      smtpFrom: pick("SMTP_FROM", env.SMTP_FROM) ?? "FormFlow Portal <formflow@localhost>",
    },
    sources,
  };
}

export async function getRuntimeConfig(): Promise<RuntimeConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  const resolved = await resolve();
  cache = { ...resolved, at: Date.now() };
  return cache.value;
}

/** Config plus per-field provenance, for the admin settings screen. */
export async function getRuntimeConfigWithSources(): Promise<{
  config: RuntimeConfig;
  sources: Record<SettingKey, ConfigSource>;
}> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { config: cache.value, sources: cache.sources };
  }
  const resolved = await resolve();
  cache = { ...resolved, at: Date.now() };
  return { config: cache.value, sources: cache.sources };
}

/**
 * Upsert settings. An empty-string value deletes the row, reverting that field
 * to its .env value — that's how the UI's "clear" behaves, so an admin can
 * always get back to the environment default without DB surgery.
 */
export async function saveRuntimeSettings(
  entries: Partial<Record<SettingKey, string>>,
  actorId: string
): Promise<void> {
  // Audit is written inside the same transaction as the change itself, per the
  // project rule that every state-changing operation records an AuditLog row
  // atomically. The secret value is never written to the log — only whether it
  // was updated or cleared.
  const auditAfter: Record<string, string> = {};
  for (const [key, raw] of Object.entries(entries)) {
    const value = raw ?? "";
    auditAfter[key] = isSecretKey(key)
      ? value === "" ? "(cleared)" : "(updated)"
      : value === "" ? "(cleared — reverted to .env)" : value;
  }

  await prisma.$transaction(async (tx) => {
    for (const [key, raw] of Object.entries(entries)) {
      const value = raw ?? "";
      if (value === "") {
        await tx.systemSetting.deleteMany({ where: { key } });
        continue;
      }
      const encrypted = isSecretKey(key);
      const stored = encrypted ? encryptSecret(value) : value;
      await tx.systemSetting.upsert({
        where: { key },
        create: { key, value: stored, encrypted, updatedById: actorId },
        update: { value: stored, encrypted, updatedById: actorId },
      });
    }

    await writeAudit({
      actorId,
      action: "SYSTEM_SETTINGS_UPDATED",
      entityType: "SystemSetting",
      entityId: "system",
      after: auditAfter,
      tx,
    });
  });

  invalidateRuntimeConfigCache();
}
