/**
 * Circuit — maps a stored Notification's `type` to a category label and
 * icon for surfaces that show more than notification-format.ts's single
 * message string (the bell panel's icon chip + title/description
 * layout). Same "single source of truth per type list" shape as that
 * file, kept in sync with the same NotificationType union on purpose.
 *
 * One icon color, not one per category — five different hues (gold/
 * blue/red/green/green) on one short list read as noisy rather than
 * informative; the icon's shape already carries the category, the color
 * doesn't need to repeat it.
 */
import type { ComponentType } from "react";
import { Trophy, Swords, Flag, Users, Wallet, Bell, AtSign, MessagesSquare, ShieldAlert, Store } from "lucide-react";
import type { NotificationType } from "@/lib/notifications";

export type NotificationCategory = {
  label: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
};

export const NOTIFICATION_ICON_CLASS_NAME = "bg-surface-elevated text-accent-blue";

const TOURNAMENT: NotificationCategory = { label: "Tournament", Icon: Trophy };
const MATCH: NotificationCategory = { label: "Match", Icon: Swords };
const DISPUTE: NotificationCategory = { label: "Dispute", Icon: Flag };
const SOCIAL: NotificationCategory = { label: "Team & friends", Icon: Users };
const MARKET: NotificationCategory = { label: "Marketplace", Icon: Store };
const WALLET: NotificationCategory = { label: "Wallet", Icon: Wallet };
const COMMUNITY: NotificationCategory = { label: "Community", Icon: MessagesSquare };
const MENTION: NotificationCategory = { label: "Mention", Icon: AtSign };
const MODERATION: NotificationCategory = { label: "Moderation", Icon: ShieldAlert };
const DEFAULT: NotificationCategory = { label: "Notification", Icon: Bell };

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  REGISTRATION_CONFIRMED: TOURNAMENT,
  ACCOUNT_DELETION_REQUESTED: MODERATION,
  TOURNAMENT_UPDATE: TOURNAMENT,
  TOURNAMENT_CANCELLED: TOURNAMENT,
  TOURNAMENT_COMPLETE: TOURNAMENT,
  REGISTRATION_CAP_FILLED: TOURNAMENT,
  REGISTRATION_CLOSED: TOURNAMENT,
  NEW_TOURNAMENT: TOURNAMENT,
  MATCH_READY: MATCH,
  MATCH_LIVE: MATCH,
  RESULT_SUBMITTED: MATCH,
  MATCH_COMPLETE: MATCH,
  BATTLE_CHALLENGE: MATCH,
  BATTLE_ACCEPTED: MATCH,
  BATTLE_DECLINED: MATCH,
  ORDER_FULFILLED: MARKET,
  ORDER_CANCELLED: MARKET,
  BATTLE_EXPIRED: MATCH,
  NEW_CHALLENGE: MATCH,
  QUICK_MATCH_CHALLENGE: MATCH,
  QUICK_MATCH_ACCEPTED: MATCH,
  QUICK_MATCH_UNAVAILABLE: MATCH,
  QUICK_MATCH_EXPIRED: MATCH,
  QUICK_MATCH_CANCELLED: MATCH,
  RESULT_DISPUTED: DISPUTE,
  DISPUTE_RESOLVED: DISPUTE,
  DISPUTE_NEEDS_RULING: DISPUTE,
  DISPUTE_ESCALATED: DISPUTE,
  REPORT_FILED: DISPUTE,
  FRIEND_REQUEST: SOCIAL,
  FRIEND_ACCEPTED: SOCIAL,
  TEAM_INVITE: SOCIAL,
  TEAM_JOIN_REQUEST: SOCIAL,
  ORGANIZER_REVENUE_SETTLED: WALLET,
  WITHDRAWAL_RETURNED: WALLET,
  PRIZE_PAYOUT_FAILED: WALLET,
  PAYMENT_REFUNDED: WALLET,
  ENTRY_FEE_REFUND: WALLET,
  REGISTRATION_NAME_TAKEN: WALLET,
  COMMUNITY_MENTION: MENTION,
  COMMUNITY_APPLICATION: COMMUNITY,
  COMMUNITY_APPLICATION_APPROVED: COMMUNITY,
  COMMUNITY_REPORT: MODERATION,
  COMMUNITY_SUSPENDED: MODERATION,
  APPEAL_FILED: MODERATION,
  APPEAL_DECIDED: MODERATION,
  TEAM_ROSTER_ADDED: TOURNAMENT,
  LOBBY_STARTED: TOURNAMENT,
  LOBBY_ROUND_POSTED: TOURNAMENT,
  LOBBY_FLAG_RAISED: TOURNAMENT,
  LOBBY_FLAG_ANSWERED: TOURNAMENT,
  LOBBY_FLAG_ESCALATED: TOURNAMENT,
  LOBBY_ROOM_POSTED: TOURNAMENT,
  ROUND_ROBIN_STARTED: TOURNAMENT,
  LEAGUE_STARTED: TOURNAMENT,
  LEAGUE_RESULT_AWARDED: TOURNAMENT,
  LOBBY_FINAL_SET: TOURNAMENT,
  SWISS_BYE: TOURNAMENT,
};

export function getNotificationCategory(type: string): NotificationCategory {
  return CATEGORY_BY_TYPE[type as NotificationType] ?? DEFAULT;
}
