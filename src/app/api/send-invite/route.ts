import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { documentSender } from "@/lib/documentSender";
import { decryptMailbox } from "@/lib/mailboxCrypto";
import { mailboxTransport } from "@/lib/companyMailbox";
import { mailboxError } from "@/lib/mailboxError";

export const runtime = "nodejs";
export const maxDuration = 60;

const EMAIL = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
    if (!token) return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({ error: "Supabase-Konfiguration fehlt." }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return NextResponse.json({ error: "Sitzung ungültig." }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const { companyId, to, subject, text } = body ?? {};
    if (typeof companyId !== "string" || typeof to !== "string" || typeof subject !== "string" || typeof text !== "string") {
      return NextResponse.json({ error: "Unvollständige Einladung." }, { status: 400 });
    }
    if (!/^[0-9a-f-]{36}$/i.test(companyId) || !EMAIL.test(to) || subject.length > 300 || /[\r\n]/.test(subject) || text.length > 8000 || text.length < 10) {
      return NextResponse.json({ error: "Ungültige Einladungsdaten." }, { status: 400 });
    }

    const { data: member, error: memberError } = await supabase
      .from("company_members")
      .select("role,status")
      .eq("company_id", companyId)
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (memberError || !member || member.status !== "active" || !["owner", "admin"].includes(member.role)) {
      return NextResponse.json({ error: "Keine Berechtigung für diese Firma." }, { status: 403 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    const sender = await documentSender(supabase, companyId);
    const mailbox = await supabase
      .from("company_mailboxes")
      .select("sender_email,provider,encrypted_password")
      .eq("company_id", companyId)
      .maybeSingle();

    if (mailbox.data) {
      if (mailbox.data.sender_email !== sender.email) {
        return NextResponse.json({ error: "Die Inhaber-Adresse wurde geändert. Bitte das Postfach erneut verbinden." }, { status: 409 });
      }
      let stage: "decrypt" | "send" = "decrypt";
      try {
        const password = decryptMailbox(mailbox.data.encrypted_password, companyId, sender.email);
        stage = "send";
        const transport = mailboxTransport(mailbox.data.provider, sender.email, password);
        try {
          const sent = await transport.sendMail({
            from: { name: sender.name, address: sender.email },
            to,
            subject,
            text,
            replyTo: sender.email,
          });
          return NextResponse.json({ ok: true, id: sent.messageId, provider: "smtp" });
        } finally {
          transport.close();
        }
      } catch (e) {
        return NextResponse.json(mailboxError(e, stage), { status: 502 });
      }
    }

    if (!apiKey) {
      return NextResponse.json(
        { error: `Direktversand von ${sender.email} ist noch nicht eingerichtet. Der Einladungscode bleibt kopiert. Bitte das Inhaber-Postfach verbinden.` },
        { status: 503 }
      );
    }

    const from = `${sender.name.replace(/[<>\r\n"]/g, "")} <${sender.email}>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [to], subject, text, reply_to: sender.email }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: result?.message || "E-Mail konnte nicht gesendet werden." }, { status: response.status });
    }
    return NextResponse.json({ ok: true, id: result?.id ?? null, provider: "resend" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler beim Einladungsversand." }, { status: 500 });
  }
}
