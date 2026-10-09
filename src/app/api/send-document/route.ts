import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { documentSender } from "@/lib/documentSender";
import { decryptMailbox } from "@/lib/mailboxCrypto";
import { mailboxTransport } from "@/lib/companyMailbox";
import { mailboxError } from "@/lib/mailboxError";

export const runtime = "nodejs";
export const maxDuration = 60;

function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/** Public status only — never returns secrets. */
export async function GET() {
  return NextResponse.json({ configured: isResendConfigured() });
}

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

    const body = await request.json();
    const { documentId, to, subject, text, filename, attachmentBase64 } = body ?? {};
    if (!documentId || !to || !subject || !text || !filename || !attachmentBase64) {
      return NextResponse.json({ error: "Unvollständige E-Mail-Daten." }, { status: 400 });
    }
    if (typeof to !== "string" || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(to) ||
        typeof subject !== "string" || subject.length > 300 || /[\r\n]/.test(subject) ||
        typeof text !== "string" || text.length > 100000 || typeof filename !== "string" ||
        typeof attachmentBase64 !== "string" || attachmentBase64.length > 4000000) {
      return NextResponse.json({ error: "Ungültige E-Mail-Daten oder PDF zu groß (max. 3 MB)." }, { status: 400 });
    }

    // This query is intentionally performed with the caller's JWT. Supabase RLS therefore
    // permits only owner/admin members of the document's company.
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .select("id, company_id")
      .eq("id", documentId)
      .maybeSingle();
    if (documentError || !document) return NextResponse.json({ error: "Keine Berechtigung für dieses Dokument." }, { status: 403 });

    const apiKey = process.env.RESEND_API_KEY;
    const sender = await documentSender(supabase, document.company_id);
    const mailbox = await supabase.from("company_mailboxes").select("sender_email,provider,encrypted_password").eq("company_id", document.company_id).maybeSingle();
    if (mailbox.data) {
      if (mailbox.data.sender_email !== sender.email) return NextResponse.json({ error: "Die Inhaber-Adresse wurde geändert. Bitte das Postfach erneut verbinden." }, { status: 409 });
      let stage: "decrypt" | "send" = "decrypt";
      try {
        const password = decryptMailbox(mailbox.data.encrypted_password, document.company_id, sender.email);
        stage = "send";
        const transport = mailboxTransport(mailbox.data.provider, sender.email, password);
        try {
          const sent = await transport.sendMail({ from: { name: sender.name, address: sender.email }, to, subject, text, replyTo: sender.email,
            attachments: [{ filename: filename.replace(/[\\/\r\n]/g, "_"), content: Buffer.from(attachmentBase64, "base64"), contentType: "application/pdf" }] });
          return NextResponse.json({ ok: true, id: sent.messageId, provider: "smtp" });
        } finally { transport.close(); }
      } catch (e) { return NextResponse.json(mailboxError(e, stage), { status: 502 }); }
    }
    if (!apiKey) {
      return NextResponse.json(
        { error: `Direktversand von ${sender.email} ist noch nicht eingerichtet. Bitte das Inhaber-Postfach verbinden bzw. die Firmendomain freischalten. Bis dahin die PDF mit der E-Mail-App teilen und dort dieses Absenderkonto wählen.` },
        { status: 503 }
      );
    }

    const from = `${sender.name.replace(/[<>\r\n"]/g, "")} <${sender.email}>`;
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text,
        reply_to: sender.email,
        attachments: [{ filename, content: attachmentBase64 }],
      }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json({ error: result?.message || "E-Mail konnte nicht gesendet werden." }, { status: response.status });
    }
    // Provider id for client logging (mark_document_sent / log_document_event on caller side)
    return NextResponse.json({ ok: true, id: result?.id ?? null, provider: "resend" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unbekannter Fehler beim E-Mail-Versand." }, { status: 500 });
  }
}
