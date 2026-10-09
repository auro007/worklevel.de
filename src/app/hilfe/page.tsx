"use client";

import Link from "next/link";

export default function HilfePage() {
  return (
    <main className="page phoneMenu">
      <h1>Hilfe</h1>
      <div className="phoneMenuCard phoneHelp">
        <p><strong>Start</strong> zeigt die offenen Aufträge, offenen Rechnungen und was heute ansteht.</p>
        <p><strong>Aufträge</strong> listet die Aufträge. Ein Auftrag öffnet die Auftragsakte. Mit Plus legen Sie einen neuen Auftrag an.</p>
        <p><strong>Kunden</strong> ist die Kontaktliste. Ein Kunde öffnet seine Objekte.</p>
        <p><strong>Mehr</strong> öffnet Rechnungen, Zahlungen, Kontakte und die übrigen Büroseiten.</p>
        <p>Eine <strong>E-Rechnung</strong> ist die normale Rechnung mit einer ZUGFeRD-Datei im PDF. Dafür brauchen Firma und Kunde PLZ, Ort und eine Steuernummer.</p>
        <p><Link href="/mehr">Zurück zu Mehr</Link></p>
      </div>
    </main>
  );
}
