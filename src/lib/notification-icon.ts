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
import { Trophy, Swords, Flag, Users, Wallet, Bell } from "lucide-react";
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
const WALLET: NotificationCategory = { label: "Wallet", Icon: Wallet };
const DEFAULT: NotificationCategory = { label: "Notification", Icon: Bell };

const CATEGORY_BY_TYPE: Record<NotificationType, NotificationCategory> = {
  REGISTRATION_CONFIRMED: TOURNAMENT,
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
  NEW_CHALLENGE: MATCH,
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
};

export function getNotificationCategory(type: string): NotificationCategory {
  return CATEGORY_BY_TYPE[type as NotificationType] ?? DEFAULT;
}
