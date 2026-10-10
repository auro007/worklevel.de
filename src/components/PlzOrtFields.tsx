"use client";

import { useRef, useState } from "react";
import { lookupGermanPostal } from "@/lib/germanPostal";

export function PlzOrtFields({
  postalCode,
  city,
  onChange,
}: {
  postalCode: string;
  city: string;
  onChange: (postalCode: string, city: string) => void;
}) {
  const [options, setOptions] = useState<string[]>([]);
  const request = useRef(0);

  function changePostal(value: string) {
    const nextPostal = value.replace(/\D/g, "").slice(0, 5);
    onChange(nextPostal, city);
    if (nextPostal.length !== 5) {
      setOptions([]);
      return;
    }
    const id = ++request.current;
    lookupGermanPostal(nextPostal)
      .then((found) => {
        if (id !== request.current || !found) return;
        setOptions(found.options.length > 1 ? found.options : []);
        onChange(nextPostal, found.city);
      })
      .catch(() => {});
  }

  const several = options.length > 1;
  const selectOptions = several && city && !options.includes(city) ? [city, ...options] : options;

  return (
    <>
      <div className="formField">
        <label>PLZ</label>
        <input
          className="input"
          inputMode="numeric"
          autoComplete="postal-code"
          value={postalCode}
          onChange={(e) => changePostal(e.target.value)}
        />
      </div>
      <div className="formField">
        <label>Ort</label>
        {several ? (
          <select className="select" value={city} onChange={(e) => onChange(postalCode, e.target.value)}>
            {selectOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        ) : (
          <input
            className="input"
            autoComplete="address-level2"
            value={city}
            onChange={(e) => onChange(postalCode, e.target.value)}
          />
        )}
      </div>
    </>
  );
}
