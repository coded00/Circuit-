/**
 * Circuit — a community's settings. PATCH edits them (owner or staff);
 * DELETE closes a player community (owner or staff).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { CommunityError, effectiveRole } from "@/lib/community";
import { updateCommunity } from "@/lib/communityDirectory";
import { closeCommunity } from "@/lib/communityModeration";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  try {
    const community = await prisma.community.findUnique({ where: { id } });
    if (!community) throw new CommunityError("NOT_FOUND", "Community not found.");
    const role = await effectiveRole(community, user);
    if (role !== "OWNER" && !user.isStaff) throw new CommunityError("FORBIDDEN", "Only the owner can change these settings.");
    const updated = await updateCommunity(id, await jsonBody(request));
    return NextResponse.json({ ok: true, slug: updated.slug });
  } catch (err) {
    return handleCommunityError(err);
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  try {
    await closeCommunity(id, user);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
