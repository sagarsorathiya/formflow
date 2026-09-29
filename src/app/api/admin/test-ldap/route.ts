import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireSuperAdmin, apiError } from "@/lib/authz";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { describeLdapError } from "@/lib/connection-errors";

const schema = z.object({
  url: z.string().min(1),
  bindDn: z.string().min(1),
  bindPassword: z.string().min(1),
  baseDn: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireSuperAdmin();
    await enforceRateLimit({ key: `ratelimit:test-ldap:${user.id}`, limit: 10, windowSeconds: 5 * 60 });
    const body = schema.parse(await req.json());

    const { Client } = await import("ldapts");
    const client = new Client({
      url: body.url,
      tlsOptions: body.url.startsWith("ldaps://")
        ? env.LDAP_ALLOW_INSECURE
          ? { rejectUnauthorized: false }
          : { rejectUnauthorized: true }
        : undefined,
    });

    try {
      await client.bind(body.bindDn, body.bindPassword);
      const { searchEntries } = await client.search(body.baseDn, {
        scope: "base",
        filter: "(objectClass=*)",
        attributes: ["namingContexts", "dnsHostName"],
        sizeLimit: 1,
      });
      await client.unbind();
      return NextResponse.json({
        ok: true,
        message: "LDAP bind successful.",
        attrs: searchEntries[0] ?? {},
      });
    } catch (ldapErr) {
      await client.unbind().catch(() => {});
      // A failed bind/search is the expected answer from a *test* button, not an
      // internal fault — report why in a 400 instead of an opaque 500.
      console.error("[test-ldap] connection test failed:", ldapErr);
      return NextResponse.json(
        { ok: false, error: { code: "LDAP_TEST_FAILED", message: describeLdapError(ldapErr) } },
        { status: 400 }
      );
    }
  } catch (err) {
    const { status, body } = apiError(err);
    return NextResponse.json(body, { status });
  }
}
