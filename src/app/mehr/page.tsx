"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthProvider";
import { useCompany } from "@/context/CompanyProvider";

function Tile({ href, label }: { href: string; label: string }) {
  return <Link className="phoneTile" href={href}><span>{label}</span></Link>;
}

function Row({ href, label, icon }: { href: string; label: string; icon: "doc" | "euro" | "people" | "gear" | "help" | "box" }) {
  return (
    <Link className="phoneMenuRow" href={href}>
      <span className="phoneMenuIcon" aria-hidden="true">
        {icon === "doc" && <svg viewBox="0 0 24 24"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v6h6" /></svg>}
        {icon === "euro" && <svg viewBox="0 0 24 24"><path d="M17 6.5A6 6 0 0 0 8 8.2V16a6 6 0 0 0 9 1.5M6 10h8M6 14h8" /></svg>}
        {icon === "people" && <svg viewBox="0 0 24 24"><path d="M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20" /><circle cx="9" cy="8" r="3" /></svg>}
        {icon === "gear" && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
        {icon === "help" && <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1.2.9-1.2 1.6V14" /><path d="M12 17h.01" /></svg>}
        {icon === "box" && <svg viewBox="0 0 24 24"><path d="M21 8 12 3 3 8l9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /></svg>}
      </span>
      <span>{label}</span>
      <span className="phoneChevron" aria-hidden="true">›</span>
    </Link>
  );
}

export default function MehrPage() {
  const { role } = useCompany();
  const { signOut } = useAuth();
  const owner = role === "owner";

  return (
    <main className="page phoneMenu">
      <h1>Mehr</h1>
      <h2>Finanzen</h2>
      <div className="phoneMenuCard">
        <Row href="/rechnungen" label="Rechnungen" icon="doc" />
        <Row href="/zahlungen" label="Zahlungen" icon="euro" />
      </div>
      <h2>Verwaltung</h2>
      <div className="phoneMenuCard">
        <Row href="/kunden" label="Kontakte" icon="people" />
        <Row href="/darstellung" label="Darstellung" icon="gear" />
        <Row href={owner ? "/firmendaten" : "/team"} label="Einstellungen" icon="gear" />
        <Row href="/hilfe" label="Hilfe" icon="help" />
      </div>
      <h2>Büro</h2>
      <div className="phoneTileGrid">
        <Tile href="/angebote" label="Angebote" />
        <Tile href="/lieferscheine" label="Lieferscheine" />
        <Tile href="/techniker" label="Techniker" />
        <Tile href="/plantafel" label="Plantafel" />
        <Tile href="/wiederkehrend" label="Wiederkehrend" />
        <Tile href="/fehlercodes" label="Fehlercodes" />
        <Tile href="/geraete" label="Geräte" />
        <Tile href="/vorlagen" label="Vorlagen" />
        <Tile href="/material" label="Material" />
        <Tile href="/bestellungen" label="Bestellungen" />
        <Tile href="/mahnungen" label="Mahnungen" />
        <Tile href="/nachkalkulation" label="Nachkalkulation" />
        <Tile href="/versand" label="Versand" />
        <Tile href="/mitarbeiter" label="Mitarbeiter" />
        <Tile href="/profil" label="Mein Profil" />
        {owner && <Tile href="/team" label="Team" />}
      </div>
      <button type="button" className="phoneLogout" onClick={() => signOut()}>Abmelden</button>
    </main>
  );
}
