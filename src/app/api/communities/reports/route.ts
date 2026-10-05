/**
 * Circuit — report something in a community: POST { targetType: MESSAGE |
 * MEMBER | COMMUNITY, messageId? | userId?, communityId?, reason, details? }.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { fileCommunityReport } from "@/lib/communityReports";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const key = `community-report:${user.id}`;
  if ((await isRateLimited(key, { max: 20, windowMs: 60 * 60 * 1000 })).limited) {
    return NextResponse.json({ error: "You've sent a lot of reports. Try again later." }, { status: 429 });
  }
  try {
    const report = await fileCommunityReport(user.id, await jsonBody(request));
    await recordAttempt(key);
    return NextResponse.json({ id: report.id }, { status: 201 });
  } catch (err) {
    return handleCommunityError(err);
  }
}
