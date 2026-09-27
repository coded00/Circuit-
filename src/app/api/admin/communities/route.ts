/** Circuit — staff create an official location/interest community: POST { name, category, region?, description? }. */

import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { createOfficialCommunity } from "@/lib/communityDirectory";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

export async function POST(request: Request) {
  const auth = await requireStaff();
  if (auth.error) return auth.error;
  try {
    const community = await createOfficialCommunity(await jsonBody(request));
    await logAdminAction({ actorId: auth.user.id, action: "community.create_official", targetType: "Community", targetId: community.id });
    return NextResponse.json({ slug: community.slug }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
