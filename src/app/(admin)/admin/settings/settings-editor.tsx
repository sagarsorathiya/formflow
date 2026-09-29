"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Save, CheckCircle2, Database, FileCog } from "lucide-react";

type ConfigSource = "database" | "environment" | "unset";

interface Config {
  ldapUrl: string;
  ldapBaseDn: string;
  ldapBindDn: string;
  ldapAllowInsecure: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpFrom: string;
}

type SettingKey =
  | "LDAP_URL"
  | "LDAP_BASE_DN"
  | "LDAP_BIND_DN"
  | "LDAP_BIND_PASSWORD"
  | "LDAP_ALLOW_INSECURE"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_FROM";

const inputClass =
  "w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30 " +
  "border border-slate-200 bg-white text-slate-800 " +
  "dark:border-border dark:bg-muted/60 dark:text-slate-200";

/** Small chip showing whether a field currently comes from the DB or .env. */
function SourceChip({ source }: { source: ConfigSource | undefined }) {
  if (source === "database") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded
                   bg-orange-50 text-orange-700 border border-orange-200
                   dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/25"
      >
        <Database className="w-2.5 h-2.5" aria-hidden="true" /> Saved here
      </span>
    );
  }
  if (source === "environment") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded
                   bg-slate-100 text-slate-500 border border-slate-200
                   dark:bg-muted/60 dark:text-slate-400 dark:border-border"
      >
        <FileCog className="w-2.5 h-2.5" aria-hidden="true" /> From .env
      </span>
    );
  }
  return null;
}

function Field({
  label,
  hint,
  source,
  children,
}: {
  label: string;
  hint?: string;
  source?: ConfigSource;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <label className="text-xs font-medium text-slate-600 dark:text-slate-400">{label}</label>
        <SourceChip source={source} />
      </div>
      {children}
      {hint && <p className="text-[11px] text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export function SettingsEditor() {
  const [config, setConfig] = useState<Config | null>(null);
  const [sources, setSources] = useState<Partial<Record<SettingKey, ConfigSource>>>({});
  const [hasPassword, setHasPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [clearPassword, setClearPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/settings");
        const json = await res.json();
        if (json.ok) {
          setConfig(json.data.config);
          setSources(json.data.sources ?? {});
          setHasPassword(json.data.hasLdapBindPassword);
        } else {
          setMsg({ ok: false, text: json.error?.message ?? "Failed to load settings." });
        }
      } catch {
        setMsg({ ok: false, text: "Failed to load settings." });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((c) => (c ? { ...c, [key]: value } : c));
  }

  async function save() {
    if (!config) return;
    setSaving(true);
    setMsg(null);
    try {
      // The password is only sent when the admin typed a new one or asked to
      // clear it — otherwise the stored value is left untouched on the server.
      const payload: Record<string, unknown> = {
        ldapUrl: config.ldapUrl,
        ldapBaseDn: config.ldapBaseDn,
        ldapBindDn: config.ldapBindDn,
        ldapAllowInsecure: config.ldapAllowInsecure,
        smtpHost: config.smtpHost,
        smtpPort: config.smtpPort,
        smtpFrom: config.smtpFrom,
      };
      if (clearPassword) payload.ldapBindPassword = "";
      else if (password) payload.ldapBindPassword = password;

      const res = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setMsg({ ok: false, text: json.error?.message ?? "Save failed." });
        return;
      }
      setSources(json.data.sources ?? {});
      setHasPassword(json.data.hasLdapBindPassword);
      setPassword("");
      setClearPassword(false);
      setMsg({
        ok: true,
        text: "Settings saved. The portal uses them immediately; the background worker picks them up within 30 seconds.",
      });
    } catch {
      setMsg({ ok: false, text: "Network error." });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <p className="text-sm text-slate-400 flex items-center gap-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Loading settings...
      </p>
    );
  }

  if (!config) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">{msg?.text ?? "Settings unavailable."}</p>
    );
  }

  return (
    <div className="space-y-5">
      {msg && (
        <p
          className={`text-sm px-3 py-2 rounded-lg border ${
            msg.ok
              ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20"
              : "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"
          }`}
        >
          {msg.ok && <CheckCircle2 className="w-3.5 h-3.5 inline mr-1.5 -mt-0.5" aria-hidden="true" />}
          {msg.text}
        </p>
      )}

      {/* LDAP */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          LDAP / Active Directory
        </h3>

        <Field
          label="LDAP URL"
          source={sources.LDAP_URL}
          hint="e.g. ldap://dc01.example.com:389 or ldaps://dc01.example.com:636"
        >
          <input
            value={config.ldapUrl}
            onChange={(e) => set("ldapUrl", e.target.value)}
            placeholder="ldap://host:389"
            className={inputClass}
          />
        </Field>

        <Field label="Base DN" source={sources.LDAP_BASE_DN} hint="e.g. DC=example,DC=com">
          <input
            value={config.ldapBaseDn}
            onChange={(e) => set("ldapBaseDn", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Bind DN (service account)" source={sources.LDAP_BIND_DN}>
          <input
            value={config.ldapBindDn}
            onChange={(e) => set("ldapBindDn", e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field
          label="Bind Password"
          source={sources.LDAP_BIND_PASSWORD}
          hint={
            hasPassword
              ? "A password is stored. Leave blank to keep it unchanged."
              : "No password stored - the .env value is in use until you set one here."
          }
        >
          <input
            type="password"
            value={password}
            disabled={clearPassword}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={hasPassword ? "********  (unchanged)" : "Enter service account password"}
            className={`${inputClass} disabled:opacity-50`}
            autoComplete="new-password"
          />
          {hasPassword && sources.LDAP_BIND_PASSWORD === "database" && (
            <label className="flex items-center gap-2 mt-1.5 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer">
              <input
                type="checkbox"
                checked={clearPassword}
                onChange={(e) => {
                  setClearPassword(e.target.checked);
                  if (e.target.checked) setPassword("");
                }}
                className="rounded border-slate-300"
              />
              Clear the saved password and fall back to the .env value
            </label>
          )}
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 cursor-pointer">
          <input
            type="checkbox"
            checked={config.ldapAllowInsecure}
            onChange={(e) => set("ldapAllowInsecure", e.target.checked)}
            className="rounded border-slate-300"
          />
          Allow insecure TLS (skip certificate validation)
        </label>
      </div>

      {/* SMTP */}
      <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-border">
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 pt-3">
          SMTP Relay
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <Field label="SMTP Host" source={sources.SMTP_HOST}>
              <input
                value={config.smtpHost}
                onChange={(e) => set("smtpHost", e.target.value)}
                className={inputClass}
              />
            </Field>
          </div>
          <Field label="Port" source={sources.SMTP_PORT}>
            <input
              type="number"
              value={config.smtpPort}
              onChange={(e) => set("smtpPort", Number(e.target.value))}
              className={inputClass}
            />
          </Field>
        </div>

        <Field
          label="From address"
          source={sources.SMTP_FROM}
          hint="e.g. FormFlow Portal <formflow@example.com>"
        >
          <input
            value={config.smtpFrom}
            onChange={(e) => set("smtpFrom", e.target.value)}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={save} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" aria-hidden="true" /> Saving...
            </>
          ) : (
            <>
              <Save className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Save Settings
            </>
          )}
        </Button>
        <p className="text-[11px] text-slate-400 dark:text-slate-500">
          Use the test tools below to verify before saving.
        </p>
      </div>
    </div>
  );
}
