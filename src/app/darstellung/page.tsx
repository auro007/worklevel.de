"use client";

import ThemeSwitch from "@/components/ThemeSwitch";
import { PageHeader } from "@/components/UI";

export default function DarstellungPage() {
  return (
    <main className="page">
      <PageHeader title="Darstellung" subtitle="Heller oder dunkler Modus für dieses Gerät" />
      <section className="settingsCard themeSettings">
        <h2>Erscheinungsbild</h2>
        <p className="themeSettingsNote">Die Auswahl bleibt in diesem Browser gespeichert.</p>
        <ThemeSwitch />
      </section>
    </main>
  );
}
