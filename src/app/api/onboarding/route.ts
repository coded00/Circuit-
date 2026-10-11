/**
 * Circuit — onboarding. POST { gameIds, cityId?, region?, interestIds }
 * joins the matching official communities and returns recommendations;
 * PATCH { done: true } marks onboarding finished.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { jsonBody } from "@/lib/communityHttp";
import { applyChoices, parseChoices, recommendationsFor } from "@/lib/onboarding";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const choices = parseChoices(await jsonBody(request));
  await applyChoices(user.id, choices);
  return NextResponse.json({ groups: await recommendationsFor(user.id, choices) });
}

export async function PATCH() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: user.onboardedAt ?? new Date() } });
  return NextResponse.json({ ok: true });
}
