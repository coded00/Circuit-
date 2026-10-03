/** Circuit — (re)send the email verification link to the signed-in account. */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { sendVerificationEmail } from "@/lib/emailVerification";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const result = await sendVerificationEmail(user);
  if (result.ok) return NextResponse.json({ sent: true });
  if (result.reason === "already_verified") return NextResponse.json({ error: "Your email is already verified." }, { status: 409 });
  if (result.reason === "no_email") return NextResponse.json({ error: "Add an email in Account settings first." }, { status: 400 });
  return NextResponse.json(
    { error: `Too many emails. Try again in ${Math.ceil((result.retryAfterSeconds ?? 60) / 60)} min.` },
    { status: 429 }
  );
}
