/**
 * Circuit — collects Content-Security-Policy violation reports (the policy runs in report-only mode, see
 * next.config.ts). Anyone's browser can post here, so it is capped by size and by IP, and only a few short fields
 * are logged. A directive that keeps showing up with a legitimate source means the allow-list needs that origin
 * before the policy is enforced.
 */

import { NextResponse } from "next/server";
import { getClientIp, isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { captureMessage } from "@/lib/observability";

const MAX_BODY_BYTES = 8 * 1024;
const cut = (v: unknown) => (typeof v === "string" ? v.slice(0, 200) : undefined);

export async function POST(request: Request) {
  const key = `csp-report:${getClientIp(request)}`;
  const { limited } = await isRateLimited(key, { max: 60, windowMs: 60 * 1000 });
  if (limited) return new NextResponse(null, { status: 204 });
  await recordAttempt(key);

  const text = await request.text().catch(() => "");
  if (!text || text.length > MAX_BODY_BYTES) return new NextResponse(null, { status: 204 });
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return new NextResponse(null, { status: 204 });
  }
  // Older browsers send { "csp-report": {...} }; newer ones send a Reporting API array of { body: {...} }.
  const items = Array.isArray(body) ? body.map((r) => (r as { body?: unknown })?.body) : [(body as { "csp-report"?: unknown })?.["csp-report"] ?? body];
  for (const item of items.slice(0, 5)) {
    const r = (item ?? {}) as Record<string, unknown>;
    captureMessage("CSP violation (report-only)", "warning", {
      directive: cut(r["violated-directive"] ?? r["effectiveDirective"]),
      blocked: cut(r["blocked-uri"] ?? r["blockedURL"]),
      document: cut(r["document-uri"] ?? r["documentURL"]),
      source: cut(r["source-file"] ?? r["sourceFile"]),
    });
  }
  return new NextResponse(null, { status: 204 });
}
