/**
 * Circuit — small shared pieces for the admin catalog routes: JSON body
 * parsing and an ordered-ids reorder that validates every id belongs to
 * the parent before rewriting sortOrder.
 */

import { NextResponse } from "next/server";

export async function readJsonObject(request: Request): Promise<Record<string, unknown> | NextResponse> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  return body as Record<string, unknown>;
}

/** Validates `ids` is exactly a permutation of `existingIds`. */
export function parseReorder(body: Record<string, unknown>, existingIds: string[]): string[] | NextResponse {
  const ids = Array.isArray(body.ids) ? body.ids.filter((v): v is string => typeof v === "string") : [];
  const same = ids.length === existingIds.length && new Set(ids).size === ids.length && ids.every((id) => existingIds.includes(id));
  if (!same) return NextResponse.json({ error: "Reorder must list every item exactly once." }, { status: 400 });
  return ids;
}
