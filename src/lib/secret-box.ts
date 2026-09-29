/**
 * Symmetric encryption for secrets stored in the database (currently only the
 * LDAP bind password held in SystemSetting).
 *
 * The key is derived from NEXTAUTH_SECRET via scrypt rather than introducing a
 * new required env var — adding one to lib/env.ts would hard-fail startup on
 * every existing deployment until it was set. The trade-off: rotating
 * NEXTAUTH_SECRET makes previously-encrypted values undecryptable, so the LDAP
 * bind password must be re-entered in /admin/settings after such a rotation
 * (decryption fails soft — see decryptSecret — so the app falls back to the
 * .env value instead of crashing).
 *
 * AES-256-GCM. Stored format: v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";
import { env } from "./env";

const FORMAT_PREFIX = "v1";
const SCRYPT_SALT = "formflow.system-setting.v1";

let cachedKey: Buffer | null = null;

function key(): Buffer {
  if (!cachedKey) cachedKey = scryptSync(env.NEXTAUTH_SECRET, SCRYPT_SALT, 32);
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [FORMAT_PREFIX, iv.toString("base64"), tag.toString("base64"), ciphertext.toString("base64")].join(".");
}

/**
 * Returns null rather than throwing when the value can't be decrypted (wrong
 * key after a NEXTAUTH_SECRET rotation, or a corrupted row). Callers treat null
 * as "not configured" and fall back to the environment value, so a bad row
 * degrades LDAP to its .env config instead of taking logins down entirely.
 */
export function decryptSecret(stored: string): string | null {
  try {
    const [prefix, ivB64, tagB64, dataB64] = stored.split(".");
    if (prefix !== FORMAT_PREFIX || !ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}
