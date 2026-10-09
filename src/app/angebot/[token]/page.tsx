"use client";

import { FormEvent, PointerEvent, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getSupabaseClient } from "@/lib/supabase";
import { euro, formatDate } from "@/lib/utils";
import { isOfferLetter, letterItemPrice, parseOfferLetter } from "@/lib/offerLetter";
import { OfferLetterView } from "@/components/OfferLetterView";

type PublicOffer = {
  ok: boolean;
  error?: string;
  status?: string;
  link?: { expires_at: string };
  company?: {
    name: string;
    street?: string | null;
    postal_code?: string | null;
    city?: string | null;
    phone?: string | null;
    email?: string | null;
    logo_url?: string | null;
    document_footer?: string | null;
  };
  customer_name?: string;
  document?: {
    id: string;
    document_number: string;
    status: string;
    issue_date: string;
    valid_until: string | null;
    title: string | null;
    intro_text: string | null;
    notes: string | null;
    vat_rate: number;
    taxation_mode: string;
    tax_note: string | null;
    subtotal: number;
    vat_amount: number;
    total_amount: number;
    customer_response_at?: string | null;
    customer_response_name?: string | null;
    customer_response_message?: string | null;
  };
  items?: Array<{
    position: number;
    description: string;
    quantity: number;
    unit: string;
    unit_price: number;
    line_total: number;
  }>;
};

function statusClass(status: string) {
  const key = status.replace(/\s/g, "-");
  if (status === "Angenommen") return `publicStatus publicStatusAccept status-${key}`;
  if (status === "Abgelehnt") return `publicStatus publicStatusReject status-${key}`;
  if (status === "Änderung angefragt") return `publicStatus publicStatusChange status-${key}`;
  return `publicStatus status-${key}`;
}

