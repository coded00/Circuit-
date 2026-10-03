/** Circuit — the member list with online status (members). */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { listMembersWithPresence } from "@/lib/communityThreads";
import { handleCommunityError } from "@/lib/communityHttp";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json(await listMembersWithPresence(id, user));
  } catch (err) {
    return handleCommunityError(err);
  }
}
