import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { documentSender } from "@/lib/documentSender";
import { encryptMailbox, decryptMailbox } from "@/lib/mailboxCrypto";
import { mailboxError } from "@/lib/mailboxError";
import { mailboxTransport } from "@/lib/companyMailbox";
export const runtime = "nodejs";
export const maxDuration = 60;

async function context(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) throw new Error("Nicht angemeldet.");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) throw new Error("Nicht angemeldet.");
  const companyId = request.nextUrl.searchParams.get("company");
  if (!companyId) throw new Error("Firma fehlt.");
  const company = await db.from("companies").select("owner_user_id").eq("id", companyId).single();
  if (company.error || company.data.owner_user_id !== data.user.id) throw new Error("Nur der registrierte Chef/Inhaber kann das Postfach verbinden.");
  return { db, companyId, sender: await documentSender(db, companyId) };
}
export async function GET(request: NextRequest) {
  try {
    const { db, companyId, sender } = await context(request);
    const result = await db.from("company_mailboxes").select("sender_email,provider,updated_at").eq("company_id", companyId).maybeSingle();
    if (result.error) return NextResponse.json({ error: "Postfach-Einstellungen sind noch nicht verfügbar." }, { status: 503 });
    return NextResponse.json({ email: sender.email, connected: result.data?.sender_email === sender.email, provider: result.data?.provider || "", ready: Boolean(process.env.MAILBOX_ENCRYPTION_KEY) });
  } catch { return NextResponse.json({ error: "Postfach-Einstellungen sind nur für den registrierten Chef/Inhaber zugänglich." }, { status: 403 }); }
}
export async function POST(request: NextRequest) {
  let ctx;
  try { ctx = await context(request); } catch { return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 }); }
  try {
    const { provider, password } = await request.json();
    if (typeof provider !== "string" || typeof password !== "string" || !password || password.length > 1024) return NextResponse.json({ error: "Bitte Anbieter und Postfach-/App-Passwort eingeben." }, { status: 400 });
    const encrypted = encryptMailbox(password, ctx.companyId, ctx.sender.email);
    const transport = mailboxTransport(provider, ctx.sender.email, password);
    try { await transport.verify(); } finally { transport.close(); }
    const saved = await ctx.db.from("company_mailboxes").upsert({ company_id: ctx.companyId, sender_email: ctx.sender.email, provider, encrypted_password: encrypted, updated_at: new Date().toISOString() });
    if (saved.error) return NextResponse.json({ error: "Verbindung geprüft, konnte aber nicht gespeichert werden." }, { status: 500 });
    return NextResponse.json({ connected: true });
  } catch { return NextResponse.json({ error: "Verbindung fehlgeschlagen. Anbieter, App-Passwort und Freigabe für E-Mail-Programme beim Anbieter prüfen." }, { status: 400 }); }
}
export async function DELETE(request: NextRequest) {
  try {
    const { db, companyId } = await context(request);
    const result = await db.from("company_mailboxes").delete().eq("company_id", companyId);
    if (result.error) throw result.error;
    return NextResponse.json({ connected: false });
  } catch { return NextResponse.json({ error: "Verbindung konnte nicht entfernt werden." }, { status: 403 }); }
}

// Verify the persisted credential, without replacing it or sending an email.
export async function PATCH(request: NextRequest) {
  let ctx;
  try { ctx = await context(request); } catch { return NextResponse.json({ error: "Keine Berechtigung." }, { status: 403 }); }
  const saved = await ctx.db.from("company_mailboxes").select("sender_email,provider,encrypted_password").eq("company_id", ctx.companyId).maybeSingle();
  if (saved.error) return NextResponse.json({ error: "Gespeichertes Postfach konnte nicht geladen werden." }, { status: 503 });
  if (!saved.data) return NextResponse.json({ error: "Bitte zuerst ein Postfach verbinden." }, { status: 409 });
  if (saved.data.sender_email !== ctx.sender.email) return NextResponse.json({ error: "Die Inhaber-Adresse hat sich geändert. Bitte das passende Postfach verbinden." }, { status: 409 });
  let stage: "decrypt" | "connect" = "decrypt";
  try {
    const password = decryptMailbox(saved.data.encrypted_password, ctx.companyId, ctx.sender.email);
    stage = "connect";
    const transport = mailboxTransport(saved.data.provider, ctx.sender.email, password);
    try { await transport.verify(); } finally { transport.close(); }
    return NextResponse.json({ connected: true, verified: true });
  } catch (e) { return NextResponse.json(mailboxError(e, stage), { status: 502 }); }
}
