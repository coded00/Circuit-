/**
 * Circuit — admin UI kit: the few structural pieces every admin page is
 * built from, so the control center reads as one designed product rather
 * than a stack of identical cards. Styling tokens live in globals.css
 * under `[data-admin]` / `.admin-*`; interactive pieces (clickable rows,
 * confirm-before-acting buttons) are in ui-client.tsx.
 *
 * Hierarchy, top to bottom:
 * - PageHeader: title (+ optional back link, one-line description,
 *   actions on the right). One per page.
 * - StatStrip: the page's key numbers in a single divided strip — not a
 *   grid of floating cards.
 * - Section: a titled block (title, optional description and actions)
 *   whose content is a table, a Panel, or a list.
 * - Panel: a flat hairline box for forms and grouped content.
 * - FilterBar, EmptyState, KeyValue, StatusBadge: the common parts.
 */

import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
  /** Small line under the title (status chips, ids, dates). */
  meta?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3">
      {back && (
        <Link href={back.href} className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-muted transition hover:text-foreground">
          <ChevronLeft size={15} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="admin-title">{title}</h1>
          {description && <p className="max-w-[68ch] text-[13px] leading-5 text-muted">{description}</p>}
          {meta && <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-muted">{meta}</div>}
        </div>
        {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export type Stat = {
  label: string;
  value: React.ReactNode;
  /** A short second line: change, context, "3 pending". */
  hint?: React.ReactNode;
  href?: string;
  tone?: "default" | "attention" | "danger" | "success";
};

const TONE_TEXT: Record<NonNullable<Stat["tone"]>, string> = {
  default: "text-muted",
  attention: "text-gold",
  danger: "text-danger",
  success: "text-success",
};

export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="admin-stat-strip">
      {stats.map((s) => {
        const body = (
          <>
            <span className="text-[12px] font-medium text-muted">{s.label}</span>
            <span className="admin-stat-value">{s.value}</span>
            {s.hint && <span className={`text-[12px] ${TONE_TEXT[s.tone ?? "default"]}`}>{s.hint}</span>}
          </>
        );
        return s.href ? (
          <Link key={s.label} href={s.href} className="admin-stat transition-colors hover:bg-surface-elevated">
            {body}
          </Link>
        ) : (
          <div key={s.label} className="admin-stat">
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  id,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="flex scroll-mt-20 flex-col gap-3">
      {(title || actions) && (
        <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            {title && <h2 className="admin-section-title">{title}</h2>}
            {description && <p className="text-[12px] leading-5 text-muted">{description}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export function Panel({ children, className = "", padded = true }: { children: React.ReactNode; className?: string; padded?: boolean }) {
  return <div className={`rounded-[10px] border border-border bg-surface ${padded ? "p-4 sm:p-5" : ""} ${className}`}>{children}</div>;
}

/** Rows inside a Panel separated by hairlines (settings, lists). */
export function PanelRow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-col gap-3 border-b border-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5 ${className}`}>{children}</div>;
}

/**
 * A GET filter form laid out as one compact row. Children are the fields;
 * `submitLabel` renders a secondary Apply button (filters aren't the
 * page's primary action), and `extra` sits at the end (export links, reset).
 */
export function FilterBar({ children, submitLabel = "Apply", extra, action }: { children: React.ReactNode; submitLabel?: string; extra?: React.ReactNode; action?: string }) {
  return (
    <form action={action} className="filter-bar">
      {children}
      <div className="flex items-center gap-2">
        <button type="submit" className="btn-secondary">
          {submitLabel}
        </button>
        {extra}
      </div>
    </form>
  );
}

export function Field({ label, children, grow = false, htmlFor }: { label: string; children: React.ReactNode; grow?: boolean; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className={`flex flex-col gap-1.5 ${grow ? "sm:min-w-[240px] sm:flex-1" : "sm:w-[170px]"}`}>
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[10px] border border-dashed border-border-strong px-6 py-12 text-center">
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {description && <p className="max-w-[46ch] text-[13px] text-muted">{description}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: React.ReactNode }[] }) {
  return (
    <dl className="admin-kv">
      {items.map((i) => (
        <div key={i.label} className="flex min-w-0 flex-col gap-0.5">
          <dt className="text-[12px] text-muted">{i.label}</dt>
          <dd className="truncate text-[13px] text-foreground">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export type BadgeTone = "neutral" | "live" | "success" | "attention" | "danger" | "info";

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: "bg-white/[0.06] text-muted",
  live: "bg-accent-volt/12 text-accent-volt",
  success: "bg-success/12 text-success",
  attention: "bg-gold/12 text-gold",
  danger: "bg-danger/12 text-danger",
  info: "bg-accent-blue/12 text-accent-blue",
};

/** A small status chip with an optional dot. */
export function StatusBadge({ tone = "neutral", children, dot = false }: { tone?: BadgeTone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-[6px] px-1.5 py-0.5 text-[11px] leading-4 font-medium whitespace-nowrap ${BADGE_TONE[tone]}`}>
      {dot && <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/** Initials / avatar used in admin tables. */
export function Avatar({ name, src, size = 28, square = false }: { name: string; src?: string | null; size?: number; square?: boolean }) {
  const style = { width: size, height: size };
  const shape = square ? "rounded-[7px]" : "rounded-full";
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element -- uploaded/external avatars
    return <img src={src} alt="" style={style} className={`${shape} shrink-0 border border-border object-cover`} />;
  }
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span style={style} className={`${shape} flex shrink-0 items-center justify-center border border-border bg-surface-elevated text-[10px] font-semibold text-muted`}>
      {initials || "?"}
    </span>
  );
}

/** "₦12,500" from kobo. */
export function naira(kobo: number): string {
  return `₦${(kobo / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

/** "3 users" / "1 user". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString("en-NG")} ${n === 1 ? one : many}`;
}

/** "Showing 26–50 of 312" with previous/next links. */
export function Pagination({ page, pageSize, total, href }: { page: number; pageSize: number; total: number; href: (page: number) => string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 text-[12px] text-muted">
      <span className="tabular-nums">
        {from.toLocaleString("en-NG")}–{to.toLocaleString("en-NG")} of {total.toLocaleString("en-NG")}
      </span>
      {pages > 1 && (
        <div className="flex items-center gap-1.5">
          {page > 1 ? (
            <Link href={href(page - 1)} className="btn-secondary !min-h-8 !px-2.5 !text-[12px]">
              Previous
            </Link>
          ) : (
            <span className="btn-secondary pointer-events-none !min-h-8 !px-2.5 !text-[12px] opacity-40">Previous</span>
          )}
          {page < pages ? (
            <Link href={href(page + 1)} className="btn-secondary !min-h-8 !px-2.5 !text-[12px]">
              Next
            </Link>
          ) : (
            <span className="btn-secondary pointer-events-none !min-h-8 !px-2.5 !text-[12px] opacity-40">Next</span>
          )}
        </div>
      )}
    </div>
  );
}

const TOURNAMENT_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  DRAFT: { tone: "neutral", label: "Draft" },
  OPEN: { tone: "info", label: "Registration open" },
  CLOSED: { tone: "neutral", label: "Registration closed" },
  LIVE: { tone: "live", label: "Live" },
  COMPLETE: { tone: "success", label: "Complete" },
  CANCELLED: { tone: "danger", label: "Cancelled" },
};

export function TournamentStatusBadge({ status }: { status: string }) {
  const s = TOURNAMENT_STATUS[status] ?? { tone: "neutral" as const, label: status };
  return (
    <StatusBadge tone={s.tone} dot={status === "LIVE"}>
      {s.label}
    </StatusBadge>
  );
}

const REGISTRATION_STATUS: Record<string, { tone: BadgeTone; label: string }> = {
  PENDING_PAYMENT: { tone: "attention", label: "Awaiting payment" },
  CONFIRMED: { tone: "success", label: "Confirmed" },
  WITHDRAWN: { tone: "neutral", label: "Withdrawn" },
  REFUNDED: { tone: "neutral", label: "Refunded" },
};

export function RegistrationBadge({ status }: { status: string }) {
  const s = REGISTRATION_STATUS[status] ?? { tone: "neutral" as const, label: status };
  return <StatusBadge tone={s.tone}>{s.label}</StatusBadge>;
}

/** Link tabs for sibling views of one section (Challenges / Quick Matches, Finance tabs). */
export function SubNav({ items, active }: { items: { key: string; label: string; href: string; count?: number }[]; active: string }) {
  return (
    <nav className="flex items-center gap-1 border-b border-border" aria-label="Views">
      {items.map((i) => {
        const on = i.key === active;
        return (
          <Link
            key={i.key}
            href={i.href}
            aria-current={on ? "page" : undefined}
            className={`relative -mb-px flex h-9 items-center gap-1.5 border-b-2 px-2.5 text-[13px] font-medium transition-colors ${
              on ? "border-foreground text-foreground" : "border-transparent text-muted hover:text-foreground"
            }`}
          >
            {i.label}
            {i.count !== undefined && <span className="text-[11px] text-muted-strong tabular-nums">{i.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Maps the player app's StatusPill tones onto admin badge tones. */
export function toneFor(tone: string): BadgeTone {
  switch (tone) {
    case "live":
      return "live";
    case "open":
      return "info";
    case "complete":
      return "success";
    case "cancelled":
      return "danger";
    case "attention":
      return "attention";
    default:
      return "neutral";
  }
}
