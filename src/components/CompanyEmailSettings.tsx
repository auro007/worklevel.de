"use client";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";

export default function CompanyEmailSettings({ companyId }: { companyId: string }) {
  const [email, setEmail] = useState(""); const [provider, setProvider] = useState("gmx");
  const [password, setPassword] = useState(""); const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false); const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function request(method = "GET") {
    const db = getSupabaseClient(); if (!db) throw new Error("Nicht angemeldet.");
    const { data } = await db.auth.getSession();
    const response = await fetch(`/api/company-email?company=${encodeURIComponent(companyId)}`, {
      method, headers: { Authorization: `Bearer ${data.session?.access_token || ""}`, "Content-Type": "application/json" },
      ...(method === "POST" ? { body: JSON.stringify({ provider, password }) } : {}),
    });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || "Verbindung fehlgeschlagen."); return result;
  }
  useEffect(() => {
    let cancelled = false;
    request().then(r => { if (cancelled) return; setEmail(r.email); setConnected(r.connected); setReady(r.ready); setProvider(r.provider || (r.email.endsWith("@gmail.com") ? "gmail" : r.email.endsWith("@web.de") ? "webde" : "gmx")); })
      .catch(e => { if (!cancelled) setMessage(e.message); });
    return () => { cancelled = true; };
  }, [companyId]);
  async function update(method: "POST" | "DELETE" | "PATCH") {
    if (method === "POST" && !ready) { setMessage("Die Postfach-Einstellungen sind noch nicht bereit. Bitte lade die Seite neu und versuche es erneut."); return; }
    if (method === "POST" && !password) { setMessage("Bitte gib das Passwort deines E-Mail-Postfachs oder ein App-Passwort ein. Gemeint ist nicht dein WORKLEVEL-Passwort."); return; }
    setBusy(true); setMessage("");
    try { const r = await request(method); setConnected(r.connected); setPassword(""); setMessage(r.verified ? "Gespeichertes Passwort erfolgreich geprüft. Die Anmeldung beim E-Mail-Anbieter funktioniert jetzt. Keine erneute Passworteingabe nötig." : r.connected ? "Postfach gespeichert und geprüft. Du musst das Passwort nicht bei jedem Versand eingeben." : "Postfach-Verbindung entfernt."); }
    catch (e) { setMessage(e instanceof Error ? e.message : "Verbindung fehlgeschlagen."); }
    finally { setBusy(false); }
  }
  return <section className="settingsCard"><h2>Firmenpostfach für PDF-Versand</h2>
    <p>Absender: <strong>{email || "Registrierte Adresse des Chef/Inhabers"}</strong></p>
    <p>{connected ? "Postfach gespeichert" : "Noch nicht verbunden"}</p>
    {connected && <p>Dein Passwort ist gespeichert. Das leere Feld ist normal. Mit „Gespeicherte Verbindung prüfen“ kannst du die Anmeldung ohne erneute Passworteingabe testen.</p>}
    <p>Verbinde das Postfach des registrierten Inhabers. WORKLEVEL speichert das Passwort verschlüsselt und verwendet es für den Versand von Rechnungen, Angeboten und Lieferscheinen.</p>
    <label className="formField">E-Mail-Anbieter<select className="select" value={provider} onChange={e => setProvider(e.target.value)} disabled={busy}>
      <option value="gmx">GMX Deutschland / Österreich / Schweiz</option><option value="gmx-com">GMX.com</option><option value="webde">WEB.DE</option><option value="gmail">Gmail / Google Workspace (App-Passwort)</option><option value="yahoo">Yahoo (App-Passwort)</option>
    </select></label>
    <label className="formField">Postfach- oder App-Passwort<input className="input" type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} disabled={busy} placeholder="Nur hier eingeben, niemals im Chat" /></label>
    <p>Bei GMX zuerst den Zugriff für E-Mail-Programme aktivieren. Bei Zwei-Faktor-Anmeldung ein App-Passwort verwenden. <a href="https://hilfe.gmx.net/pop-imap/pop3/serverdaten.html" target="_blank" rel="noreferrer">GMX-Anleitung</a></p>
    <p>Andere Anbieter, einschließlich Microsoft 365/Outlook, benötigen eine separate Einrichtung. Bis dahin bleibt „PDF mit E-Mail-App teilen“ verfügbar.</p>
    {!ready && <p>Die sichere Postfach-Einrichtung wird noch vorbereitet.</p>}
    {message && <p role="status">{message}</p>}
    <div className="formActions">
      {connected && <button type="button" className="primaryBtn" disabled={busy} onClick={() => void update("PATCH")}>{busy ? "Prüft…" : "Gespeicherte Verbindung prüfen"}</button>}
      <button type="button" className="ghostBtn" disabled={busy} onClick={() => void update("POST")}>{busy ? "Prüft…" : connected ? "Passwort ersetzen und prüfen" : "Verbindung prüfen und speichern"}</button>
      {connected && <button type="button" className="ghostBtn" disabled={busy} onClick={() => void update("DELETE")}>Verbindung entfernen</button>}</div>
  </section>;
}
