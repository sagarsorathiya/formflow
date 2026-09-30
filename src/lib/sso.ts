/**
 * Windows Integrated SSO (Kerberos/NTLM via IIS Windows Authentication).
 *
 * IIS authenticates the browser on /api/sso/windows only. An ASP.NET bridge page
 * (_authbridge/negotiate.aspx, running inside IIS where the Windows identity is
 * reliably known) forwards it to the internal /api/sso/ticket route as
 * X-SSO-User ("DOMAIN\sam") together with a shared secret in X-SSO-Secret.
 * The app never trusts the user header without the secret.
 *
 * The route does not create a session itself. It mints a short-lived,
 * single-use ticket that the login page redeems through the normal NextAuth
 * "sso" credentials provider, so the JWT is built by the same callbacks as
 * every other sign-in.
 */

import { randomBytes, timingSafeEqual } from "crypto";
import { env } from "./env";

export const SSO_TICKET_TTL_SECONDS = 60;

export function isSsoEnabled(): boolean {
  return !!env.SSO_DOMAIN && !!env.SSO_SHARED_SECRET;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/**
 * Validate the headers IIS stamped on the request. Returns the samAccountName
 * or null. Null covers every failure (disabled, bad secret, wrong domain,
 * malformed name) — callers must not distinguish them to the client.
 */
export function readSsoIdentity(headers: Headers): string | null {
  if (!isSsoEnabled()) return null;

  const secret = headers.get("x-sso-secret") ?? "";
  if (!safeEqual(secret, env.SSO_SHARED_SECRET as string)) return null;

  const raw = (headers.get("x-sso-user") ?? "").trim();
  const sep = raw.indexOf("\\");
  if (sep < 1) return null; // require DOMAIN\user — a bare name has no domain to check

  const domain = raw.slice(0, sep);
  const sam = raw.slice(sep + 1);

  if (domain.toLowerCase() !== (env.SSO_DOMAIN as string).toLowerCase()) return null;
  if (!/^[A-Za-z0-9._$-]{1,64}$/.test(sam)) return null;

  return sam;
}

/**
 * Why readSsoIdentity said no, for the server log only. Never returned to the
 * client, and never includes the secret or the user header verbatim - just
 * which check failed and the (non-secret) domain part.
 */
export function ssoRejectReason(headers: Headers): string {
  if (!isSsoEnabled()) return "SSO not enabled in this process (SSO_DOMAIN / SSO_SHARED_SECRET unset)";
  const secret = headers.get("x-sso-secret");
  if (!secret) return "X-SSO-Secret header missing (request did not come through the IIS bridge)";
  if (!safeEqual(secret, env.SSO_SHARED_SECRET as string)) return "X-SSO-Secret does not match SSO_SHARED_SECRET";
  const raw = (headers.get("x-sso-user") ?? "").trim();
  if (!raw) return "X-SSO-User empty (the ASP.NET bridge saw no Windows identity - is Windows auth enabled on _authbridge?)";
  const sep = raw.indexOf("\\");
  if (sep < 1) return "X-SSO-User has no DOMAIN\ prefix (length " + raw.length + ")";
  const domain = raw.slice(0, sep);
  if (domain.toLowerCase() !== (env.SSO_DOMAIN as string).toLowerCase()) {
    return "domain '" + domain + "' does not match SSO_DOMAIN '" + env.SSO_DOMAIN + "'";
  }
  return "account name failed validation (length " + (raw.length - sep - 1) + ")";
}

async function withRedis<T>(fn: (redis: import("ioredis").default) => Promise<T>): Promise<T> {
  const { default: Redis } = await import("ioredis");
  const redis = new Redis(env.REDIS_URL, { lazyConnect: true, enableOfflineQueue: false });
  try {
    await redis.connect();
    return await fn(redis);
  } finally {
    await redis.quit().catch(() => null);
  }
}

/** Throws if Redis is unreachable — SSO fails closed, unlike the rate limiters. */
export async function createSsoTicket(sam: string): Promise<string> {
  const ticket = randomBytes(32).toString("hex");
  await withRedis((r) => r.setex(`sso:ticket:${ticket}`, SSO_TICKET_TTL_SECONDS, sam));
  return ticket;
}

/** Single use: the ticket is deleted in the same round trip that reads it. */
export async function consumeSsoTicket(ticket: string): Promise<string | null> {
  if (!/^[a-f0-9]{64}$/.test(ticket)) return null;
  const key = `sso:ticket:${ticket}`;
  const res = await withRedis((r) => r.multi().get(key).del(key).exec());
  const value = res?.[0]?.[1];
  return typeof value === "string" && value ? value : null;
}
