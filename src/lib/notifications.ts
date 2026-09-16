/**
 * Circuit — notification delivery pipeline (Build Plan task P0-6).
 *
 * This is the pipe, not the wiring. Per-event triggers (NOT-1, NOT-2 — "on
 * registration confirmed, notify the player") get added in Phase 7, one per
 * feature, as that feature ships. What lives here is the one place every
 * one of those triggers calls into.
 *
 * NOT-3: in-app plus mobile web push at minimum; email/SMS is a fallback
 * channel, not primary. Only the in-app channel is implemented for now —
 * push needs a service-worker + subscription-management piece that's its
 * own task, not a P0 blocker.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendPushToAll } from "@/lib/push";
import { sendEmailBatch } from "@/lib/email";
import { formatNotification } from "@/lib/notification-format";

export type NotificationType =
  | "REGISTRATION_CONFIRMED"
  | "MATCH_READY"
  | "MATCH_LIVE"
  | "RESULT_SUBMITTED"
  | "MATCH_COMPLETE"
  | "RESULT_DISPUTED"
  | "DISPUTE_RESOLVED"
  | "TOURNAMENT_CANCELLED"
  | "TOURNAMENT_COMPLETE"
  | "BATTLE_CHALLENGE"
  | "BATTLE_ACCEPTED"
  | "REGISTRATION_CAP_FILLED"
  | "REGISTRATION_CLOSED"
  | "DISPUTE_NEEDS_RULING"
  | "DISPUTE_ESCALATED"
  | "REPORT_FILED"
  | "FRIEND_REQUEST"
  | "FRIEND_ACCEPTED"
  | "TEAM_INVITE"
  | "TEAM_JOIN_REQUEST"
  | "NEW_TOURNAMENT"
  | "NEW_CHALLENGE";

export interface NotificationChannel {
  send(userId: string, type: NotificationType, payload: Record<string, unknown>): Promise<void>;
}

/** Always-on channel — every notification lands here regardless of push/email state. */
class InAppChannel implements NotificationChannel {
  async send(userId: string, type: NotificationType, payload: Record<string, unknown>) {
    await prisma.notification.create({
      data: { userId, type, payload: payload as Prisma.InputJsonValue },
    });
  }
}

/** Placeholder — wire up web push subscriptions here when that task starts. */
class PushChannel implements NotificationChannel {
  async send(_userId: string, _type: NotificationType, _payload: Record<string, unknown>) {
    // Intentionally a no-op until push subscription storage exists.
    // Not implementing this silently-succeed-forever is the point: it's
    // easy to forget NOT-3 isn't done if this throws instead.
  }
}

const channels: NotificationChannel[] = [new InAppChannel(), new PushChannel()];

/**
 * The single entry point every feature's event trigger should call.
 * Fires exactly once per occurrence (NOT-1's acceptance criteria) — callers
 * are responsible for not calling this twice for the same event, e.g. by
 * making the triggering DB write and this call part of the same
 * transaction/idempotency key where duplication risk exists.
 */
export async function notify(
  userId: string,
  type: NotificationType,
  payload: Record<string, unknown> = {}
): Promise<void> {
  await Promise.all(channels.map((channel) => channel.send(userId, type, payload)));
}

/**
 * Fan-out to every staff account — there's no single "staff" inbox, so an
 * event staff need to see (a new report, a dispute escalation) goes to each
 * of them individually, same shape as TOURNAMENT_CANCELLED's registrant
 * fan-out in src/lib/matches.ts.
 */
export async function notifyStaff(
  type: NotificationType,
  payload: Record<string, unknown> = {}
): Promise<void> {
  const staff = await prisma.user.findMany({ where: { isStaff: true }, select: { id: true } });
  await Promise.all(staff.map((s) => notify(s.id, type, payload)));
}

/**
 * Broadcast to every user on Circuit — new-tournament/new-challenge
 * announcements only (src/app/api/tournaments/route.ts,
 * src/app/api/battles/route.ts). Deliberately not built on top of
 * `notify()`'s per-user channel loop: that shape means one OneSignal call
 * and one Resend call per user, which is both wasteful and defeats the
 * point of either provider's own bulk primitives. Instead:
 *
 *  - in-app: one bulk `createMany`, not N individual inserts. Always sent,
 *    regardless of `notifyNewContent` — InAppChannel above is the
 *    always-on channel "regardless of push/email state," and that holds
 *    here too.
 *  - push: one OneSignal call to its "Subscribed Users" segment — only
 *    users who both opted in (gating their browser subscription, see
 *    OneSignalInit) and are actually subscribed receive it.
 *  - email: one batched Resend send (chunked internally), to users who
 *    have a real `email` AND `notifyNewContent` — the one channel with no
 *    provider-side opt-in gate, so it's filtered here explicitly.
 */
export async function notifyAllUsers(type: NotificationType, payload: Record<string, unknown> = {}): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true, email: true, notifyNewContent: true } });
  if (users.length === 0) return;

  await prisma.notification.createMany({
    data: users.map((u) => ({ userId: u.id, type, payload: payload as Prisma.InputJsonValue })),
  });

  const { message } = formatNotification(type, payload);
  await sendPushToAll("Circuit", message);

  const emails = users.filter((u): u is typeof u & { email: string } => Boolean(u.email) && u.notifyNewContent).map((u) => u.email);
  await sendEmailBatch(emails, "Circuit", message);
}
