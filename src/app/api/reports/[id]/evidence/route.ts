import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { proofStorage } from "@/lib/storage";
import { proofResponse } from "@/lib/proofResponse";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }

  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) {
    return NextResponse.json({ error: "Report not found." }, { status: 404 });
  }
  if (!user.isStaff && report.reportedById !== user.id) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!report.evidenceRef) {
    return NextResponse.json({ error: "No evidence attached to this report." }, { status: 404 });
  }

  const { buffer, contentType } = await proofStorage.read(report.evidenceRef);
  return proofResponse(buffer, contentType);
}
