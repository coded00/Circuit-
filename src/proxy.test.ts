import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { contentSecurityPolicy, proxy } from "./proxy";

/**
 * Security audit finding #10: the policy was `Content-Security-Policy-Report-Only`, so it blocked nothing,
 * and its script-src carried 'unsafe-inline', so it would not have blocked an injected script even once
 * enforced. Two separate things had to change, and each has a test below that fails without its half:
 * the header name (Report-Only → enforced) and the script allow-list ('unsafe-inline' → nonce).
 *
 * These tests stop at the header. That Next.js then writes the nonce onto the scripts it renders is the
 * other half of the fix and is not something a unit test can see — it is proved against a real production
 * build, by fetching a page and comparing the nonce in the header with the ones in the HTML.
 */

const request = (path = "/") => new NextRequest(`http://localhost${path}`);

/** The enforced policy off the response, or throw — several tests would otherwise pass on a null header. */
function policyOf(response: ReturnType<typeof proxy>): string {
  const policy = response.headers.get("content-security-policy");
  if (policy === null) throw new Error("no Content-Security-Policy on the response");
  return policy;
}

/** The value of one directive, e.g. directive(policy, "script-src") → "'self' 'nonce-…' …". */
function directive(policy: string, name: string): string {
  const found = policy
    .split(";")
    .map((part) => part.trim())
    .find((part) => part === name || part.startsWith(`${name} `));
  if (found === undefined) throw new Error(`no ${name} directive in: ${policy}`);
  return found.slice(name.length).trim();
}

describe("the enforced policy", () => {
  it("is enforced, not report-only", () => {
    // The finding in one line. A regression that renamed this back to the Report-Only spelling would leave
    // every other assertion in this file passing while the policy blocked nothing at all.
    const response = proxy(request());
    expect(response.headers.get("content-security-policy")).not.toBeNull();
    expect(response.headers.get("content-security-policy-report-only")).toBeNull();
  });

  it("allows scripts by nonce and not by 'unsafe-inline'", () => {
    // The other half of the finding, and the half that was wrong even when enforced. 'unsafe-inline' and a
    // nonce do not coexist either: a browser ignores 'unsafe-inline' as soon as a nonce is present, so
    // leaving the keyword in would have been a policy that read as permissive and behaved as strict.
    const scriptSrc = directive(policyOf(proxy(request())), "script-src");
    expect(scriptSrc).toMatch(/'nonce-[^']+'/);
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  it("still allows the OneSignal SDK from its own host", () => {
    // Load-bearing, and the reason there is no 'strict-dynamic' (see src/proxy.ts): react-onesignal injects
    // https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js at runtime, and 'strict-dynamic' would
    // make browsers ignore this host entry. Push notifications would stop working with no error anywhere.
    expect(directive(policyOf(proxy(request())), "script-src")).toContain("https://cdn.onesignal.com");
  });

  it("keeps the directives that make the policy worth having", () => {
    // A guard, not a regression test: these were already in the report-only policy. They are asserted here
    // because moving the policy between files is exactly the change that loses one of them by accident.
    const policy = policyOf(proxy(request()));
    expect(policy).toContain("default-src 'self'");
    expect(directive(policy, "object-src")).toBe("'none'");
    expect(directive(policy, "base-uri")).toBe("'self'");
    expect(directive(policy, "form-action")).toBe("'self'");
    expect(directive(policy, "frame-ancestors")).toBe("'self'");
    expect(directive(policy, "report-uri")).toBe("/api/csp-report");
  });
});

describe("the nonce", () => {
  it("is different for every request", () => {
    // "one-time use" is the property the whole policy rests on. A module-level constant would satisfy every
    // other assertion here, be invisible in review, and hand an attacker the one value they need.
    const nonces = new Set(
      Array.from({ length: 50 }, () => directive(policyOf(proxy(request())), "script-src").match(/'nonce-([^']+)'/)![1])
    );
    expect(nonces.size).toBe(50);
  });

  it("is long enough not to be guessed", () => {
    const nonce = directive(policyOf(proxy(request())), "script-src").match(/'nonce-([^']+)'/)![1];
    // 16 random bytes in base64 — 24 characters with padding, 128 bits of entropy.
    expect(nonce.length).toBeGreaterThanOrEqual(22);
  });

  it("is the same one on the request and on the response", () => {
    // The two-header contract from the framework docs, and the failure it guards against is subtle rather
    // than loud: the request header is where Next reads the nonce it stamps onto scripts, the response
    // header is what the browser enforces. If they disagree, the page is served with a policy that blocks
    // every script on it, and the only symptom is a blank page.
    //
    // Headers passed to NextResponse.next({ request }) come back out on the response under this prefix —
    // that is how Next hands them to the render, and the same encoding the path header above is read
    // through. Asserting both, rather than just the nonce, is what makes this a test of the pair: a
    // request policy carrying a different nonce would pass a check on x-nonce alone.
    const response = proxy(request());
    const enforced = directive(policyOf(response), "script-src").match(/'nonce-([^']+)'/)![1];

    expect(response.headers.get("x-middleware-request-x-nonce")).toBe(enforced);
    expect(directive(response.headers.get("x-middleware-request-content-security-policy") ?? "", "script-src")).toBe(
      directive(policyOf(response), "script-src")
    );
  });
});

