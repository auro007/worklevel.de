import assert from "node:assert/strict";
import { test } from "node:test";
import { readAllRows } from "../src/lib/readAllRows.ts";

test("catalogue reads past 1,000 rows even with a smaller server cap", async () => {
  const source = Array.from({ length: 1207 }, (_, id) => ({ id }));
  const result = await readAllRows(async (from, to) => ({
    data: source.slice(from, Math.min(to + 1, from + 200)), error: null,
  }));
  assert.deepEqual(result.data, source);
  assert.equal(result.error, null);
});

test("later page failure never supplies an incomplete duplicate-check catalogue", async () => {
  const failure = { message: "Connection interrupted" };
  const result = await readAllRows(async from => from === 0
    ? { data: [{ id: 1 }], error: null }
    : { data: null, error: failure });
  assert.equal(result.data, null);
  assert.equal(result.error, failure);
});
