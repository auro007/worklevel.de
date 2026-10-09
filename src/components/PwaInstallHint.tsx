"use client";

import { useEffect, useState } from "react";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const ios = "standalone" in window.navigator && Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || ios;
}

/** Small „Zum Home-Bildschirm“ hint on /techniker when not running as installed PWA. */
export default function PwaInstallHint() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isStandaloneDisplay()) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <aside className="pwaInstallHint" role="note">
      <div className="pwaInstallHintBody">
        <strong>App installieren — Feldtauglich</strong>
        <span>
          iPhone: Teilen → „Zum Home-Bildschirm“. Android: Browser-Menü → „App installieren“ /
          „Zum Startbildschirm hinzufügen“. Offline bleibt die Shell von /techniker und /login —
          Auftragsdaten und Speichern brauchen weiterhin Netz.
        </span>
      </div>
      <button type="button" className="ghostBtn smallBtn" onClick={() => setVisible(false)} aria-label="Hinweis schließen">
        Schließen
      </button>
    </aside>
  );
}
