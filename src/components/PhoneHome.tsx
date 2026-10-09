"use client";

import Link from "next/link";

export type PhoneTodayItem = {
  id: string;
  title: string;
  who: string;
  when: string;
  href: string;
  kind: "doc" | "truck";
};

function DocIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></svg>;
}
function EuroIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 6.5A6 6 0 0 0 8 8.2V16a6 6 0 0 0 9 1.5M6 10h8M6 14h8" /></svg>;
}
function TruckIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h11v8H3zM14 10h4l3 3v2h-7z" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></svg>;
}
function BellIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5" /><path d="M9 17a3 3 0 0 0 6 0" /></svg>;
}

export default function PhoneHome({
  openJobs,
  openInvoices,
  loading,
  alert,
  today,
  error,
}: {
  openJobs: number;
  openInvoices: number;
  loading: boolean;
  alert: boolean;
  today: PhoneTodayItem[];
  error: string;
}) {
  const count = (value: number) => (loading ? "…" : String(value));

  return (
    <main className="phoneHome phoneOnly">
      <header className="phoneTop">
        <div className="phoneBrand">WORK<span>LEVEL</span></div>
        <Link className={alert ? "phoneBell hasDot" : "phoneBell"} href="/mahnungen" aria-label="Mahnungen">
          <BellIcon />
        </Link>
      </header>
      {error && <div className="phoneError">{error}</div>}
      <div className="phoneStats">
        <Link href="/auftraege" className="phoneStat">
          <span className="phoneStatIcon"><DocIcon /></span>
          <strong>{count(openJobs)}</strong>
          <span>Aufträge</span>
        </Link>
        <Link href="/rechnungen" className="phoneStat">
          <span className="phoneStatIcon euro"><EuroIcon /></span>
          <strong>{count(openInvoices)}</strong>
          <span>Rechnungen offen</span>
        </Link>
      </div>
      <Link className="phoneOfferBtn" href="/angebote">+ Neues Angebot</Link>
      <div className="phoneSectionHead">
        <h2>Heute wichtig</h2>
        <Link href="/heute">Alle anzeigen</Link>
      </div>
      {today.length === 0 ? (
        <div className="phoneEmpty">Für heute ist nichts eingetragen.</div>
      ) : today.map((item) => (
        <Link className="phoneTask" href={item.href} key={item.id}>
          <span className={item.kind === "truck" ? "phoneTaskIcon truck" : "phoneTaskIcon"}>
            {item.kind === "truck" ? <TruckIcon /> : <DocIcon />}
          </span>
          <span className="phoneTaskText">
            <strong>{item.title}</strong>
            <em>{item.who}</em>
            <small>{item.when}</small>
          </span>
          <span className="phoneChevron" aria-hidden="true">›</span>
        </Link>
      ))}
    </main>
  );
}
