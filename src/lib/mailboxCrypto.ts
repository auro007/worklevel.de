import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key() {
  const value = Buffer.from(process.env.MAILBOX_ENCRYPTION_KEY || "", "base64");
  if (value.length !== 32) throw new Error("Postfach-Verbindung ist auf dem Server noch nicht eingerichtet.");
  return value;
}
export function encryptMailbox(password: string, companyId: string, email: string) {
  const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", key(), iv);
  cipher.setAAD(Buffer.from(`${companyId}:${email}`));
  const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}
export function decryptMailbox(value: string, companyId: string, email: string) {
  const [version, iv, tag, encrypted] = value.split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Postfach bitte erneut verbinden.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAAD(Buffer.from(`${companyId}:${email}`)); decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}
