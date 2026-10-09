import Link from "next/link";

export default function NotFound() {
  return (
    <main className="page">
      <h1 style={{ color: "var(--text)", fontSize: 28, margin: "12px 0" }}>Seite nicht gefunden</h1>
      <p style={{ color: "var(--text)", maxWidth: 460 }}>Diese Adresse gibt es in WORKLEVEL nicht.</p>
      <Link className="primaryBtn" href="/">Zum Dashboard</Link>
    </main>
  );
}
