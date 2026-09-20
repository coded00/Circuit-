/**
 * Circuit — the shared 1080×1080 win-graphic renderer behind all three
 * share-card routes (Champion, wager Battle win, Top Fragger). One
 * layout function so the three `ImageResponse` routes can't visually
 * drift from each other; each route only supplies the words, colors and
 * an award kind.
 *
 * Built for Satori (the engine `next/og`'s `ImageResponse` runs on), not
 * a real browser — no Tailwind classes, no CSS variables, every element
 * needs an explicit `display`. Colors below are the real hex values
 * behind `[data-surface="dark"]` in globals.css (Satori can't read a
 * stylesheet), so this stays visually on-brand without duplicating the
 * whole token system.
 *
 * Deliberately does NOT reproduce any game's actual logo or character
 * artwork — see `gameImagery.ts`'s own header comment on why this repo
 * only ever uses verified-licensed stock photography, never fabricated
 * or trademarked assets. The bottom "game" badge is styled text (the
 * game's real name), and the edge accent is a generically evocative
 * color (`gameAccent`), not any publisher's actual brand mark.
 */

import type { ReactNode } from "react";
import { MARKER_FONT_NAME } from "@/lib/ogFonts";

const DARK_BG = "#101318";
const DARK_SURFACE = "#181c22";
const GOLD = "#f4b942";
const VOLT = "#b8f500";
const FOREGROUND = "#f8fafc";
const MUTED = "rgba(248, 250, 252, 0.6)";
const CORNER_LABEL = "rgba(248, 250, 252, 0.55)";

export type BadgeKind = "champion" | "kills" | "battle";

export type ShareCardProps = {
  /** Big marker-font headline: "Champion", "Top Fragger", "Match Winner". */
  awardLabel: string;
  badgeKind: BadgeKind;
  displayName: string;
  handle: string;
  avatarUrl: string | null;
  /** One real stat line under the handle — prize won, kills, or pot won.
   *  Kept even though the reference layout doesn't have one: this is the
   *  one piece of substantive information the card actually conveys
   *  beyond "you won something." */
  statLine: string;
  game: string;
  backgroundImage: string | null;
  backgroundTint: string;
  accentColor: string;
  /** Whether the marker font actually loaded (see `loadShareCardFonts` —
   *  Satori has no font-family fallback chain, so a failed fetch means
   *  this exact family isn't registered and must not be requested). */
  markerFontLoaded: boolean;
};

function Ring({ color, glow }: { color: string; glow: string }) {
  return { boxShadow: `0 0 0 5px ${color}, 0 0 60px 12px ${glow}` } as const;
}

function Avatar({ avatarUrl, displayName }: { avatarUrl: string | null; displayName: string }) {
  const ring = Ring({ color: GOLD, glow: "rgba(244, 185, 66, 0.5)" });
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- rendered by Satori into a PNG, not a browser DOM node
      <img src={avatarUrl} width={260} height={260} style={{ borderRadius: "50%", objectFit: "cover", ...ring }} />
    );
  }
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 260,
        height: 260,
        borderRadius: "50%",
        background: DARK_SURFACE,
        color: FOREGROUND,
        fontSize: 110,
        fontFamily: "Barlow Condensed",
        fontWeight: 800,
        ...ring,
      }}
    >
      {displayName.slice(0, 1).toUpperCase()}
    </div>
  );
}

/** Hand-drawn, minimal shapes only — deliberately not an imported icon
 *  set, so there's no dependency on whether a third-party SVG's exact
 *  attributes are within Satori's supported subset. */
function BadgeGlyph({ kind }: { kind: BadgeKind }) {
  if (kind === "kills") {
    return (
      <svg width={30} height={30} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={DARK_BG} strokeWidth="2.5" />
        <circle cx="12" cy="12" r="4.5" stroke={DARK_BG} strokeWidth="2.5" />
        <circle cx="12" cy="12" r="1.4" fill={DARK_BG} />
      </svg>
    );
  }
  if (kind === "battle") {
    return (
      <svg width={30} height={30} viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke={DARK_BG} strokeWidth="2.5" />
        <circle cx="12" cy="12" r="4" fill={DARK_BG} />
      </svg>
    );
  }
  return (
    <svg width={32} height={32} viewBox="0 0 24 24" fill={DARK_BG}>
      <path d="M2 18.5h20l-1.6-8.6-4.6 4-3.8-8-3.8 8-4.6-4L2 18.5z" />
    </svg>
  );
}

function CornerStack({ lines, align }: { lines: string[]; align: "left" | "right" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: align === "left" ? "flex-start" : "flex-end" }}>
      {lines.map((line, i) => (
        <span
          key={i}
          style={{
            fontFamily: "Inter",
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: 2,
            color: CORNER_LABEL,
            lineHeight: 1.5,
          }}
        >
          {line.toUpperCase()}
        </span>
      ))}
    </div>
  );
}

