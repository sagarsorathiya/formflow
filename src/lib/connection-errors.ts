/**
 * Human-readable diagnoses for LDAP / SMTP connection failures.
 *
 * The admin "Test connection" buttons exist to tell an operator what is wrong.
 * Before this, any bind or send failure fell through to the generic error
 * handler and surfaced as a bare HTTP 500 with no message — so a simple wrong
 * password looked identical to the server being on fire. These helpers turn the
 * underlying error into something actionable.
 */

interface ErrorLike {
  message?: string;
  code?: string | number;
  errno?: number;
}

function asErrorLike(err: unknown): ErrorLike {
  return (typeof err === "object" && err !== null ? err : {}) as ErrorLike;
}

/**
 * Active Directory reports the real reason inside the bind error message as
 * "data <hex>", since LDAP result code 49 alone only means "invalid
 * credentials". These sub-codes are what distinguish a wrong password from a
 * locked or expired account.
 */
const AD_SUBCODES: Record<string, string> = {
  "525": "The service account was not found in the directory. Check the Bind DN.",
  "52e": "Invalid credentials — the password for this service account is incorrect.",
  "530": "Account not permitted to log on at this time.",
  "531": "Account not permitted to log on from this workstation.",
  "532": "The service account's password has expired.",
  "533": "The service account is disabled.",
  "701": "The service account has expired.",
  "773": "The service account must reset its password before it can bind.",
  "775": "The service account is locked out.",
};

function networkHint(e: ErrorLike): string | null {
  switch (e.code) {
    case "ECONNREFUSED":
      return "Connection refused — nothing is listening on that host/port.";
    case "ETIMEDOUT":
    case "ETIME":
      return "Connection timed out — the host is unreachable or blocked by a firewall.";
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "Host not found — check the hostname or DNS.";
    case "ECONNRESET":
      return "Connection reset by the server. If using ldaps://, confirm the port really speaks TLS.";
    case "EHOSTUNREACH":
    case "ENETUNREACH":
      return "Host unreachable — check network routing to that address.";
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
    case "UNABLE_TO_VERIFY_LEAF_SIGNATURE":
      return "The server's TLS certificate could not be verified. Enable \"Allow insecure TLS\" if this is an internal self-signed certificate.";
    default:
      return null;
  }
}

export function describeLdapError(err: unknown): string {
  const e = asErrorLike(err);
  const message = e.message ?? "";

  const net = networkHint(e);
  if (net) return net;

  const subcode = /data ([0-9a-f]{3})/i.exec(message)?.[1]?.toLowerCase();
  if (subcode && AD_SUBCODES[subcode]) return AD_SUBCODES[subcode];

  // LDAP result codes that survive without an AD sub-code.
  if (e.code === 49) return "Invalid credentials — check the Bind DN and password.";
  if (e.code === 32) return "The Base DN does not exist on this directory server.";
  if (e.code === 34) return "The Bind DN is not a valid distinguished name.";
  if (e.code === 8) return "The server requires a stronger authentication method (try ldaps://).";

  return message || "LDAP connection failed.";
}

export function describeSmtpError(err: unknown): string {
  const e = asErrorLike(err);
  const message = e.message ?? "";

  const net = networkHint(e);
  if (net) return net;

  if (e.code === "EENVELOPE") return "The relay rejected the sender or recipient address.";
  if (e.code === "EAUTH") return "The relay requires authentication, which this app does not send.";
  if (e.code === "EMESSAGE") return "The relay rejected the message content.";
  if (e.code === "ESOCKET") return "Socket error talking to the relay — check the host, port and TLS settings.";

  return message || "Sending the test email failed.";
}
