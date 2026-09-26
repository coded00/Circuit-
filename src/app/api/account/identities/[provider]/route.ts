/**
 * Circuit — disconnect a sign-in method (currently only Google) from your
 * account. Refused if it's the only way in: an account without a password
 * would be locked out. They can set a password first via "Forgot
 * password" (the reset link goes to their email).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

export async function DELETE(_request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { provider } = await params;
  const identity = await prisma.authIdentity.findUnique({ where: { userId_provider: { userId: user.id, provider } } });
  if (!identity) return NextResponse.json({ error: "That sign-in method isn't connected." }, { status: 404 });

  const otherIdentities = await prisma.authIdentity.count({ where: { userId: user.id, NOT: { id: identity.id } } });
  if (!user.passwordHash && otherIdentities === 0) {
    return NextResponse.json(
      { error: "This is how you sign in. Set a password first (use “Forgot password” on the login page), then you can disconnect Google." },
      { status: 400 }
    );
  }

  await prisma.authIdentity.delete({ where: { id: identity.id } });
  return NextResponse.json({ ok: true });
}
