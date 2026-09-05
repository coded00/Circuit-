/**
 * Circuit — abuse reporting (Build Plan P6-3, maps: TRU-3).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { proofStorage } from "@/lib/storage";

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const VALID_REASON_CODES = ["MULTI_ACCOUNTING", "CHEATING", "HARASSMENT", "PAYMENT_FRAUD", "OTHER"];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to file a report." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json({ error: "Invalid form submission." }, { status: 400 });
  }

  const reportedHandle = String(form.get("reportedHandle") ?? "").trim().replace(/^@/, "");
  const reasonCode = String(form.get("reasonCode") ?? "");
  const details = String(form.get("details") ?? "").trim();
  const evidence = form.get("evidence");

  if (!reportedHandle) {
    return NextResponse.json({ error: "Who are you reporting?" }, { status: 400 });
  }
  if (!VALID_REASON_CODES.includes(reasonCode)) {
    return NextResponse.json({ error: "Pick a valid reason." }, { status: 400 });
  }

  const reportedUser = await prisma.user.findUnique({ where: { handle: reportedHandle } });
  if (!reportedUser) {
    return NextResponse.json({ error: `No player found with handle @${reportedHandle}.` }, { status: 400 });
  }
  if (reportedUser.id === user.id) {
    return NextResponse.json({ error: "You can't report yourself." }, { status: 400 });
  }

  const reason = details ? `${reasonCode}: ${details}` : reasonCode;

  const report = await prisma.report.create({
    data: { reportedUserId: reportedUser.id, reportedById: user.id, reason },
  });

  if (evidence instanceof File && evidence.size > 0) {
    if (evidence.size > MAX_EVIDENCE_BYTES) {
      return NextResponse.json({ error: "Evidence file is too large (10MB max)." }, { status: 400 });
    }
    const buffer = Buffer.from(await evidence.arrayBuffer());
    const ref = await proofStorage.store(report.id, buffer, evidence.type || "application/octet-stream");
    await prisma.report.update({ where: { id: report.id }, data: { evidenceRef: ref } });
  }

  return NextResponse.json({ id: report.id }, { status: 201 });
}
