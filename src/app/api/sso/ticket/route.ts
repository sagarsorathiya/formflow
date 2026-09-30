import { NextResponse } from "next/server";
import { createSsoTicket, readSsoIdentity, ssoRejectReason } from "@/lib/sso";

export const dynamic = "force-dynamic";

/**
 * INTERNAL endpoint - never called by a browser. The public URL is
 * /api/sso/windows, which IIS rewrites to _authbridge/negotiate.aspx; that
 * ASP.NET page runs inside IIS (where the Windows identity is reliably known:
 * URL Rewrite expands {LOGON_USER} before Windows auth runs, so a proxied
 * identity header is always blank) and calls this route over loopback with
 * X-SSO-User and X-SSO-Secret. IIS also 403s /api/sso/ticket from outside.
 * Same pattern as other Node apps behind IIS.
 *
 * The bridge relays this response to the browser, so the login page can call
 * /api/sso/windows with fetch() and treat any failure as "show the password
 * form". Every failure is the same opaque 401 - the client is never told
 * whether the secret, the domain or the account was the problem. Details go to
 * the server log, without the header values.
 */
export async function GET(req: Request) {
  const sam = readSsoIdentity(req.headers);
  if (!sam) {
    console.warn("[sso] rejected:", ssoRejectReason(req.headers));
    return NextResponse.json({ ok: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const ticket = await createSsoTicket(sam);
    return NextResponse.json({ ok: true, ticket }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[sso] could not issue ticket:", err);
    return NextResponse.json({ ok: false }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
