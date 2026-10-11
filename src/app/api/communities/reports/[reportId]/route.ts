/** Circuit — act on a community report (moderators, or staff): PATCH { action, note? }. */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";
import { resolveReport, type ReportAction } from "@/lib/communityReports";
import { handleCommunityError, jsonBody } from "@/lib/communityHttp";

const ACTIONS: ReportAction[] = ["dismiss", "remove_message", "mute_1h", "mute_24h", "mute_7d", "ban", "escalate", "suspend_community"];

export async function PATCH(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;
  const { reportId } = await params;
  const body = await jsonBody(request);
  if (!ACTIONS.includes(body.action as ReportAction)) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  try {
    await resolveReport(reportId, user, body.action as ReportAction, typeof body.note === "string" ? body.note : undefined);
    if (user.isStaff) await logAdminAction({ actorId: user.id, action: `community-report.${body.action}`, targetType: "CommunityReport", targetId: reportId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleCommunityError(err);
  }
}
