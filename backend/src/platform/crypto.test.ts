import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "./crypto";

const key = randomBytes(32).toString("base64");

describe("crypto — refresh tokens at rest", () => {
  it("round-trips a token", () => {
    const token = "1//0abcdefgh-google-refresh-token";
    expect(decrypt(encrypt(token, key), key)).toBe(token);
  });

  it("produces a different ciphertext each time (fresh IV)", () => {
    expect(encrypt("same", key)).not.toBe(encrypt("same", key));
  });

  it("refuses a tampered ciphertext rather than returning garbage", () => {
    const payload = encrypt("secret", key);
    const [iv, tag, ciphertext] = payload.split(":");
    const flipped = Buffer.from(ciphertext!, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    expect(() => decrypt(`${iv}:${tag}:${flipped.toString("base64")}`, key)).toThrow();
  });

  it("refuses the wrong key", () => {
    const payload = encrypt("secret", key);
    expect(() => decrypt(payload, randomBytes(32).toString("base64"))).toThrow();
  });
});
