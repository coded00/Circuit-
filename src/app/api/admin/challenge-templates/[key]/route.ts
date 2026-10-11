/**
 * Circuit — switch a challenge template on or off, choose its weekdays, or change its money. Super Admin only: switching a
 * template on puts a paid challenge on the homepage every chosen day, which is a money decision like the other platform
 * settings, not a staff one.
 */

import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/session";
import { readJsonObject } from "@/lib/adminRoute";
import { setTemplateState } from "@/lib/challengeTemplateAdmin";

export async function PATCH(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const auth = await requireSuperAdmin("Only a Super Admin can switch challenge templates on or off.");
  if (auth.error) return auth.error;
  const body = await readJsonObject(request);
  if (body instanceof NextResponse) return body;
  const { key } = await params;

  const result = await setTemplateState({
    key,
    actorId: auth.user.id,
    enabled: typeof body.enabled === "boolean" ? body.enabled : undefined,
    weekdays: body.weekdays,
    entryFee: body.entryFee,
    minEntrants: body.minEntrants,
    maxEntrants: body.maxEntrants,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
