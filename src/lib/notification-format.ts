/**
 * Circuit — turns a stored Notification's (type, payload) into a
 * human-readable message + link. Single source of truth for notification
 * copy across the bell, the full inbox page, and any future email
 * fallback — so wording never drifts between surfaces.
 */

import type { NotificationType } from "@/lib/notifications";

export type FormattedNotification = { message: string; href: string };

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

export function formatNotification(type: string, payload: unknown): FormattedNotification {
  const p = asRecord(payload);

  switch (type as NotificationType) {
    case "REGISTRATION_CONFIRMED":
      return { message: "Your registration is confirmed.", href: `/tournaments/${str(p, "tournamentId")}` };
    case "MATCH_READY":
      return { message: "Your next match is ready.", href: `/matches/${str(p, "matchId")}` };
    case "RESULT_DISPUTED":
      return { message: "A match result was disputed.", href: `/matches/${str(p, "matchId")}` };
    case "DISPUTE_NEEDS_RULING":
      return { message: "A dispute needs your ruling.", href: `/matches/${str(p, "matchId")}` };
    case "DISPUTE_RESOLVED":
      return {
        message: p.voided ? "Your disputed match was voided." : "A dispute on your match was resolved.",
        href: `/matches/${str(p, "matchId")}`,
      };
    case "TOURNAMENT_CANCELLED":
      return {
        message: "A tournament you registered for was cancelled.",
        href: `/tournaments/${str(p, "tournamentId")}`,
      };
    case "BATTLE_CHALLENGE":
      return { message: "You've been challenged to a Battle.", href: `/battles/${str(p, "battleId")}` };
    case "REGISTRATION_CAP_FILLED":
      return {
        message: "Registration filled — bracket generated.",
        href: `/dashboard/tournaments/${str(p, "tournamentId")}`,
      };
    case "REGISTRATION_CLOSED":
      return {
        message: "Registration closed for your tournament.",
        href: `/dashboard/tournaments/${str(p, "tournamentId")}`,
      };
    default:
      return { message: "You have a new notification.", href: "/notifications" };
  }
}
