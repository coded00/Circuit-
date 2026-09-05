import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  }
  const { id } = await params;

  try {
    await prisma.notification.update({
      where: { id, userId: user.id },
      data: { readAt: new Date() },
    });
  } catch {
    return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
