import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { SmtpTester, LdapTester } from "./settings-tester";
import { SettingsEditor } from "./settings-editor";
import { getRuntimeConfigWithSources } from "@/lib/runtime-config";
import { Server, Mail, Network, SlidersHorizontal } from "lucide-react";

export const metadata: Metadata = { title: "Admin — Settings" };

// Reads live config from the database — must never be prerendered or cached,
// or the page would show a build-time snapshot of the settings.
export const dynamic = "force-dynamic";

function Section({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border shadow-card overflow-hidden
                    bg-white border-slate-200 dark:bg-card dark:border-border dark:shadow-none">
      <div className="flex items-center gap-2.5 px-6 py-4 border-b
                      border-slate-100 dark:border-border">
        <Icon className="w-4 h-4 text-slate-400" aria-hidden="true" />
        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">{title}</h2>
      </div>
      <div className="px-6 py-5 space-y-4">{children}</div>
    </div>
  );
}

function EnvRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-44 text-slate-500 shrink-0 text-xs">{label}</span>
      <span className="font-mono px-2.5 py-1 rounded-lg truncate text-xs
                       text-slate-800 bg-slate-50 border border-slate-200
                       dark:text-slate-300 dark:bg-muted/60 dark:border-border">
        {value}
      </span>
    </div>
  );
}

export default async function AdminSettingsPage() {
  // Effective config: a SystemSetting row (saved below) wins over the .env value.
  const { config, sources } = await getRuntimeConfigWithSources();
  const smtpHost = config.smtpHost;
  const smtpPort = String(config.smtpPort);
  const smtpFrom = config.smtpFrom;
  const ldapUrl = config.ldapUrl ?? "";
  const ldapBindDn = config.ldapBindDn ?? "";
  const ldapBaseDn = config.ldapBaseDn ?? "";
  const anyFromDb = Object.values(sources).some((v) => v === "database");

  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="System Settings"
        description="Connectivity configuration and test utilities for SMTP and LDAP."
      />

      <Section title="Connectivity Settings" icon={SlidersHorizontal}>
        <p className="text-sm text-slate-500 leading-relaxed">
          Edit the LDAP and SMTP settings the portal actually uses. Saved values are stored in the
          database and take effect without restarting the services; any field left unsaved keeps
          using the value from the server&apos;s <span className="font-mono text-xs">.env</span> file.
        </p>
        <SettingsEditor />
      </Section>

      <Section title="Environment Overview" icon={Server}>
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {anyFromDb
            ? "Values below reflect what is currently in effect (saved settings override .env)."
            : "No saved overrides — every value below comes from the server's .env file."}
        </p>
        <div className="space-y-2.5">
          <EnvRow label="DATABASE_URL" value="postgresql://..." />
          <EnvRow label="REDIS_URL" value={process.env.REDIS_URL ?? "redis://localhost:6379"} />
          <EnvRow label="LDAP_URL" value={ldapUrl} />
          <EnvRow label="LDAP_BASE_DN" value={ldapBaseDn || "—"} />
          <EnvRow label="SMTP_HOST" value={smtpHost} />
          <EnvRow label="SMTP_PORT" value={smtpPort} />
          <EnvRow label="UPLOAD_DIR" value={process.env.UPLOAD_DIR ?? "/data/uploads"} />
          <EnvRow label="DEV_MOCK_LDAP" value={process.env.DEV_MOCK_LDAP ?? "false"} />
        </div>
      </Section>

      <Section title="SMTP Test" icon={Mail}>
        <p className="text-sm text-slate-500 leading-relaxed">
          Sends a test email through the configured SMTP relay. No authentication — uses plain SMTP on port {smtpPort}.
        </p>
        <SmtpTester defaultHost={smtpHost} defaultPort={smtpPort} defaultFrom={smtpFrom} />
      </Section>

      <Section title="LDAP / Active Directory Test" icon={Network}>
        <p className="text-sm text-slate-500 leading-relaxed">
          Binds with the service account credentials and queries the base DN. Enter the service account password below (not stored anywhere).
        </p>
        <LdapTester defaultUrl={ldapUrl} defaultBindDn={ldapBindDn} defaultBaseDn={ldapBaseDn} />
      </Section>
    </div>
  );
}
