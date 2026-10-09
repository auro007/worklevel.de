import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Alias of GET /api/send-document — returns { configured } without secrets. */
export async function GET() {
  const configured = Boolean(process.env.RESEND_API_KEY?.trim());
  return NextResponse.json({ configured });
}
