"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthProvider";
import { getSupabaseClient } from "@/lib/supabase";
import { formatCloudError } from "@/lib/utils";
import styles from "../login.module.css";

export default function NewPasswordPage() {
  const { user, loading, clearRecovery, signOut } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 6) {
      setError("Das Passwort muss mindestens 6 Zeichen haben.");
      return;
    }
    if (password !== confirm) {
      setError("Die beiden Passwörter stimmen nicht überein.");
      return;
    }
    const supabase = getSupabaseClient();
    if (!supabase) {
      setError("Die Anmeldung ist momentan nicht verfügbar. Bitte versuche es später erneut.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (updateError) {
      setError(formatCloudError(updateError.message));
      return;
    }
    clearRecovery();
    setMessage("Dein Passwort wurde gespeichert.");
    router.replace("/");
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/login" className={styles.brand} aria-label="WORKLEVEL Startseite">WORK<span>LEVEL</span><i aria-hidden="true">↗</i></Link>
        <span className={styles.headerNote}>Fürs Handwerk gemacht.</span>
      </header>
      <div className={styles.layout}>
        <section className={styles.story} aria-labelledby="product-heading">
          <p className={styles.eyebrow}><span /> DEIN BETRIEB. DEIN ÜBERBLICK.</p>
          <h1 id="product-heading">Gutes Handwerk.<br />Klare Abläufe.<br /><em>Mehr geschafft.</em></h1>
          <p className={styles.description}>Wähle ein neues Passwort. Danach bist du wieder in WORKLEVEL angemeldet.</p>
        </section>
        <section className={styles.card} aria-labelledby="reset-heading">
          <div className={styles.cardTop}><span className={styles.mark} aria-hidden="true">W<span>↗</span></span><span>DEIN WORKSPACE</span></div>
          <h2 id="reset-heading">Neues Passwort.</h2>
          <p className={styles.subtitle}>{loading ? "Link wird geprüft…" : user ? "Lege jetzt dein neues Passwort fest." : "Der Link ist ungültig oder abgelaufen. Fordere einen neuen an."}</p>
          {user ? (
            <form onSubmit={submit} className={styles.form}>
              <label htmlFor="new-password">Neues Passwort</label>
              <div className={styles.password}>
                <input id="new-password" name="password" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} disabled={busy} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mindestens 6 Zeichen" />
                <button type="button" aria-label={showPassword ? "Passwort verbergen" : "Passwort anzeigen"} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)}>{showPassword ? "Verbergen" : "Anzeigen"}</button>
              </div>
              <label htmlFor="confirm-password">Passwort bestätigen</label>
              <input id="confirm-password" name="confirm" type={showPassword ? "text" : "password"} autoComplete="new-password" required minLength={6} disabled={busy} value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Passwort wiederholen" />
              {error && <div className={styles.error} role="alert">{error}</div>}
              {message && <div className={styles.message} role="status">{message}</div>}
              <button className={styles.submit} disabled={busy || loading}>{busy ? "Bitte warten…" : "Passwort speichern"}<span aria-hidden="true">↗</span></button>
            </form>
          ) : (
            !loading && <div className={styles.switchRow}><Link href="/login">Neuen Link anfordern</Link></div>
          )}
          {user && (
            <div className={styles.switchRow}>
              <button type="button" disabled={busy} onClick={() => { clearRecovery(); void signOut(); }}>Abbrechen</button>
            </div>
          )}
          <div className={styles.cardFoot}><span aria-hidden="true">◇</span> Dein Büro. Auch unterwegs.</div>
        </section>
      </div>
    </main>
  );
}
