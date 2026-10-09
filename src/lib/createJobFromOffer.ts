import { getSupabaseClient } from "@/lib/supabase";

export type JobFromOfferResult = {
  id: string;
  job_number: string;
  already_existed: boolean;
};

/** Owner/admin: create job from accepted offer, or return existing converted job. */
export async function createJobFromOffer(
  documentId: string,
  opts?: { knownConvertedJobId?: string | null }
): Promise<JobFromOfferResult> {
  const s = getSupabaseClient();
  if (!s) throw new Error("Supabase ist nicht verfügbar.");

  const known = opts?.knownConvertedJobId;
  if (known) {
    const { data: existing, error: exErr } = await s
      .from("jobs")
      .select("id,job_number")
      .eq("id", known)
      .maybeSingle();
    if (!exErr && existing?.id) {
      return {
        id: String(existing.id),
        job_number: String(existing.job_number ?? ""),
        already_existed: true,
      };
    }
  }

  const { data, error } = await s.rpc("create_job_from_offer", { p_document: documentId });
  if (error) {
    throw new Error(
      error.message.includes("Keine Berechtigung")
        ? "Keine Berechtigung — nur Büro/Inhaber können Aufträge aus Angeboten erstellen."
        : error.message.includes("Nur angenommene")
          ? "Nur angenommene Angebote können in einen Auftrag umgewandelt werden."
          : error.message +
            (error.message.includes("function") || error.message.includes("schema cache")
              ? " — Bitte SETUP-WORKLEVEL-V11.sql in Supabase ausführen."
              : "")
    );
  }
  const row = (Array.isArray(data) ? data[0] : data) as { id?: string; job_number?: string } | null;
  if (!row?.id) throw new Error("Auftrag konnte nicht erstellt werden.");
  return {
    id: String(row.id),
    job_number: String(row.job_number ?? ""),
    already_existed: Boolean(known && known === String(row.id)),
  };
}

export function jobAkteHref(jobId: string) {
  return `/auftraege?akte=${encodeURIComponent(jobId)}`;
}

export function jobPlantafelHref(jobId: string) {
  return `/plantafel?job=${encodeURIComponent(jobId)}`;
}

export function jobTechnikerHref(jobId: string) {
  return `/techniker?job=${encodeURIComponent(jobId)}`;
}
