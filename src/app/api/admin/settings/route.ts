import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError } from "@/lib/authz";
import {
  getRuntimeConfigWithSources,
  saveRuntimeSettings,
  type SettingKey,
} from "@/lib/runtime-config";

/**
 * GET  /api/admin/settings — current effective LDAP/SMTP config + per-field source.
 * PUT  /api/admin/settings — persist overrides (SystemSetting rows).
 *
 * The stored LDAP bind password is NEVER returned; the client only learns
 * whether one is set. Sending an empty string for a field deletes its override
 * and reverts that field to the .env value.
 */

export async function GET() {
  try {
    await requireSuperAdmin();
    const { config, sources } = await getRuntimeConfigWithSources();

    return NextResponse.json({
      ok: true,
      data: {
        config: {
          ldapUrl: config.ldapUrl ?? "",
          ldapBaseDn: config.ldapBaseDn ?? "",
          ldapBindDn: config.ldapBindDn ?? "",
          ldapAllowInsecure: config.ldapAllowInsecure,
          smtpHost: config.smtpHost,
          smtpPort: config.smtpPort,
          smtpFrom: config.smtpFrom,
        },
        hasLdapBindPassword: Boolean(config.ldapBindPassword),
        sources,
      },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}

const putSchema = z.object({
  ldapUrl: z.string().trim().max(300).optional(),
  ldapBaseDn: z.string().trim().max(300).optional(),
  ldapBindDn: z.string().trim().max(300).optional(),
  // Omitted entirely = leave the stored password untouched. Empty string =
  // clear the override and fall back to .env.
  ldapBindPassword: z.string().max(300).optional(),
  ldapAllowInsecure: z.boolean().optional(),
  smtpHost: z.string().trim().max(200).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpFrom: z.string().trim().max(200).optional(),
});

export async function PUT(req: NextRequest) {
  try {
    const actor = await requireSuperAdmin();
    const body = putSchema.parse(await req.json());

    // A non-empty LDAP URL must be a real ldap(s) URL, or every login breaks
    // with a connection error that looks like a wrong password.
    if (body.ldapUrl && !/^ldaps?:\/\/[^\s]+$/i.test(body.ldapUrl)) {
      return NextResponse.json(
        { ok: false, error: { code: "INVALID_LDAP_URL", message: "LDAP URL must start with ldap:// or ldaps://" } },
        { status: 400 }
      );
    }

    const entries: Partial<Record<SettingKey, string>> = {};
    if (body.ldapUrl !== undefined) entries.LDAP_URL = body.ldapUrl;
    if (body.ldapBaseDn !== undefined) entries.LDAP_BASE_DN = body.ldapBaseDn;
    if (body.ldapBindDn !== undefined) entries.LDAP_BIND_DN = body.ldapBindDn;
    if (body.ldapBindPassword !== undefined) entries.LDAP_BIND_PASSWORD = body.ldapBindPassword;
    if (body.ldapAllowInsecure !== undefined) entries.LDAP_ALLOW_INSECURE = String(body.ldapAllowInsecure);
    if (body.smtpHost !== undefined) entries.SMTP_HOST = body.smtpHost;
    if (body.smtpPort !== undefined) entries.SMTP_PORT = String(body.smtpPort);
    if (body.smtpFrom !== undefined) entries.SMTP_FROM = body.smtpFrom;

    // saveRuntimeSettings writes the SYSTEM_SETTINGS_UPDATED audit row in the
    // same transaction as the change, with the secret value redacted.
    await saveRuntimeSettings(entries, actor.id);

    const { config, sources } = await getRuntimeConfigWithSources();
    return NextResponse.json({
      ok: true,
      data: { hasLdapBindPassword: Boolean(config.ldapBindPassword), sources },
    });
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