export function ShareCard({
  awardLabel,
  badgeKind,
  displayName,
  handle,
  avatarUrl,
  statLine,
  game,
  backgroundImage,
  backgroundTint,
  accentColor,
  markerFontLoaded,
}: ShareCardProps): ReactNode {
  const headlineFont = markerFontLoaded ? MARKER_FONT_NAME : "Barlow Condensed";

  return (
    <div
      style={{
        display: "flex",
        width: 1080,
        height: 1080,
        position: "relative",
        fontFamily: "Inter",
        // Always the gradient — a safety base layer, not an either/or with
        // the photo below. Callers now always pass a real photo (a known
        // game's own, or the generic cinematic-setup fallback), but if
        // that image ever fails to load at render time, Satori just skips
        // the <img> and this gradient is still there underneath instead
        // of a flat, empty background.
        background: `linear-gradient(160deg, ${backgroundTint}, ${DARK_BG})`,
      }}
    >
      {backgroundImage && (
        // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- rendered by Satori, not the browser
        <img src={backgroundImage} width={1080} height={1080} style={{ position: "absolute", inset: 0, objectFit: "cover" }} />
      )}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          background: `linear-gradient(170deg, ${DARK_BG} 38%, rgba(16,19,24,0.82) 62%, rgba(16,19,24,0.5) 100%)`,
        }}
      />

      {/* Edge accent — a generically evocative color per game, never an
          actual publisher brand mark. See this file's header comment. */}
      <div style={{ position: "absolute", top: 0, left: 0, bottom: 0, width: 10, display: "flex", background: accentColor }} />
      <div style={{ position: "absolute", left: 26, bottom: 132, display: "flex", flexDirection: "column", gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            style={{
              width: 16 - i * 4,
              height: 5,
              background: accentColor,
              opacity: 1 - i * 0.25,
            }}
          />
        ))}
      </div>

      {/* Top row */}
      <div style={{ position: "absolute", top: 52, left: 56, display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 34, color: VOLT, letterSpacing: 1 }}>CIRCUIT</span>
        <CornerStack lines={["Play", "Compete", "Belong"]} align="left" />
      </div>
      <div style={{ position: "absolute", top: 56, right: 56, display: "flex" }}>
        <CornerStack lines={["More than", "a game"]} align="right" />
      </div>

      {/* Center content. Explicit top/left/right/bottom (not the `inset`
          shorthand) — Satori doesn't reliably resolve concrete box
          dimensions for centering a flex container's children when it's
          sized via `inset: 0` alone, even though the same shorthand works
          fine for a plain full-bleed background layer with no children
          to align (see the overlay div above this one). */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 0,
        }}
      >
        <div style={{ display: "flex", position: "relative" }}>
          <Avatar avatarUrl={avatarUrl} displayName={displayName} />
          <div
            style={{
              position: "absolute",
              right: -6,
              bottom: -6,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 62,
              height: 62,
              borderRadius: "50%",
              background: GOLD,
              boxShadow: `0 0 0 6px ${DARK_BG}`,
            }}
          >
            <BadgeGlyph kind={badgeKind} />
          </div>
        </div>

        <span
          style={{
            display: "flex",
            fontFamily: headlineFont,
            fontWeight: markerFontLoaded ? 400 : 800,
            fontSize: 108,
            lineHeight: 1,
            color: GOLD,
            marginTop: 28,
            textTransform: "uppercase",
          }}
        >
          {awardLabel}
        </span>

        <span style={{ display: "flex", fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 52, color: FOREGROUND, marginTop: 18 }}>
          {displayName}
        </span>
        <span style={{ display: "flex", fontFamily: "Inter", fontWeight: 400, fontSize: 26, color: MUTED, marginTop: 6 }}>@{handle}</span>
        <span style={{ display: "flex", fontFamily: "Inter", fontWeight: 600, fontSize: 24, color: GOLD, marginTop: 22 }}>{statLine}</span>
      </div>

      {/* Bottom row */}
      <div style={{ position: "absolute", bottom: 56, left: 0, right: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 28 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            padding: "12px 32px",
            borderRadius: 999,
            border: `2px solid ${accentColor}`,
            background: "rgba(16,19,24,0.55)",
          }}
        >
          <span style={{ fontFamily: "Barlow Condensed", fontWeight: 800, fontSize: 26, color: FOREGROUND, letterSpacing: 1 }}>
            {game.toUpperCase()}
          </span>
        </div>
        <div style={{ display: "flex", width: "100%", justifyContent: "space-between", paddingLeft: 56, paddingRight: 56 }}>
          <CornerStack lines={["Same games", "Bigger stories"]} align="left" />
          <CornerStack lines={["Built for", "gamers"]} align="right" />
        </div>
      </div>
    </div>
  );
}