describe("development", () => {
  it("allows 'unsafe-eval' in development only", () => {
    // React uses eval to rebuild server-side error stacks in the browser, and `npm run dev` is what the e2e
    // suite drives locally — without this the local suite fails rather than the app.
    expect(contentSecurityPolicy("abc", true)).toContain("'unsafe-eval'");
    // Not in production: neither React nor Next.js use eval there, so it would be a hole with no purpose.
    expect(contentSecurityPolicy("abc", false)).not.toContain("'unsafe-eval'");
  });
});

describe("the requested path", () => {
  it("is still forwarded, for the guards that read it", () => {
    // Pre-existing behaviour this file took over, pinned so moving the CSP in here cannot quietly drop it:
    // the /admin and /dashboard layouts send a signed-out visitor back to the deep link they opened, and
    // they can only do that because this header carries it.
    const response = proxy(request("/admin/payouts?page=2"));
    expect(response.headers.get("x-middleware-request-x-circuit-path")).toBe("/admin/payouts?page=2");
  });

  it("drops the router's _rsc cache-buster before forwarding it", () => {
    const response = proxy(request("/dashboard/wallet?_rsc=1a2b3"));
    expect(response.headers.get("x-middleware-request-x-circuit-path")).toBe("/dashboard/wallet");
  });
});

describe("the matcher", () => {
  it("covers every page and excludes what is not a page", async () => {
    // The matcher is the difference between a policy that covers the app and one that covers part of it,
    // and it is a regex — so it is asserted rather than eyeballed. Read from the module's own config.
    const { config } = await import("./proxy");
    const matcher = config.matcher[0];
    expect(matcher.source).toBe("/((?!api|_next/static|_next/image|favicon.ico).*)");

    const matches = (path: string) => new RegExp(`^${matcher.source}$`).test(path);
    expect(matches("/")).toBe(true);
    expect(matches("/wallet")).toBe(true);
    expect(matches("/admin/payouts")).toBe(true);
    expect(matches("/api/auth/login")).toBe(false);
    expect(matches("/_next/static/chunks/main.js")).toBe(false);
    expect(matches("/_next/image")).toBe(false);
    expect(matches("/favicon.ico")).toBe(false);

    // Every top-level page route in the app, so the exclusions above cannot have swallowed one. It is a
    // real risk rather than a theoretical one: the lookahead matches a *prefix*, not a path segment, so
    // `(?!api…)` excludes /apiary just as readily as /api/... — there simply is no page starting with
    // those letters today, and this list is what keeps that true when someone adds one.
    for (const page of [
      "/", "/account", "/activity", "/battles", "/calendar", "/communities", "/compete", "/countries",
      "/dashboard", "/discover", "/forgot-password", "/friends", "/games", "/help", "/invite", "/ladder",
      "/leaderboard", "/login", "/marketplace", "/matches", "/notifications", "/organisers", "/players",
      "/privacy", "/quick-match", "/reset-password", "/rewards", "/share", "/signup", "/start", "/teams",
      "/terms", "/tournaments", "/verify-email", "/videos", "/wallet", "/watch", "/welcome",
    ]) {
      expect(matches(page), `${page} is not covered by the CSP matcher`).toBe(true);
    }

    // Prefetch renders no page, so it gets no nonce and no policy.
    expect(matcher.missing).toEqual([
      { type: "header", key: "next-router-prefetch" },
      { type: "header", key: "purpose", value: "prefetch" },
    ]);
  });
});
