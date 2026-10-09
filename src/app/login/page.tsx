"use client";

import { FormEvent, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase";
import { formatCloudError } from "@/lib/utils";
import styles from "./login.module.css";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Die Anmeldung ist momentan nicht verfügbar. Bitte versuche es später erneut.");
      setBusy(false);
      return;
    }

    try {
      if (mode === "reset") {
        const redirectTo = `${window.location.origin}/login/neues-passwort`;
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (error && !/user not found|email not found/i.test(error.message)) setError(formatCloudError(error.message));
        else setMessage("Wenn ein Konto zu dieser E-Mail existiert, haben wir einen Link zum Zurücksetzen geschickt. Schau auch im Spam-Ordner nach.");
      } else if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) setError(formatCloudError(error.message));
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) setError(formatCloudError(error.message));
        else if (!data.session) setMessage("Konto erstellt. Prüfe deine E-Mail und bestätige den Link, danach kannst du dich anmelden.");
        else setMessage("Konto erstellt. Du wirst angemeldet.");
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? "");
      setError(formatCloudError(raw || "Failed to fetch"));
    }

    setBusy(false);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a href="/login" className={styles.brand} aria-label="WORKLEVEL Startseite">WORK<span>LEVEL</span><i aria-hidden="true">↗</i></a>
        <span className={styles.headerNote}>Fürs Handwerk gemacht.</span>
      </header>
      <div className={styles.layout}>
        <section className={styles.story} aria-labelledby="product-heading">
          <p className={styles.eyebrow}><span /> DEIN BETRIEB. DEIN ÜBERBLICK.</p>
          <h1 id="product-heading">Gutes Handwerk.<br />Klare Abläufe.<br /><em>Mehr geschafft.</em></h1>
          <p className={styles.description}>Von der ersten Anfrage bis zur fertigen Rechnung. Organisiere Aufträge, Team und Material an einem Ort.</p>
          <div className={styles.features}>
            <div><span aria-hidden="true">01</span><p><strong>Aufträge im Griff</strong><small>Planen. Zuweisen. Erledigen.</small></p></div>
            <div><span aria-hidden="true">02</span><p><strong>Zeit, die zählt</strong><small>Fahrten und Arbeitszeiten erfassen.</small></p></div>
            <div><span aria-hidden="true">03</span><p><strong>Vom Einsatz zur Rechnung</strong><small>Material und Leistungen zusammenbringen.</small></p></div>
          </div>
          <div className={styles.blueprint} aria-hidden="true"><div /><div /><div /><span>PLANEN → ANPACKEN → ABSCHLIESSEN</span></div>
        </section>
        <section className={styles.card} aria-labelledby="login-heading">
          <div className={styles.cardTop}><span className={styles.mark} aria-hidden="true">W<span>↗</span></span><span>DEIN WORKSPACE</span></div>
          <h2 id="login-heading">{mode === "reset" ? "Passwort zurücksetzen." : mode === "login" ? "Willkommen zurück." : "Dein nächster Schritt."}</h2>
          <p className={styles.subtitle}>{mode === "reset" ? "Wir schicken dir einen Link. Damit wählst du ein neues Passwort." : mode === "login" ? "Melde dich an und bring deinen Arbeitstag auf Kurs." : "Erstelle dein Konto und organisiere deinen Betrieb mit WORKLEVEL."}</p>
          <form onSubmit={submit} className={styles.form}>
            <label htmlFor="login-email">E-Mail-Adresse</label>
            <input id="login-email" name="email" type="email" autoComplete="email" required disabled={busy} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@firma.de" />
            {mode !== "reset" && (
              <>
                <label htmlFor="login-password">Passwort</label>
                <div className={styles.password}>
                  <input id="login-password" name="password" type={showPassword ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} required minLength={6} disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "login" ? "Dein Passwort" : "Mindestens 6 Zeichen"} />
                  <button type="button" aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Verbergen" : "Anzeigen"}</button>
                </div>
              </>
            )}
            {mode === "login" && <button className={styles.forgot} type="button" disabled={busy} onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>Passwort vergessen?</button>}
            {error && <div className={styles.error} role="alert">{error}</div>}
            {message && <div className={styles.message} role="status">{message}</div>}
            <button className={styles.submit} disabled={busy}>{busy ? "Bitte warten…" : mode === "reset" ? "Link senden" : mode === "login" ? "Anmelden" : "Konto erstellen"}<span aria-hidden="true">↗</span></button>
          </form>
          <div className={styles.switchRow}><span>{mode === "login" ? "Neu bei WORKLEVEL?" : "Du hast schon ein Konto?"}</span><button disabled={busy} type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setShowPassword(false); setError(""); setMessage(""); }}>{mode === "login" ? "Konto erstellen" : "Anmelden"}</button></div>
          <div className={styles.cardFoot}><span aria-hidden="true">◇</span> Dein Büro. Auch unterwegs.</div>
        </section>
      </div>
      <footer className={styles.footer}><span>WORKLEVEL · Handwerk & Service</span><span>Weniger Verwaltung. Mehr Handwerk.</span></footer>
    </main>
  );
}
