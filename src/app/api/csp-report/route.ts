/**
 * Circuit — collects Content-Security-Policy violation reports (the policy is enforced and carries a
 * per-request nonce; see src/proxy.ts). Anyone's browser can post here, so it is capped by size and by IP,
 * and only a few short fields are logged.
 *
 * What a report means changed when the policy stopped being report-only. It used to be a preview of what
 * *would* break; now it is a feature that *did* break, on somebody's real browser, in production. The
 * allow-list in src/proxy.ts is the thing to check first, and a report naming a legitimate source is a
 * bug in that list rather than noise.
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
    captureMessage("CSP blocked something", "warning", {
      directive: cut(r["violated-directive"] ?? r["effectiveDirective"]),
      blocked: cut(r["blocked-uri"] ?? r["blockedURL"]),
      document: cut(r["document-uri"] ?? r["documentURL"]),
      source: cut(r["source-file"] ?? r["sourceFile"]),
    });
  }
  return new NextResponse(null, { status: 204 });
}
