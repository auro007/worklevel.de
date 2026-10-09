"use client";

import { useEffect, useState } from "react";

export const THEME_STORAGE_KEY = "worklevel:theme";
export type Theme = "dark" | "light";

const options: { id: Theme; title: string; description: string }[] = [
  { id: "dark", title: "Dunkel", description: "Dunkle Oberfläche, wie bisher." },
  { id: "light", title: "Hell", description: "Normaler heller Modus für den Alltag." },
];

function isTheme(value: string | null): value is Theme {
  return value === "dark" || value === "light";
}

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export default function ThemeSwitch() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    const next = isTheme(stored) ? stored : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
  }, []);

  function choose(next: Theme) {
    setTheme(next);
    applyTheme(next);
  }

  return (
    <div className="themeChoices" role="group" aria-label="Erscheinungsbild">
      {options.map((option) => {
        const selected = theme === option.id;
        return (
          <button
            key={option.id}
            type="button"
            className={`themeChoice${selected ? " selected" : ""}`}
            aria-pressed={selected}
            onClick={() => choose(option.id)}
          >
            <span className={`themeSwatch ${option.id}`} aria-hidden="true" />
            <span>
              <strong>{option.title}</strong>
              <span>{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
