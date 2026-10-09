export function uid(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function euro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export function deNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE").format(new Date(`${value}T12:00:00`));
}

export function initials(name: string) {
  return name.split(/\s+/).map((x) => x[0]).join("").slice(0, 2).toUpperCase();
}

/** Map common Supabase/Postgres errors to short German guidance for non-developers. */
export function formatCloudError(raw: string | null | undefined): string {
  const msg = String(raw ?? "").trim();
  if (!msg) return "Unbekannter Fehler. Bitte erneut versuchen.";
  const m = msg.toLowerCase();

  if (
    m.includes("supplier_id") ||
    m.includes("enforce_procurement_company_links") ||
    m.includes('record "new" has no field') ||
    m.includes("record new has no field")
  ) {
    return "Datenbank-Trigger veraltet (supplier_id). Bitte in Supabase einmal HOTFIX-V12.2.2-TRIGGER-CLEANUP.sql ausführen und die Seite neu laden.";
  }
  if (m.includes("leads") && (m.includes("does not exist") || m.includes("could not find the table") || m.includes("schema cache"))) {
    return "Leads-Tabelle fehlt. Bitte in Supabase einmal SETUP-WORKLEVEL-V12.5-LEADS.sql ausführen (nach V12.4 Security), danach Seite neu laden.";
  }
  if ((m.includes("amount_paid") || m.includes("corrects_document_id") || m.includes("company_messages")) && (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find"))) {
    return "Teilzahlung, Stornorechnung oder Einladungsprotokoll ist in der Datenbank noch nicht eingerichtet. Bitte die Seite neu laden.";
  }
  if (m.includes("archived") && (m.includes("does not exist") || m.includes("schema cache") || m.includes("could not find the"))) {
    return "Archivieren ist in der Datenbank noch nicht eingerichtet. Bitte die Migration 20261009_zero_invoices_and_customer_archive.sql in Supabase ausführen.";
  }
  if (
    m.includes("could not find the function") ||
    m.includes("function public.") ||
    m.includes("schema cache") ||
    (m.includes("does not exist") && (m.includes("relation") || m.includes("table") || m.includes("column"))) ||
    m.includes("could not find the table")
  ) {
    return "Fehlende SQL-Funktion oder Tabelle. Bitte SETUP-WORKLEVEL-V12.sql einmal in Supabase ausführen (falls noch nicht geschehen), danach Seite neu laden.";
  }
  if ((m.includes("recurring_job_templates") || m.includes("generate_due_recurring_jobs") || m.includes("create_recurring_template")) && (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))) {
    return "Wiederkehrende Aufträge fehlen. Bitte in Supabase einmal SETUP-WORKLEVEL-V12.7-RECURRING.sql ausführen (nach V12.6), danach Seite neu laden.";
  }
  if ((m.includes("default_xp") || m.includes("default_price") || m.includes("xp_reward") || m.includes("suggested_price")) && (m.includes("does not exist") || m.includes("could not find") || m.includes("schema cache"))) {
    return "Wartungs-Vorlagen (XP/€) fehlen. Bitte SETUP-WORKLEVEL-V14.5-SERVICE-TEMPLATES.sql einmal in Supabase ausführen, danach Seite neu laden.";
  }
  if (m.includes("documents_customer_id_fkey") || (m.includes("foreign key") && m.includes("customers"))) {
    return "Dieser Kunde hat Rechnungen oder andere Dokumente und kann nicht gelöscht werden. Bitte den Kunden archivieren.";
  }
  if (m.includes("permission denied") || m.includes("row-level security") || m.includes("rls")) {
    return "Keine Berechtigung für diesen Datensatz. Bitte mit dem richtigen Firmenkonto anmelden oder die Rolle prüfen.";
  }
  if (m.includes("jwt") || m.includes("not authenticated") || m.includes("invalid api key")) {
    return "Anmeldung oder Supabase-Schlüssel ungültig. Bitte .env.local prüfen und erneut anmelden.";
  }
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("fetch failed") || m.includes("load failed") || m.includes("network request failed")) {
    return "Keine Verbindung zu Supabase (Failed to fetch). Bitte Internet prüfen und in .env.local NEXT_PUBLIC_SUPABASE_URL sowie NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY setzen, danach Dev-Server neu starten.";
  }
  if (
    m.includes("payload too large") ||
    m.includes("entity too large") ||
    m.includes("maximum allowed size") ||
    m.includes("object exceeded") ||
    (m.includes("file size") && m.includes("exceed"))
  ) {
    return "Datei zu groß für den Upload. Bitte ein kleineres Foto wählen — die App komprimiert Fotos automatisch.";
  }
  if (m.includes("bucket") && (m.includes("not found") || m.includes("does not exist"))) {
    return "Storage-Bucket „job-files“ fehlt. Bitte SETUP-WORKLEVEL-V6.sql (bzw. V12-Basis) in Supabase ausführen.";
  }
  if (m.includes("storage") && (m.includes("row-level security") || m.includes("policy") || m.includes("unauthorized") || m.includes("permission"))) {
    return "Kein Speicherzugriff für Auftragsfotos. Bitte Rolle/Anmeldung prüfen oder Storage-Policies aus SETUP-WORKLEVEL-V6.sql.";
  }
  return msg;
}

/** Next reminder level label from current reminder_count (0 = first Erinnerung). */
export function reminderLevelLabel(count: number | null | undefined): string {
  const n = Math.max(0, Number(count ?? 0));
  if (n <= 0) return "Erinnerung";
  if (n === 1) return "1. Mahnung";
  if (n === 2) return "2. Mahnung";
  return "3. Mahnung / letzte";
}
