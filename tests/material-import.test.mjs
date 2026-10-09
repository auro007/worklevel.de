import assert from "node:assert/strict";
import { test } from "node:test";
import { importNumber, parseDelimited } from "../src/lib/materialImport.ts";

test("German CSV preserves decimal commas and quoted supplier names", () => {
  assert.deepEqual(parseDelimited('\uFEFFName;Preis;Händler\r\n"Rohr; 15 mm";"1.234,56";"Müller, GmbH"'), [
    ["Name", "Preis", "Händler"], ["Rohr; 15 mm", "1.234,56", "Müller, GmbH"],
  ]);
});
test("CSV supports multiline descriptions and escaped quotes", () => {
  assert.deepEqual(parseDelimited('name,price\n"Valve ""A""\nBrass",12.50'), [["name", "price"], ['Valve "A"\nBrass', "12.50"]]);
  assert.throws(() => parseDelimited('Name;Preis\n"incomplete;12'));
});
test("price format is explicit and malformed or negative values are rejected", () => {
  assert.equal(importNumber("1.234,56 €", ","), 1234.56);
  assert.equal(importNumber("1,234.56", "."), 1234.56);
  assert.equal(importNumber("", ","), 0);
  for (const value of ["12.50", "-12", "12 EUR extra", "Infinity", "1,2,3"]) assert.throws(() => importNumber(value, ","));
});
