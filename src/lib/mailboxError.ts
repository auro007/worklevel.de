// Return only classified errors: SMTP responses can contain private addresses.
export function mailboxError(error: unknown, stage: "decrypt" | "connect" | "send") {
  if (stage === "decrypt") return { code: "MAILBOX_DECRYPT", error: "WORKLEVEL kann das gespeicherte Postfach-Passwort nicht öffnen. Die Server-Konfiguration muss geprüft werden. Dein Passwort läuft nicht automatisch ab." };
  const e = error as { code?: string; responseCode?: number } | null;
  if (e?.code === "EAUTH") return { code: "MAILBOX_AUTH", error: "Der E-Mail-Anbieter lehnt die Anmeldung ab. Bitte die Freigabe für E-Mail-Programme und das App-Passwort beim Anbieter prüfen. Die gespeicherte Verbindung bleibt erhalten." };
  if (["ETIMEDOUT", "ECONNECTION", "ESOCKET", "EDNS", "ECONNRESET", "ECONNREFUSED"].includes(e?.code || "")) return { code: "MAILBOX_CONNECTION", error: "Die Verbindung zum E-Mail-Anbieter wurde unterbrochen oder ist nicht erreichbar. Das gespeicherte Passwort bleibt erhalten; keine erneute Eingabe nötig. Bei einem Sendeversuch vor Wiederholung den Empfang prüfen." };
  if (e?.responseCode && e.responseCode >= 400 && e.responseCode < 500) return { code: "MAILBOX_TEMPORARY", error: "Der E-Mail-Anbieter hat den Vorgang vorübergehend abgelehnt. Bitte später erneut versuchen. Das gespeicherte Passwort bleibt erhalten." };
  if (e?.code === "EENVELOPE" || e?.code === "EMESSAGE") return { code: "MAILBOX_REJECTED", error: "Der E-Mail-Anbieter hat Absender, Empfänger oder Nachricht abgelehnt. Bitte Empfänger und Anhang prüfen; das Passwort muss dafür nicht neu eingegeben werden." };
  return { code: "MAILBOX_FAILED", error: "Die Postfach-Prüfung oder der Versand ist fehlgeschlagen. Bitte die gespeicherte Verbindung unter Firmendaten prüfen. Vor erneutem Senden den Empfang prüfen." };
}
