/**
 * Circuit — login (part of Build Plan P0-2, ACC-5).
 *
 * KNOWN GAP: ACC-5 requires rate-limited login attempts; this route doesn't
 * implement that yet (the stack doc's recommendation is a Postgres attempts
 * table, not Redis — see docs/circuit-stack.md's Rate limiting section).
 * Tracked as follow-up work, not silently dropped.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSessionToken, sessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const emailOrPhone =
    typeof body?.emailOrPhone === "string" ? body.emailOrPhone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!emailOrPhone || !password) {
    return NextResponse.json(
      { error: "Email/phone and password are required." },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { emailOrPhone } });
  const valid = user?.passwordHash
    ? await verifyPassword(password, user.passwordHash)
    : false;

  if (!user || !valid) {
    return NextResponse.json({ error: "Invalid credentials." }, { status: 401 });
  }

  const token = await createSessionToken({ userId: user.id });
  const response = NextResponse.json({ id: user.id, handle: user.handle });
  response.cookies.set(sessionCookie.name, token, sessionCookie);
  return response;
}
