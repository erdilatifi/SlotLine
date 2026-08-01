import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/**
 * AES-256-GCM with the key held outside the database (an environment
 * variable), so a database dump on its own is not enough to recover live
 * calendar credentials (handbook Ch. 14.1). GCM is authenticated, so a
 * tampered ciphertext fails to decrypt rather than returning garbage.
 *
 * Stored as iv:tag:ciphertext, all base64.
 */
export function encrypt(plaintext: string, keyBase64: string): string {
  const key = Buffer.from(keyBase64, "base64");
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decrypt(payload: string, keyBase64: string): string {
  const [ivB64, tagB64, ciphertextB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !ciphertextB64) throw new Error("Malformed encrypted payload");

  const decipher = createDecipheriv(
    ALGORITHM,
    Buffer.from(keyBase64, "base64"),
    Buffer.from(ivB64, "base64"),
  );
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
