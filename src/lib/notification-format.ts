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
    case "MATCH_LIVE":
      return { message: "Your opponent is ready. Match is live.", href: `/matches/${str(p, "matchId")}` };
    case "RESULT_SUBMITTED":
      return { message: "Your opponent submitted a result. Your turn to respond.", href: `/matches/${str(p, "matchId")}` };
    case "MATCH_COMPLETE":
      return { message: "Your match is complete.", href: `/matches/${str(p, "matchId")}` };
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
    case "TOURNAMENT_COMPLETE":
      return {
        message: p.isOrganizer ? "Your tournament is complete." : "Your tournament is complete. Claim your prize.",
        href: p.isOrganizer
          ? `/dashboard/tournaments/${str(p, "tournamentId")}`
          : `/tournaments/${str(p, "tournamentId")}`,
      };
    case "BATTLE_CHALLENGE":
      return { message: "You've been challenged to a Battle.", href: `/battles/${str(p, "battleId")}` };
    case "BATTLE_ACCEPTED":
      return { message: "Your Challenge was accepted.", href: `/battles/${str(p, "battleId")}` };
    case "REGISTRATION_CAP_FILLED":
      return {
        message: "Registration filled. Bracket generated.",
        href: `/dashboard/tournaments/${str(p, "tournamentId")}`,
      };
    case "REGISTRATION_CLOSED":
      return {
        message: "Registration closed for your tournament.",
        href: `/dashboard/tournaments/${str(p, "tournamentId")}`,
      };
    case "DISPUTE_ESCALATED":
      return { message: "A dispute was escalated to staff.", href: "/staff/disputes" };
    case "REPORT_FILED":
      return { message: "A new abuse report was filed.", href: "/staff/reports" };
    case "FRIEND_REQUEST":
      return { message: "You have a new friend request.", href: "/friends" };
    case "FRIEND_ACCEPTED":
      return { message: "Your friend request was accepted.", href: "/friends" };
    case "TEAM_INVITE":
      return { message: "You've been invited to a team.", href: `/teams/${str(p, "teamId")}` };
    case "TEAM_JOIN_REQUEST":
      return { message: `${str(p, "fromHandle")} wants to join ${str(p, "teamName")}.`, href: `/teams/${str(p, "teamId")}` };
    case "NEW_TOURNAMENT":
      return { message: `New tournament: ${str(p, "name")}`, href: `/tournaments/${str(p, "tournamentId")}` };
    case "NEW_CHALLENGE":
      return { message: `New open Challenge: ${str(p, "game")}`, href: `/battles/${str(p, "battleId")}` };
    case "ORGANIZER_REVENUE_SETTLED":
      return { message: "Your tournament revenue was credited to your wallet.", href: "/wallet" };
    case "QUICK_MATCH_CHALLENGE":
      return {
        message: `${str(p, "hostHandle")} challenged you to a Quick Match: ${str(p, "game")}.`,
        href: `/quick-match/${str(p, "challengeId")}`,
      };
    case "QUICK_MATCH_ACCEPTED":
      return {
        message: `Match found! ${str(p, "opponentHandle")} accepted your Quick Match.`,
        href: `/battles/${str(p, "battleId")}`,
      };
    case "QUICK_MATCH_UNAVAILABLE":
      return { message: "This Quick Match was already accepted by another player.", href: "/battles" };
    case "QUICK_MATCH_EXPIRED":
      return { message: "No opponent found. Your Quick Match expired.", href: "/battles/quick-match/new" };
    case "QUICK_MATCH_CANCELLED":
      return { message: `${str(p, "hostHandle")} cancelled their Quick Match challenge.`, href: "/battles" };
    default:
      return { message: "You have a new notification.", href: "/notifications" };
  }
}
