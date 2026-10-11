/**
 * Circuit — Admin Daily Challenges: the list. Solo, scored competitions (docs/daily-challenges-spec.md).
 * Tabs split what is running from what is still being prepared and what is finished; the strip at the top
 * says whether the platform switch is on, because nothing here can be published or entered while it is off.
 */

import Link from "next/link";
import type { DailyChallengeStatus, Prisma } from "@prisma/client";
import { Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { loadChallengeSettings } from "@/lib/dailyChallengeSettings";
import { EmptyState, naira, PageHeader, Pagination, StatStrip, SubNav } from "@/components/admin/ui";
import { RowLink } from "@/components/admin/ui-client";
import { DailyChallengeStatusBadge } from "@/components/admin/DailyChallengeStatusBadge";
import { ChallengeTemplateRow } from "@/components/admin/ChallengeTemplateRow";
import { getCurrentUser } from "@/lib/session";
import { listTemplates } from "@/lib/challengeTemplateAdmin";

const PAGE_SIZE = 20;

const RUNNING: DailyChallengeStatus[] = ["SCHEDULED", "OPEN", "LIVE", "SUBMISSIONS_CLOSED", "UNDER_REVIEW", "PROVISIONAL", "FINALIZED", "SETTLING"];
const DONE: DailyChallengeStatus[] = ["COMPLETED", "CANCELLED"];

const TABS = ["running", "drafts", "done", "templates"] as const;
type Tab = (typeof TABS)[number];

const WHERE: Record<Tab, Prisma.DailyChallengeWhereInput> = {
  running: { status: { in: RUNNING } },
  drafts: { status: "DRAFT" },
  done: { status: { in: DONE } },
  // The templates tab lists the library, not challenges; this where matches nothing and is never queried for rows.
  templates: { id: "" },
};

function formatDate(date: Date): string {
  return date.toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" });
}

export async function DailyChallengesAdminList({ tab: tabParam, page: pageParam, subNav }: { tab?: string; page?: string; subNav: React.ReactNode }) {
  const tab: Tab = TABS.find((t) => t === tabParam) ?? "running";
  const page = Math.max(1, Number(pageParam) || 1);

  const isTemplates = tab === "templates";
  const [settings, running, drafts, done, total, rows, templates, user] = await Promise.all([
    loadChallengeSettings(),
    prisma.dailyChallenge.count({ where: WHERE.running }),
    prisma.dailyChallenge.count({ where: WHERE.drafts }),
    prisma.dailyChallenge.count({ where: WHERE.done }),
    isTemplates ? Promise.resolve(0) : prisma.dailyChallenge.count({ where: WHERE[tab] }),
    isTemplates
      ? Promise.resolve([])
      : prisma.dailyChallenge.findMany({
      where: WHERE[tab],
      orderBy: tab === "done" ? { updatedAt: "desc" } : { entryOpensAt: tab === "drafts" ? "desc" : "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { _count: { select: { entries: { where: { status: { notIn: ["WITHDRAWN", "REFUNDED"] } } } } } },
    }),
    isTemplates ? listTemplates() : Promise.resolve([]),
    getCurrentUser(),
  ]);
  const templatesOn = isTemplates ? templates.filter((t) => t.state.enabled).length : 0;

  const href = (nextPage: number) => {
    const params = new URLSearchParams();
    if (tab !== "running") params.set("tab", tab);
    if (nextPage > 1) params.set("page", String(nextPage));
    const qs = params.toString();
    return qs ? `/admin/challenges?kind=daily&${qs}` : "/admin/challenges?kind=daily";
  };

  return (
    <>
      <PageHeader
        title="Challenges"
        description="Solo competitions: players enter, play one match in a fixed window and upload the scoreboard. Staff verify the evidence and the highest verified score takes the prize."
        actions={
          <Link href="/admin/challenges/daily/new" className="btn-primary inline-flex items-center gap-1.5 text-sm">
            <Plus size={15} /> New challenge
          </Link>
        }
      />

      {subNav}

      <StatStrip
        stats={[
          { label: "Platform switch", value: settings.enabled ? "On" : "Off", tone: settings.enabled ? undefined : "attention" },
          { label: "Running", value: running.toLocaleString("en-NG") },
          { label: "Drafts", value: drafts.toLocaleString("en-NG") },
          { label: "Finished", value: done.toLocaleString("en-NG") },
        ]}
      />
      {!settings.enabled && (
        <p className="text-[13px] text-muted">
          Daily Challenges are switched off. You can prepare drafts, but nothing can be published or entered until a Super Admin turns them on in{" "}
          <Link href="/admin/settings" className="text-foreground underline">
            Settings
          </Link>
          .
        </p>
      )}

      <SubNav
        active={tab}
        items={[
          { key: "running", label: "Running", href: "/admin/challenges?kind=daily", count: running },
          { key: "drafts", label: "Drafts", href: "/admin/challenges?kind=daily&tab=drafts", count: drafts },
          { key: "done", label: "Finished", href: "/admin/challenges?kind=daily&tab=done", count: done },
          { key: "templates", label: "Templates", href: "/admin/challenges?kind=daily&tab=templates", count: 25 },
        ]}
      />

      {isTemplates && (
        <TemplateLibrary templates={templates} on={templatesOn} canEdit={user?.adminRole === "SUPER_ADMIN"} platformOn={settings.enabled} />
      )}

      {isTemplates ? null : rows.length === 0 ? (
        <EmptyState
          title={tab === "running" ? "Nothing running" : tab === "drafts" ? "No drafts" : "Nothing finished yet"}
          description={tab === "done" ? "Completed and cancelled challenges are listed here." : "Create a challenge to get started."}
        />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Challenge</th>
                  <th>Game</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Players</th>
                  <th>Status</th>
                  <th className="text-right">Entries open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <RowLink key={c.id} href={`/admin/challenges/daily/${c.id}`}>
                    <td>
                      <Link href={`/admin/challenges/daily/${c.id}`} className="font-medium text-foreground">
                        {c.title}
                      </Link>
                    </td>
                    <td className="text-muted">{c.gameName}</td>
                    <td className="text-right">{c.entryFee === 0 ? <span className="text-muted">Free</span> : naira(c.entryFee)}</td>
                    <td className="text-right tabular-nums text-muted">
                      {c._count.entries} / {c.maxEntrants}
                    </td>
                    <td>
                      <DailyChallengeStatusBadge status={c.status} paused={!!c.pausedAt} />
                    </td>
                    <td className="text-right text-muted">{formatDate(c.entryOpensAt)}</td>
                  </RowLink>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} href={href} />
        </div>
      )}
    </>
  );
}

const KIND_LABEL = { WEAPON: "Weapon", SKILL: "Skill", COMBINED: "Combined" } as const;

/**
 * The template library: 25 ready-made challenges across five games, grouped by game. Switching one ON puts its challenge on
 * the homepage on the days chosen, published automatically when it passes the publish rules. Everything starts OFF.
 */
function TemplateLibrary({ templates, on, canEdit, platformOn }: { templates: Awaited<ReturnType<typeof listTemplates>>; on: number; canEdit: boolean; platformOn: boolean }) {
  const games = [...new Set(templates.map((t) => t.template.game))];
  return (
    <div className="flex flex-col gap-5">
      <p className="text-[13px] text-muted">
        {on} of {templates.length} templates are on. Switching one on puts its challenge on the homepage on the days you choose — published automatically if it passes the
        same checks as any challenge (the platform switch on, the game published, the prizes funded within the payout cap, a recording required where the stat needs one).
        {!platformOn ? " Daily Challenges are switched off in Settings, so nothing will launch yet." : ""}
        {canEdit ? "" : " Only a Super Admin can change these."}
      </p>
      {games.map((game) => (
        <section key={game} className="flex flex-col gap-2">
          <h2 className="admin-section-title">{game}</h2>
          <div className="flex flex-col gap-2">
            {templates
              .filter((t) => t.template.game === game)
              .map((t) => (
                <ChallengeTemplateRow
                  key={t.template.key}
                  templateKey={t.template.key}
                  title={t.template.title}
                  kindLabel={KIND_LABEL[t.template.kind]}
                  game={t.template.game}
                  summary={t.template.summary}
                  checkLabel={t.template.recording ? "needs a screen recording" : "checked from a screenshot"}
                  prizeTotalNaira={naira(t.prizeTotal)}
                  gamePublished={t.gamePublished}
                  initial={{
                    enabled: t.state.enabled,
                    weekdays: t.state.weekdays,
                    entryFeeNaira: t.state.entryFee === null ? "" : String(t.state.entryFee / 100),
                    lastResult: t.state.lastResult,
                    launchedOn: t.state.launchedOn,
                  }}
                  canEdit={canEdit}
                />
              ))}
          </div>
        </section>
      ))}
    </div>
  );
}
