/**
 * Circuit — signup (ACC-2, part of Build Plan P0-2).
 *
 * Deliberately thin: email/phone + password only, no identity or payment
 * fields (D4, ACC-2). displayName/handle are auto-generated so signup stays
 * a two-field form; a player customizes both later via ACC-6's profile
 * edit. Age-of-majority (ACC-3) is checked at cash-touching actions, not
 * here — see src/lib/age-gate.ts.
 */

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { createSessionToken, hashPassword, sessionCookie } from "@/lib/auth";

const MIN_PASSWORD_LENGTH = 8;
const HANDLE_GENERATION_ATTEMPTS = 3;

function generateHandle(): string {
  return `player_${Math.random().toString(36).slice(2, 10)}`;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const emailOrPhone =
    typeof body?.emailOrPhone === "string" ? body.emailOrPhone.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";

  if (!emailOrPhone || password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      {
        error: `Email or phone, and a password of at least ${MIN_PASSWORD_LENGTH} characters, are required.`,
      },
      { status: 400 }
    );
  }

  const passwordHash = await hashPassword(password);

  for (let attempt = 0; attempt < HANDLE_GENERATION_ATTEMPTS; attempt++) {
    const handle = generateHandle();
    try {
      const user = await prisma.user.create({
        data: { emailOrPhone, passwordHash, handle, displayName: handle },
      });

      const token = await createSessionToken({ userId: user.id });
      const response = NextResponse.json(
        { id: user.id, handle: user.handle },
        { status: 201 }
      );
      response.cookies.set(sessionCookie.name, token, sessionCookie);
      return response;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const target = (err.meta?.target as string[] | undefined) ?? [];
        if (target.includes("emailOrPhone")) {
          return NextResponse.json(
            { error: "An account already exists for that email or phone." },
            { status: 409 }
          );
        }
        // Collided on the generated handle — retry with a new one.
        continue;
      }
      throw err;
    }
  }

  return NextResponse.json(
    { error: "Could not create an account. Please try again." },
    { status: 500 }
  );
}
