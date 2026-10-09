import type { SupabaseClient } from "@supabase/supabase-js";

/** Resolve the registering owner's email using the caller's existing company permissions. */
export async function documentSender(db: SupabaseClient, companyId: string) {
  const company = await db.from("companies").select("name,owner_user_id").eq("id", companyId).single();
  if (company.error) throw new Error("Firmenabsender konnte nicht geladen werden.");
  const members = await db.rpc("get_company_members", { p_company: companyId });
  if (members.error) throw new Error("Inhaber-Adresse konnte nicht geladen werden.");
  const owner = (members.data as { user_id: string; email: string; role: string; status: string }[])
    .find(m => m.user_id === company.data.owner_user_id && m.role === "owner" && m.status === "active");
  if (!owner?.email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(owner.email)) throw new Error("Keine gültige registrierte Inhaber-Adresse gefunden.");
  return { name: company.data.name as string, email: owner.email };
}
