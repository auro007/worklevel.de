"use client";

import { useOnlineStatus } from "@/lib/useOnlineStatus";

/** Clear offline notice on Techniker — read-only shell, no fake writes. */
export default function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;

  return (
    <aside className="offlineBanner" role="status" aria-live="polite">
      <div className="offlineBannerBody">
        <strong>Offline — schwaches oder kein Netz</strong>
        <span>
          Die App-Shell bleibt nutzbar. Auftragsdaten und Speichern (Zeit, Fotos, Material, Unterschrift)
          brauchen Verbindung. Bitte nichts speichern, bis wieder online.
        </span>
      </div>
    </aside>
  );
}
