import assert from "node:assert/strict";
import { test } from "node:test";
import { hoursWithin } from "../src/lib/profileMetrics.ts";
test("time is clipped at period boundaries and running entries stop at now", () => {
  const start = new Date("2026-09-01T00:00:00Z"), now = new Date("2026-09-01T03:00:00Z");
  assert.equal(hoursWithin([
    { started_at: "2026-08-31T23:00:00Z", ended_at: "2026-09-01T01:00:00Z" },
    { started_at: "2026-09-01T02:00:00Z", ended_at: null },
    { started_at: "2026-09-02T00:00:00Z", ended_at: null },
  ], start, now), 2);
});
test("elapsed hours use actual timestamps across daylight-saving changes", () => {
  const start = new Date("2026-10-25T01:00:00+02:00"), end = new Date("2026-10-25T04:00:00+01:00");
  assert.equal(hoursWithin([{ started_at: start.toISOString(), ended_at: end.toISOString() }], start, end), 4);
});