function LockedBanner({
  status,
  responseAt,
  responseName,
  responseMessage,
  company,
}: {
  status: string;
  responseAt?: string | null;
  responseName?: string | null;
  responseMessage?: string | null;
  company: NonNullable<PublicOffer["company"]>;
}) {
  const accepted = status === "Angenommen";
  const rejected = status === "Abgelehnt";
  const change = status === "Änderung angefragt";

  const title = accepted
    ? "Vielen Dank — Angebot angenommen"
    : rejected
      ? "Angebot abgelehnt"
      : change
        ? "Änderungsanfrage übermittelt"
        : `Status: ${status}`;

  const nextSteps = accepted
    ? [
        "Ihre Annahme ist bei uns eingegangen.",
        "Wir melden uns in Kürze zur Termin- und Auftragsabstimmung.",
        company.email || company.phone
          ? `Bei Fragen: ${[company.email, company.phone].filter(Boolean).join(" · ")}`
          : "Bei Fragen erreichen Sie uns über die Kontaktdaten unten.",
      ]
    : rejected
      ? [
          "Ihre Ablehnung wurde gespeichert. Es ist keine weitere Aktion nötig.",
          "Wenn Sie doch Interesse haben, melden Sie sich gerne erneut bei uns.",
          company.email || company.phone
            ? `Kontakt: ${[company.email, company.phone].filter(Boolean).join(" · ")}`
            : null,
        ].filter(Boolean) as string[]
      : change
        ? [
            "Wir prüfen Ihre Nachricht und melden uns mit einer Anpassung oder Rückfrage.",
            "Solange das Angebot nicht final beantwortet ist, können Sie unten eine weitere Nachricht senden.",
          ]
        : [`Aktueller Status: ${status}`];

  return (
    <div
      className={`publicLockedBanner ${
        accepted ? "publicLockedAccept" : rejected ? "publicLockedReject" : "publicLockedChange"
      }`}
      role="status"
    >
      <div className="publicLockedHead">
        <span className="publicLockedIcon" aria-hidden>
          {accepted ? "✓" : rejected ? "—" : "↻"}
        </span>
        <div>
          <h3>{title}</h3>
          <p className="publicLockedSub">
            {accepted || rejected
              ? "Antwort gespeichert — keine erneute Übermittlung nötig."
              : "Ihre Nachricht ist eingegangen."}
          </p>
        </div>
      </div>
      {(responseAt || responseName) && (
        <p className="publicLockedMeta">
          {responseName ? `Von ${responseName}` : "Antwort"}
          {responseAt ? ` am ${new Date(responseAt).toLocaleString("de-DE")}` : ""}
        </p>
      )}
      {responseMessage && <p className="publicLockedMsg">{responseMessage}</p>}
      <div className="publicNextSteps">
        <strong>Was passiert als Nächstes?</strong>
        <ul>
          {nextSteps.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default function PublicOfferPage() {
  const params = useParams();
  const token = String(params?.token ?? "");
  const [data, setData] = useState<PublicOffer | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [doneAction, setDoneAction] = useState<"accept" | "reject" | "request_change" | "">("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function load() {
    const s = getSupabaseClient();
    if (!s || !token) {
      setError("Link ungültig oder Supabase nicht konfiguriert.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const { data: raw, error: e } = await s.rpc("get_public_offer", { p_token: token });
    if (e) {
      setError(e.message + " — Falls neu: SETUP-WORKLEVEL-V11.sql in Supabase ausführen.");
      setLoading(false);
      return;
    }
    const payload = (raw ?? { ok: false, error: "Keine Daten" }) as PublicOffer;
    setData(payload);
    if (!payload.ok) setError(payload.error || "Angebot nicht verfügbar.");
    setLoading(false);
  }

  function pointerPos(e: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * canvas.width,
      y: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  }
  function startDraw(e: PointerEvent<HTMLCanvasElement>) {
    drawing.current = true;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pointerPos(e);
    ctx.strokeStyle = "#111";
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    try {
      canvasRef.current?.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }
  function moveDraw(e: PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const p = pointerPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  }
  function endDraw() {
    drawing.current = false;
  }
  function clearSignature() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  async function respond(action: "accept" | "reject" | "request_change") {
    const s = getSupabaseClient();
    if (!s || !token) return;
    setBusy(true);
    setError("");
    setDoneAction("");
    const signature = action === "accept" ? canvasRef.current?.toDataURL("image/png") ?? null : null;
    if (action === "accept" && (!name.trim() || !signature || signature.length < 200)) {
      setError("Bitte Name und Unterschrift für die Annahme angeben.");
      setBusy(false);
      return;
    }
    if (action === "request_change" && !message.trim()) {
      setError("Bitte kurz beschreiben, was geändert werden soll.");
      setBusy(false);
      return;
    }
    const { data: raw, error: e } = await s.rpc("respond_to_public_offer", {
      p_token: token,
      p_action: action,
      p_customer_name: name || null,
      p_customer_message: message || null,
      p_signature_data: signature,
    });
    if (e) {
      setError(e.message);
      setBusy(false);
      return;
    }
    const result = raw as { ok?: boolean; error?: string; status?: string };
    if (!result?.ok) {
      setError(result?.error || "Antwort fehlgeschlagen.");
      setBusy(false);
      return;
    }
    setDoneAction(action);
    await load();
    setBusy(false);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
  }

  if (loading) {
    return (
      <div className="publicOfferPage">
        <div className="publicOfferCard">
          <div className="authLoading">
            <div className="authSpinner" />
            <span>Angebot wird geladen...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!data?.ok || !data.document || !data.company) {
    return (
      <div className="publicOfferPage">
        <div className="publicOfferCard">
          <div className="publicBrand">
            WORK<span>LEVEL</span>
          </div>
          <h1>Angebot nicht verfügbar</h1>
          <p className="publicMuted">{error || "Dieser Link ist ungültig, abgelaufen oder wurde widerrufen."}</p>
        </div>
      </div>
    );
  }

  const doc = data.document;
  const company = data.company;
  const items = data.items ?? [];
  const alreadyResponded = ["Angenommen", "Abgelehnt"].includes(doc.status);
  const changeRequested = doc.status === "Änderung angefragt";
  const locked = alreadyResponded;
  const companyAddress = [company.street, [company.postal_code, company.city].filter(Boolean).join(" ")]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="publicOfferPage">
      <div className="publicOfferCard">
        <div className="publicTopBar">
          <div className="publicBrand">
            WORK<span>LEVEL</span>
          </div>
          <span className={statusClass(doc.status)}>{doc.status}</span>
        </div>

        <div className="publicCompanyHead">
          <div className="publicCompanyIdentity">
            {company.logo_url && <img className="docLogo publicCompanyLogo" src={company.logo_url} alt="" />}
            <div>
              <p className="publicCompanyLabel">Angebot von</p>
              <h1 className="publicCompanyName">{company.name}</h1>
              {companyAddress && <p className="publicMuted">{companyAddress}</p>}
            </div>
          </div>
          <div className="publicMeta">
            <strong>Angebot {doc.document_number}</strong>
            <span>Datum {formatDate(doc.issue_date)}</span>
            {doc.valid_until && <span>Gültig bis {formatDate(doc.valid_until)}</span>}
          </div>
        </div>

        {(locked || changeRequested || doneAction) && (
          <LockedBanner
            status={doc.status}
            responseAt={doc.customer_response_at}
            responseName={doc.customer_response_name}
            responseMessage={doc.customer_response_message}
            company={company}
          />
        )}

        <div className="publicCustomerLine">
          Für: <strong>{data.customer_name || "Kunde"}</strong>
        </div>
        {isOfferLetter(doc.notes) && parseOfferLetter(doc.notes) ? (
          <OfferLetterView
            title={doc.title}
            intro={doc.intro_text}
            letter={parseOfferLetter(doc.notes)!}
            prices={(items ?? []).map((item) => ({ description: item.description, price: letterItemPrice(item) }))}
          />
        ) : (
        <>
        {doc.title && <h2 className="publicTitle">{doc.title}</h2>}
        {doc.intro_text && <p className="publicIntro">{doc.intro_text}</p>}

        <div className="publicTableWrap">
          <table className="publicTable">
            <thead>
              <tr>
                <th>Pos.</th>
                <th>Beschreibung</th>
                <th>Menge</th>
                <th>Einzel</th>
                <th>Gesamt</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i}>
                  <td data-label="Pos.">{it.position || i + 1}</td>
                  <td data-label="Beschreibung">{it.description}</td>
                  <td data-label="Menge">
                    {Number(it.quantity).toLocaleString("de-DE")} {it.unit}
                  </td>
                  <td data-label="Einzel">{euro(Number(it.unit_price))}</td>
                  <td data-label="Gesamt">{euro(Number(it.line_total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="publicTotals" aria-label="Summen">
          <div>
            <span>Netto</span>
            <strong>{euro(Number(doc.subtotal))}</strong>
          </div>
          {doc.taxation_mode === "small_business" ? (
            <div>
              <span>Umsatzsteuer</span>
              <strong>entfällt</strong>
            </div>
          ) : (
            <div>
              <span>MwSt. {Number(doc.vat_rate)}%</span>
              <strong>{euro(Number(doc.vat_amount))}</strong>
            </div>
          )}
          <div className="publicGrand">
            <span>Gesamtbetrag</span>
            <strong>{euro(Number(doc.total_amount))}</strong>
          </div>
        </div>

        {doc.taxation_mode === "small_business" && (
          <p className="taxNotice lightTaxNotice">{doc.tax_note || "Steuerbefreiung für Kleinunternehmer nach § 19 Abs. 1 UStG."}</p>
        )}
        {doc.notes && <p className="publicNotes">{doc.notes}</p>}
        </>
        )}

        {error && <div className="publicAlert publicAlertError">{error}</div>}

        {locked ? (
          <div className="publicLockedNote" aria-live="polite">
            Dieses Angebot ist abgeschlossen. Eine erneute Annahme oder Ablehnung ist nicht möglich.
          </div>
        ) : (
          <form className="publicRespondForm" onSubmit={onSubmit}>
            <h3>{changeRequested ? "Weitere Nachricht senden" : "Ihre Antwort"}</h3>
            <p className="publicMuted publicRespondHint">
              {changeRequested
                ? "Sie können eine Ergänzung schicken, solange das Angebot noch nicht final beantwortet wurde."
                : "Zur Annahme bitte Name und Unterschrift angeben. Ablehnung und Änderungsanfrage benötigen keine Unterschrift."}
            </p>
            <div className="formField">
              <label htmlFor="public-offer-name">Ihr Name</label>
              <input
                id="public-offer-name"
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Vor- und Nachname"
                autoComplete="name"
                disabled={busy}
              />
            </div>
            <div className="formField">
              <label htmlFor="public-offer-msg">Nachricht (optional / bei Änderungspflichtig)</label>
              <textarea
                id="public-offer-msg"
                className="textarea"
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Fragen oder Änderungswünsche"
                disabled={busy}
              />
            </div>
            <div className="formField">
              <label>Unterschrift (für Annahme)</label>
              <canvas
                ref={canvasRef}
                className="publicSignature"
                width={640}
                height={180}
                onPointerDown={startDraw}
                onPointerMove={moveDraw}
                onPointerUp={endDraw}
                onPointerLeave={endDraw}
                onPointerCancel={endDraw}
              />
              <button type="button" className="ghostBtn smallBtn" onClick={clearSignature} style={{ marginTop: 8 }} disabled={busy}>
                Unterschrift löschen
              </button>
            </div>
            <div className="publicActions">
              <button type="button" className="primaryBtn" disabled={busy} onClick={() => respond("accept")}>
                {busy ? "Bitte warten…" : "Angebot annehmen"}
              </button>
              <button type="button" className="ghostBtn" disabled={busy} onClick={() => respond("request_change")}>
                Änderung anfragen
              </button>
              <button type="button" className="ghostBtn dangerGhost" disabled={busy} onClick={() => respond("reject")}>
                Ablehnen
              </button>
            </div>
          </form>
        )}

        <footer className="publicFooter">
          <p className="publicFooterCompany">
            <strong>{company.name}</strong>
          </p>
          {company.document_footer && <p>{company.document_footer}</p>}
          <p className="publicMuted">
            {[company.email, company.phone].filter(Boolean).join(" · ")}
          </p>
          {data.link?.expires_at && (
            <p className="publicMuted">Link gültig bis {new Date(data.link.expires_at).toLocaleString("de-DE")}</p>
          )}
        </footer>
      </div>
    </div>
  );
}
