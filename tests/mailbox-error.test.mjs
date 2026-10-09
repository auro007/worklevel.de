import assert from "node:assert/strict";
import { test } from "node:test";
import { mailboxError } from "../src/lib/mailboxError.ts";
test("mailbox errors distinguish credentials, connectivity and encryption without exposing provider details", () => {
  for (const [input, stage, code] of [
    [{ code: "EAUTH" }, "connect", "MAILBOX_AUTH"],
    [{ code: "ETIMEDOUT" }, "send", "MAILBOX_CONNECTION"],
    [{ responseCode: 451 }, "send", "MAILBOX_TEMPORARY"],
    [{ code: "EENVELOPE" }, "send", "MAILBOX_REJECTED"],
    [{}, "decrypt", "MAILBOX_DECRYPT"],
  ]) {
    const result = mailboxError({ ...input, message: "private credential", response: "private address" }, stage);
    assert.equal(result.code, code);
    assert.ok(!JSON.stringify(result).includes("private"));
  }
});
