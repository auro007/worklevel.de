import assert from "node:assert/strict";
import { test } from "node:test";
import { choosePostalCity, localitiesFromOpenPlz, lookupGermanPostal } from "../src/lib/germanPostal.ts";

const plz49757 = [
  { postalCode: "49757", name: "Lahn", municipality: { key: "03454027", name: "Lahn", type: "Kreisangehörige Gemeinde" } },
  { postalCode: "49757", name: "Vrees", municipality: { key: "03454055", name: "Vrees", type: "Kreisangehörige Gemeinde" } },
  { postalCode: "49757", name: "Werlte", municipality: { key: "03454057", name: "Werlte, Stadt", type: "Stadt" } },
];

test("49757 fills the Stadt and keeps the other places", () => {
  const chosen = choosePostalCity(localitiesFromOpenPlz(plz49757));
  assert.equal(chosen.city, "Werlte");
  assert.deepEqual(chosen.options, ["Lahn", "Vrees", "Werlte"]);
});

test("a single place is the Ort", () => {
  const chosen = choosePostalCity(localitiesFromOpenPlz([
    { name: "Vreden", municipality: { name: "Vreden, Stadt", type: "Stadt" } },
  ]));
  assert.equal(chosen.city, "Vreden");
  assert.deepEqual(chosen.options, ["Vreden"]);
});

test("villages of one municipality use that municipality", () => {
  const chosen = choosePostalCity([
    { name: "Nord", municipalityName: "Beispiel, Stadt", municipalityType: "Stadt" },
    { name: "Süd", municipalityName: "Beispiel, Stadt", municipalityType: "Stadt" },
  ]);
  assert.equal(chosen.city, "Beispiel");
});

test("lookup of 49757 returns Werlte", async () => {
  const found = await lookupGermanPostal("49757");
  assert.equal(found?.city, "Werlte");
  assert.ok(found?.options.includes("Vrees"));
});
