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

/** A kobo amount in the payload, as naira — "₦2,500". Empty if missing. */
function money(payload: Record<string, unknown>, key: string): string {
  const v = payload[key];
  return typeof v === "number" ? `₦${(v / 100).toLocaleString("en-NG")}` : "";
}

function str(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return typeof value === "string" ? value : "";
}

export function formatNotification(type: string, payload: unknown): FormattedNotification {
  const p = asRecord(payload);

  switch (type as NotificationType) {
    case "TOURNAMENT_UPDATE":
      return {
        message: `${str(p, "tournamentName") || "A tournament you're in"}: ${str(p, "snippet")}`,
        href: `/tournaments/${str(p, "tournamentId")}?tab=updates`,
      };
    case "ACCOUNT_DELETION_REQUESTED":
      return { message: `@${str(p, "handle")} asked to delete their account.`, href: `/admin/users/${str(p, "userId")}` };
    case "REGISTRATION_CONFIRMED":
      return {
        message: str(p, "tournamentName") ? `You're in ${str(p, "tournamentName")}. Your registration is confirmed.` : "Your registration is confirmed.",
        href: `/tournaments/${str(p, "tournamentId")}`,
      };
    case "MATCH_READY":
      return { message: "It's almost time. Your next match is ready.", href: `/matches/${str(p, "matchId")}` };
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
    case "BATTLE_DECLINED":
      return {
        message: `${str(p, "byName") || "The player you challenged"} declined your ${str(p, "game") || ""} challenge.`.replace("  ", " "),
        href: `/battles/${str(p, "battleId")}`,
      };
    case "ORDER_PAID":
      return {
        message: p.instant === true ? `Payment received for ${str(p, "title") || "your order"}. Your download is ready.` : `Payment received for ${str(p, "title") || "your order"}. Circuit will deliver it and let you know.`,
        href: `/marketplace/orders/${str(p, "orderId")}`,
      };
    case "CARD_REFUND_FAILED":
      return { message: `A ${money(p, "amount")} card refund for ${str(p, "title") || "an order"} failed. Retry it from the orders page.`, href: "/admin/marketplace/orders?show=cancelled" };
    case "ORDER_FULFILLED":
      return { message: `Order delivered: ${str(p, "title") || "see the details"}.`, href: "/marketplace/orders" };
    case "ORDER_CANCELLED":
      return { message: `Order refunded to your ${str(p, "method") === "CARD" ? "card" : "wallet"}: ${str(p, "title") || ""}.`.replace(": .", "."), href: "/marketplace/orders" };
    case "BATTLE_EXPIRED":
      return { message: `Your ${str(p, "game") || ""} challenge expired with no takers.`.replace("  ", " "), href: `/battles/${str(p, "battleId")}` };
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
      return { message: "A dispute was escalated to staff.", href: "/admin/disputes" };
    case "REPORT_FILED":
      return { message: "A new abuse report was filed.", href: "/admin/reports" };
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
      return { message: "A new appeal is waiting for review.", href: "/admin/reports?tab=appeals" };
    case "APPEAL_DECIDED":
      return {
        message: p.overturned
          ? `Your appeal was accepted, ${str(p, "subject") || "access"} is restored.`
          : `Your appeal about ${str(p, "subject") || "the suspension"} was reviewed and upheld.${str(p, "response") ? ` ${str(p, "response")}` : ""}`,
        href: str(p, "href") || "/account",
      };
    case "FRIEND_REQUEST":
      return { message: "You have a new friend request.", href: "/friends" };
    case "FRIEND_ACCEPTED":
      return { message: "Your friend request was accepted.", href: "/friends" };
    case "LOBBY_STARTED":
      return {
        message: str(p, "group")
          ? `${str(p, "tournamentName") || "Your tournament"} has started. You're in Group ${str(p, "group")} for ${str(p, "rounds") || "several"} rounds. Good luck.`
          : `${str(p, "tournamentName") || "Your tournament"} has started, ${str(p, "rounds") || "several"} rounds, one lobby. Good luck.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_ROUND_POSTED":
      return {
        message: `${/^\d+$/.test(str(p, "round")) ? `Round ${str(p, "round")}` : str(p, "round") || "Round"} results are up for ${str(p, "tournamentName") || "your tournament"}.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_FLAG_RAISED":
      return {
        message: `A player flagged ${/^\d+$/.test(str(p, "round")) ? `round ${str(p, "round")}` : str(p, "round")} results in ${str(p, "tournamentName") || "your tournament"}.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_FLAG_ANSWERED":
      return {
        message: `${p.byStaff ? "Circuit staff" : "The organizer"} ${str(p, "outcome") === "resolved" ? "corrected" : "reviewed"} ${/^\d+$/.test(str(p, "round")) ? `round ${str(p, "round")}` : str(p, "round")} after your flag.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_FINAL_SET":
      return {
        message: p.qualified
          ? `You're through to the final of ${str(p, "tournamentName") || "your tournament"}, ${str(p, "rounds") || "several"} rounds, points start fresh.`
          : `The group stage of ${str(p, "tournamentName") || "your tournament"} is over. You didn't make the final this time.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "SWISS_BYE":
      return {
        message: `You have a bye in round ${str(p, "round")} of ${str(p, "rounds")} of ${str(p, "tournamentName") || "your tournament"}. It counts as a win.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LEAGUE_STARTED":
      return {
        message: `${str(p, "tournamentName") || "Your league"} has started, ${str(p, "matches") || "several"} matches to play. The first matchday is due ${str(p, "firstDeadline") ? new Date(str(p, "firstDeadline")).toLocaleDateString("en-NG", { day: "numeric", month: "short" }) : "soon"}.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LEAGUE_RESULT_AWARDED": {
      const outcome = str(p, "outcome");
      return {
        message: `The organizer settled your unplayed fixture in ${str(p, "tournamentName") || "the league"}: ${outcome === "WIN" ? "you were awarded the win" : outcome === "LOSS" ? "it was awarded to your opponent" : "it was recorded as a draw"}.`,
        href: `/matches/${str(p, "matchId")}`,
      };
    }
    case "ROUND_ROBIN_STARTED":
      return {
        message: `${str(p, "tournamentName") || "Your tournament"} has started. You have ${str(p, "matches") || "several"} matches to play, in any order.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "LOBBY_ROOM_POSTED":
      return {
        message: `Room details for ${str(p, "rounds") || "the next round"} of ${str(p, "tournamentName") || "your tournament"} are up.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket?tab=rounds`,
      };
    case "LOBBY_FLAG_ESCALATED":
      return {
        message: `A lobby results flag in ${str(p, "tournamentName") || "a tournament"} needs staff review.`,
        href: `/tournaments/${str(p, "tournamentId")}/bracket`,
      };
    case "TEAM_ROSTER_ADDED":
      return {
        message: `${str(p, "teamName") || "Your team"} entered you in ${str(p, "tournamentName") || "a tournament"}.${
          str(p, "sharePercent") ? ` If the team wins prize money, you get ${str(p, "sharePercent")}% of it, paid to your own account.` : ""
        }`,
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
    case "WITHDRAWAL_RETURNED":
      return { message: `Your withdrawal of ${money(p, "amount")} didn't go through. The money is back in your wallet.`, href: "/wallet" };
    case "PRIZE_PAYOUT_FAILED":
      return {
        message: `Your ${money(p, "amount")} prize from ${str(p, "tournamentName") || "your tournament"} couldn't be sent. Check your payout details and claim it again.`,
        href: `/tournaments/${str(p, "tournamentId")}`,
      };
    case "PAYMENT_REFUNDED":
      return {
        message: `Your ${money(p, "amount")} entry-fee payment for ${str(p, "tournamentName") || "a tournament"} came through after you'd left, so it's been refunded.`,
        href: "/wallet",
      };
    case "REGISTRATION_NAME_TAKEN":
      return {
        message: `Your entry for ${str(p, "tournamentName") || "a tournament"} couldn't be confirmed: another player took the in-game name "${str(p, "inGameName")}" while you were paying. Your payment is being refunded. Register again with a different name.`,
        href: `/tournaments/${str(p, "tournamentId")}`,
      };
    case "ENTRY_FEE_REFUND": {
      const what = `${money(p, "amount")} entry fee for ${str(p, "tournamentName") || "a tournament"}`;
      const stage = str(p, "stage");
      const message =
        stage === "WALLET"
          ? `Your ${what} has been refunded to your Circuit wallet.`
          : stage === "DONE"
            ? `Your ${what} refund has been completed. Your bank may take a few days to show it.`
            : stage === "FAILED"
              ? `Your ${what} refund didn't go through. Circuit has been alerted and will sort it out. You don't need to do anything.`
              : `Your ${what} is being refunded to the card or account you paid with. It can take a few days to show up.`;
      return { message, href: stage === "WALLET" ? "/wallet" : `/tournaments/${str(p, "tournamentId")}` };
    }
    case "PAYOUT_APPROVED": {
      const from = new Date(str(p, "claimFrom"));
      const ready = Number.isNaN(from.getTime()) || from.getTime() <= Date.now();
      return {
        message: `Your ${money(p, "amount")} prize from ${str(p, "tournamentName") || "your tournament"} is approved. ${ready ? "You can claim it now." : `You can claim it from ${from.toLocaleDateString("en-NG", { day: "numeric", month: "short" })}.`}`,
        href: `/tournaments/${str(p, "tournamentId")}`,
      };
    }
    case "ORGANIZER_PAYOUT_APPROVED":
      return { message: `Your ${money(p, "amount")} from ${str(p, "tournamentName") || "your tournament"} is approved and will be credited to your wallet shortly.`, href: "/wallet" };
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
