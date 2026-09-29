"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

interface SmtpField { host: string; port: string; from: string; to: string }
interface LdapField { url: string; bindDn: string; bindPassword: string; baseDn: string }

function ResultBanner({ result }: { result: { ok: boolean; message: string } | null }) {
  if (!result) return null;
  return (
    <p className={`mt-2 text-sm px-3 py-2 rounded-lg border ${result.ok ? "bg-green-50 text-green-700 border-green-200 dark:bg-green-500/10 dark:text-green-400 dark:border-green-500/20" : "bg-red-50 text-red-700 border-red-200 dark:bg-red-500/10 dark:text-red-400 dark:border-red-500/20"}`}>
      {result.message}
    </p>
  );
}

export function SmtpTester({
  defaultHost,
  defaultPort,
  defaultFrom,
}: {
  defaultHost: string;
  defaultPort: string;
  defaultFrom: string;
}) {
  const [fields, setFields] = useState<SmtpField>({
    host: defaultHost,
    port: defaultPort,
    from: defaultFrom,
    to: "",
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (k: keyof SmtpField) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  async function test() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-smtp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host: fields.host, port: Number(fields.port), from: fields.from, to: fields.to }),
      });
      const json = await res.json();
      setResult({ ok: res.ok, message: res.ok ? json.message : (json.error?.message ?? "Failed.") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 sm:col-span-1 space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">SMTP Host</label>
          <input value={fields.host} onChange={set("host")} className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
           border border-slate-200 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Port</label>
          <input value={fields.port} onChange={set("port")} className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
           border border-slate-200 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">From address</label>
          <input value={fields.from} onChange={set("from")} className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
           border border-slate-200 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200" />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Send test email to</label>
          <input value={fields.to} onChange={set("to")} placeholder="your@email.com" className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
           border border-slate-200 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200" />
        </div>
      </div>
      <Button onClick={test} disabled={loading || !fields.to} size="sm">
        {loading ? "Sending..." : "Send Test Email"}
      </Button>
      <ResultBanner result={result} />
    </div>
  );
}

export function LdapTester({
  defaultUrl,
  defaultBindDn,
  defaultBaseDn,
}: {
  defaultUrl: string;
  defaultBindDn: string;
  defaultBaseDn: string;
}) {
  const [fields, setFields] = useState<LdapField>({
    url: defaultUrl,
    bindDn: defaultBindDn,
    bindPassword: "",
    baseDn: defaultBaseDn,
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const set = (k: keyof LdapField) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFields((f) => ({ ...f, [k]: e.target.value }));

  async function test() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/admin/test-ldap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(fields),
      });
      const json = await res.json();
      setResult({ ok: res.ok, message: res.ok ? json.message : (json.error?.message ?? "Failed.") });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3">
        {(["url", "bindDn", "bindPassword", "baseDn"] as const).map((k) => (
          <div key={k} className="space-y-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
              {{ url: "LDAP URL", bindDn: "Bind DN", bindPassword: "Bind Password", baseDn: "Base DN" }[k]}
            </label>
            <input
              value={fields[k]}
              onChange={set(k)}
              type={k === "bindPassword" ? "password" : "text"}
              className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/30
           border border-slate-200 bg-white text-slate-800 dark:border-border dark:bg-muted/60 dark:text-slate-200"
            />
          </div>
        ))}
      </div>
      <Button onClick={test} disabled={loading || !fields.bindPassword} size="sm">
        {loading ? "Testing..." : "Test LDAP Connection"}
      </Button>
      <ResultBanner result={result} />
    </div>
  );
}
