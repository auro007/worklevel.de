import assert from "node:assert/strict";
import { test } from "node:test";
import { guessErrorCodeColumns, guessErrorCodeColumnsFromRows, looksLikeErrorCode } from "../src/lib/errorCodeImport.ts";

test("header names map code, title and description", () => {
  assert.deepEqual(guessErrorCodeColumns(["Fehlercode", "Bezeichnung", "Ursache"]), { code: 0, title: 1, description: 2 });
  assert.deepEqual(guessErrorCodeColumns(["Nr.", "Titel"]), { code: 0, title: 1, description: -1 });
});

test("rows without a header use the column that looks like codes", () => {
  const rows = [["F.22", "Wassermangel", "Druck prüfen"], ["F.28", "Keine Flamme", "Gasversorgung"]];
  assert.deepEqual(guessErrorCodeColumnsFromRows(rows), {
    mapping: { code: 0, title: 1, description: 2 },
    header: false,
  });
});

test("code shape accepts manufacturer codes and rejects sentences", () => {
  for (const value of ["131", "E01", "F.22", "EA.1"]) assert.equal(looksLikeErrorCode(value), true);
  assert.equal(looksLikeErrorCode("Keine Wärme am Vorlauf"), false);
});
