/**
 * Circuit — platform-wide settings (maintenance mode, the platform fee
 * rate, the organizer-revenue settlement window, payout auto-approval, and
 * the staked-Battles switch and per-account stake limits). SUPER_ADMIN only
 * — all of these affect every visitor/transaction, not a single record. Any
 * subset of fields may be sent together; at least one is required.
 */

import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/session";
import { logAdminAction } from "@/lib/auditLog";

/**
 * The most any kobo-valued setting may be — ₦20,000,000.
 *
 * Every one of these columns is a Prisma `Int`, which is a PostgreSQL INT4
 * topping out at 2,147,483,647 (₦21,474,836.47). This ceiling used to be
 * 100,000,000,000 on all four fields, which is not a value the column can
 * hold: a super admin typing a big number got a Prisma conversion error and
 * a 500 from a route whose whole job is validating that number, instead of
 * the 400 the check above it was written to give. ₦20m is round, safely
 * inside INT4, and far above any real setting — the largest default here is
 * ₦1,000,000, and a single Battle stake caps at ₦100,000.
 */
const MAX_KOBO_SETTING = 2_000_000_000;

export async function PATCH(request: Request) {
  const superAdminAuth = await requireSuperAdmin("Only a Super Admin can change platform settings.");
  if (superAdminAuth.error) return superAdminAuth.error;
  const admin = superAdminAuth.user;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const data: { maintenanceMode?: boolean; platformFeeBps?: number; organizerRevenueSettlementHours?: number; payoutAutoApprove?: boolean; payoutAutoApproveMaxKobo?: number; stakedBattlesEnabled?: boolean; maxLockedStakeKobo?: number; maxDailyStakeKobo?: number; stakePatternWindowDays?: number; stakePatternMinBattles?: number; stakePatternWinShareBps?: number; stakePatternNetAlertKobo?: number } = {};
  const actions: { action: string; metadata?: Prisma.InputJsonValue }[] = [];

  if (body.maintenanceMode !== undefined) {
    if (typeof body.maintenanceMode !== "boolean") {
      return NextResponse.json({ error: "maintenanceMode must be a boolean." }, { status: 400 });
    }
    data.maintenanceMode = body.maintenanceMode;
    actions.push({ action: body.maintenanceMode ? "settings.maintenanceOn" : "settings.maintenanceOff" });
  }

  if (body.platformFeeBps !== undefined) {
    const bps = Number(body.platformFeeBps);
    // 10000 bps = 100% — a real ceiling, not an arbitrary one: this rate
    // is carved out of what a player already paid (see PLATFORM_FEE's own
    // schema comment), so anything above 100% would be nonsensical.
    if (!Number.isInteger(bps) || bps < 0 || bps > 10000) {
      return NextResponse.json({ error: "Platform fee must be a whole number of basis points between 0 and 10000 (0-100%)." }, { status: 400 });
    }
    data.platformFeeBps = bps;
    actions.push({ action: "settings.platformFeeChange", metadata: { platformFeeBps: bps } });
  }

  if (body.organizerRevenueSettlementHours !== undefined) {
    const hours = Number(body.organizerRevenueSettlementHours);
    // Read fresh at sweep time, not snapshotted per tournament (see
    // PlatformSetting.organizerRevenueSettlementHours's own schema
    // comment) — a change here shifts every still-PENDING tournament's
    // settle point, not just new ones. 720h (30 days) is a real ceiling
    // against fat-fingering a value that'd hold organizer revenue
    // hostage indefinitely, not an arbitrary one.
    if (!Number.isInteger(hours) || hours < 0 || hours > 720) {
      return NextResponse.json(
        { error: "Settlement window must be a whole number of hours between 0 and 720 (30 days)." },
        { status: 400 }
      );
    }
    data.organizerRevenueSettlementHours = hours;
    actions.push({ action: "settings.organizerRevenueSettlementHoursChange", metadata: { organizerRevenueSettlementHours: hours } });
  }

  if (body.payoutAutoApprove !== undefined) {
    if (typeof body.payoutAutoApprove !== "boolean") {
      return NextResponse.json({ error: "payoutAutoApprove must be a boolean." }, { status: 400 });
    }
    data.payoutAutoApprove = body.payoutAutoApprove;
    actions.push({ action: body.payoutAutoApprove ? "settings.payoutAutoApproveOn" : "settings.payoutAutoApproveOff" });
  }

  if (body.payoutAutoApproveMaxKobo !== undefined) {
    const max = Number(body.payoutAutoApproveMaxKobo);
    // Kobo; 0 sends every payout to staff. The ceiling is only a guard against a mistyped amount.
    if (!Number.isInteger(max) || max < 0 || max > MAX_KOBO_SETTING) {
      return NextResponse.json({ error: "The automatic approval limit must be a whole number of kobo, 0 or more." }, { status: 400 });
    }
    data.payoutAutoApproveMaxKobo = max;
    actions.push({ action: "settings.payoutAutoApproveLimitChange", metadata: { payoutAutoApproveMaxKobo: max } });
  }

  if (body.stakedBattlesEnabled !== undefined) {
    if (typeof body.stakedBattlesEnabled !== "boolean") {
      return NextResponse.json({ error: "stakedBattlesEnabled must be a boolean." }, { status: 400 });
    }
    data.stakedBattlesEnabled = body.stakedBattlesEnabled;
    actions.push({ action: body.stakedBattlesEnabled ? "settings.stakedBattlesOn" : "settings.stakedBattlesOff" });
  }

  if (body.maxLockedStakeKobo !== undefined) {
    const max = Number(body.maxLockedStakeKobo);
    // Whole naira only: a stake is a whole number of kobo the player typed,
    // and a limit in fractional kobo is a value nobody can reason about.
    // Zero is allowed — it stops staking without turning the feature off,
    // which is the softer version of the kill switch.
    // A ceiling here is only a guard against a mistyped amount, same as the
    // payout limit's — NGN 1bn is far above any real setting. Setting this
    // below the per-Battle cap is allowed and simply makes the per-Battle cap
    // unreachable, which is a legitimate way to tighten.
    if (!Number.isInteger(max) || max < 0 || max % 100 !== 0 || max > MAX_KOBO_SETTING) {
      return NextResponse.json({ error: "The at-once stake limit must be a whole number of naira, 0 or more." }, { status: 400 });
    }
    data.maxLockedStakeKobo = max;
    actions.push({ action: "settings.maxLockedStakeChange", metadata: { maxLockedStakeKobo: max } });
  }

  if (body.maxDailyStakeKobo !== undefined) {
    const max = Number(body.maxDailyStakeKobo);
    if (!Number.isInteger(max) || max < 0 || max % 100 !== 0 || max > MAX_KOBO_SETTING) {
      return NextResponse.json({ error: "The daily stake limit must be a whole number of naira, 0 or more." }, { status: 400 });
    }
    data.maxDailyStakeKobo = max;
    actions.push({ action: "settings.maxDailyStakeChange", metadata: { maxDailyStakeKobo: max } });
  }

  // The repeated-pair detection thresholds (src/lib/stakePatterns.ts). Read
  // fresh at sweep time like the settlement window, so a change re-measures
  // every pair on the next run rather than only affecting new flags.
  if (body.stakePatternWindowDays !== undefined) {
    const days = Number(body.stakePatternWindowDays);
    // 0 is allowed and means "stop measuring" — the sweep returns early
    // rather than treating an empty window as every pair being clean, which
    // is the honest reading of "look back zero days".
    if (!Number.isInteger(days) || days < 0 || days > 365) {
      return NextResponse.json({ error: "The lookback window must be a whole number of days between 0 and 365." }, { status: 400 });
    }
    data.stakePatternWindowDays = days;
    actions.push({ action: "settings.stakePatternWindowChange", metadata: { stakePatternWindowDays: days } });
  }

  if (body.stakePatternMinBattles !== undefined) {
    const min = Number(body.stakePatternMinBattles);
    // At least 2: a "pattern" between two accounts cannot be read off a
    // single Battle, and one win is not a win record.
    if (!Number.isInteger(min) || min < 2 || min > 500) {
      return NextResponse.json({ error: "The minimum Battles must be a whole number between 2 and 500." }, { status: 400 });
    }
    data.stakePatternMinBattles = min;
    actions.push({ action: "settings.stakePatternMinBattlesChange", metadata: { stakePatternMinBattles: min } });
  }

  if (body.stakePatternWinShareBps !== undefined) {
    const bps = Number(body.stakePatternWinShareBps);
    // Same 0-10000 bps convention as the platform fee. Anything under 5000
    // is below an even split and would flag every pair that has ever played
    // twice, so 5000 is the floor — it is a real boundary, not arbitrary.
    if (!Number.isInteger(bps) || bps < 5000 || bps > 10000) {
      return NextResponse.json({ error: "The win share must be a whole number of basis points between 5000 and 10000 (50-100%)." }, { status: 400 });
    }
    data.stakePatternWinShareBps = bps;
    actions.push({ action: "settings.stakePatternWinShareChange", metadata: { stakePatternWinShareBps: bps } });
  }

  if (body.stakePatternNetAlertKobo !== undefined) {
    const max = Number(body.stakePatternNetAlertKobo);
    // Whole naira only, same as the stake limits — nobody reasons about a
    // threshold in fractional kobo.
    if (!Number.isInteger(max) || max < 0 || max % 100 !== 0 || max > MAX_KOBO_SETTING) {
      return NextResponse.json({ error: "The net-transfer threshold must be a whole number of naira, 0 or more." }, { status: 400 });
    }
    data.stakePatternNetAlertKobo = max;
    actions.push({ action: "settings.stakePatternNetAlertChange", metadata: { stakePatternNetAlertKobo: max } });
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.platformSetting.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });

  for (const { action, metadata } of actions) {
    await logAdminAction({ actorId: admin.id, action, targetType: "PlatformSetting", targetId: "singleton", metadata });
  }

  return NextResponse.json({
    maintenanceMode: updated.maintenanceMode,
    platformFeeBps: updated.platformFeeBps,
    organizerRevenueSettlementHours: updated.organizerRevenueSettlementHours,
    payoutAutoApprove: updated.payoutAutoApprove,
    payoutAutoApproveMaxKobo: updated.payoutAutoApproveMaxKobo,
    stakedBattlesEnabled: updated.stakedBattlesEnabled,
    maxLockedStakeKobo: updated.maxLockedStakeKobo,
    maxDailyStakeKobo: updated.maxDailyStakeKobo,
    stakePatternWindowDays: updated.stakePatternWindowDays,
    stakePatternMinBattles: updated.stakePatternMinBattles,
    stakePatternWinShareBps: updated.stakePatternWinShareBps,
    stakePatternNetAlertKobo: updated.stakePatternNetAlertKobo,
  });
}
