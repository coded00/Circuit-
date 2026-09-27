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
    case "COMMUNITY_MENTION":
      return {
        message: `${str(p, "authorName") || "Someone"} mentioned you in #${str(p, "channelName") || "chat"}${
          str(p, "communityTitle") ? ` · ${str(p, "communityTitle")}` : ""
        }${str(p, "preview") ? `: “${str(p, "preview")}”` : ""}`,
        href: str(p, "href") || "/communities",
      };
    case "COMMUNITY_APPLICATION":
      return {
        message: `${str(p, "applicantName") || "Someone"} applied to join ${str(p, "communityTitle") || "your community"}.`,
        href: str(p, "href") || "/communities",
      };
    case "COMMUNITY_APPLICATION_APPROVED":
      return { message: `You're in! ${str(p, "communityTitle") || "A community"} approved your application.`, href: str(p, "href") || "/communities" };
    case "COMMUNITY_REPORT":
      return { message: `Something was reported in ${str(p, "communityTitle") || "your community"}.`, href: str(p, "href") || "/communities" };
    case "COMMUNITY_SUSPENDED":
      return {
        message: `Circuit suspended ${str(p, "communityTitle") || "your community"}${str(p, "reason") ? `: ${str(p, "reason")}` : "."} You can appeal.`,
        href: str(p, "href") || "/communities",
      };
    case "APPEAL_FILED":
      return { message: "A new appeal is waiting for review.", href: "/staff/reports?tab=appeals" };
    case "APPEAL_DECIDED":
      return {
        message: p.overturned
          ? `Your appeal was accepted — ${str(p, "subject") || "access"} is restored.`
          : `Your appeal about ${str(p, "subject") || "the suspension"} was reviewed and upheld.${str(p, "response") ? ` ${str(p, "response")}` : ""}`,
        href: str(p, "href") || "/account",
      };
    case "FRIEND_REQUEST":
      return { message: "You have a new friend request.", href: "/friends" };
    case "FRIEND_ACCEPTED":
      return { message: "Your friend request was accepted.", href: "/friends" };
    case "LOBBY_STARTED":
      return {
        message: `${str(p, "tournamentName") || "Your tournament"} has started — ${str(p, "rounds") || "several"} rounds, one lobby. Good luck.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_ROUND_POSTED":
      return {
        message: `Round ${str(p, "round")} results are up for ${str(p, "tournamentName") || "your tournament"}.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_FLAG_RAISED":
      return {
        message: `A player flagged round ${str(p, "round")} results in ${str(p, "tournamentName") || "your tournament"}.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_FLAG_ANSWERED":
      return {
        message: `${p.byStaff ? "Circuit staff" : "The organizer"} ${str(p, "outcome") === "resolved" ? "corrected" : "reviewed"} round ${str(p, "round")} after your flag.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_FLAG_ESCALATED":
      return {
        message: `A lobby results flag in ${str(p, "tournamentName") || "a tournament"} needs staff review.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "TEAM_ROSTER_ADDED":
      return {
        message: `${str(p, "teamName") || "Your team"} entered you in ${str(p, "tournamentName") || "a tournament"}.`,
        href: `/tournaments/${str(p, "tournamentId")}`,
      };
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
      return { message: "No opponent found. Your Quick Match expired.", href: "/battles/new" };
    case "QUICK_MATCH_CANCELLED":
      return { message: `${str(p, "hostHandle")} cancelled their Quick Match challenge.`, href: "/battles" };
    default:
      return { message: "You have a new notification.", href: "/notifications" };
  }
}
