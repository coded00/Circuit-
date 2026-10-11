"use client";

/**
 * Circuit — decides which way a page transition slides, without tagging
 * every <Link> by hand. Direction comes from URL depth:
 *
 *   deeper   (/compete → /tournaments/abc)      → "forward" (slides left)
 *   shallower (/tournaments/abc → /compete, or
 *             the browser back button)          → "back"    (slides right)
 *   same depth (sidebar hops, tab/filter links) → unset     (crossfade)
 *
 * Link clicks: the result goes on <html data-nav-dir> *before* Next
 * starts the navigation (a capture-phase click listener runs ahead of
 * <Link>'s own handler), so the `::view-transition-*` rules in
 * globals.css see it when the view transition begins.
 *
 * Browser back/forward: React runs popstate navigations synchronously (to
 * restore scroll), so no view transition happens and the old page is
 * already gone. Instead <html data-nav-pop> triggers a CSS entrance on the
 * new page (`.page-shell` in globals.css) from the matching side.
 *
 * <html data-nav-morph> marks link navigations to or from a tournament's
 * own page — the only time the card-art ↔ hero morph should play. Every
 * list page shows tournament art under the same names, so without this
 * a hop between two list pages (Home → Compete) would fly every shared
 * thumbnail across the screen.
 *
 * AppShell clears all of these once the page has changed, so a programmatic
 * router.push (e.g. after a form) falls back to a crossfade.
 */

import { useEffect } from "react";

function depth(pathname: string): number {
  return pathname.split("/").filter(Boolean).length;
}

export function directionBetween(from: string, to: string): "forward" | "back" | null {
  if (from === to) return null;
  const a = depth(from);
  const b = depth(to);
  if (b > a) return "forward";
  if (b < a) return "back";
  return null;
}

/** Bumped on every change, so a delayed clear can tell whether a newer
 *  navigation has set a direction since it was scheduled. */
let directionToken = 0;

const TOURNAMENT_PAGE = /^\/tournaments\/(?!new$)[^/]+$/;

function setDirection(dir: "forward" | "back" | null, { pop = false, morph = false } = {}) {
  directionToken++;
  const root = document.documentElement.dataset;
  delete root.navDir;
  delete root.navPop;
  delete root.navMorph;
  if (pop) root.navPop = dir ?? "same";
  else if (dir) root.navDir = dir;
  if (morph) root.navMorph = "";
}

/** Longer than the slowest page transition in globals.css. */
const CLEAR_AFTER_MS = 800;

/** The page we're settled on — what a browser back/forward is compared against. */
let settledPathname: string | null = null;

/** Called by AppShell once a navigation has landed: records where we are
 *  and clears the direction, so the next untagged navigation crossfades. */
export function noteNavigationSettled(pathname: string) {
  settledPathname = pathname;
  // Not immediately: the attribute drives the running animation's CSS.
  const token = directionToken;
  setTimeout(() => {
    if (directionToken === token) setDirection(null);
  }, CLEAR_AFTER_MS);
}

export function NavigationDirection() {
  useEffect(() => {
    settledPathname ??= window.location.pathname;

    function onClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const from = window.location.pathname;
      setDirection(directionBetween(from, url.pathname), {
        morph: from !== url.pathname && (TOURNAMENT_PAGE.test(from) || TOURNAMENT_PAGE.test(url.pathname)),
      });
    }

    function onPopState() {
      // The URL has already changed; compare against where we were.
      setDirection(directionBetween(settledPathname ?? window.location.pathname, window.location.pathname), { pop: true });
    }

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", onPopState);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  return null;
}
