import assert from "node:assert/strict";
import { test } from "node:test";
import { randomBytes } from "node:crypto";
import { encryptMailbox, decryptMailbox } from "../src/lib/mailboxCrypto.ts";
test("mailbox secrets are authenticated and bound to both company and sender", () => {
  process.env.MAILBOX_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const cipher = encryptMailbox("test-password-only", "company-a", "owner@example.test");
  assert.equal(cipher.includes("test-password-only"), false);
  assert.equal(decryptMailbox(cipher, "company-a", "owner@example.test"), "test-password-only");
  assert.throws(() => decryptMailbox(cipher, "company-b", "owner@example.test"));
  assert.throws(() => decryptMailbox(cipher, "company-a", "other@example.test"));
  const pieces = cipher.split(":"); pieces[3] = Buffer.from("tampered").toString("base64");
  assert.throws(() => decryptMailbox(pieces.join(":"), "company-a", "owner@example.test"));
});
