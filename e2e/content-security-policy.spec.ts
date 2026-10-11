import { test, expect, type Page } from "@playwright/test";

/**
 * Security audit finding #10, in the one place it can actually be checked: a browser.
 *
 * src/proxy.test.ts covers the header the server sends. It cannot cover the other half of the fix — that
 * Next.js stamps that request's nonce onto the scripts it renders — because that happens during rendering,
 * and it cannot cover the consequence, which is whether a real browser accepts the policy or blocks the
 * app's own scripts and leaves a blank page. Both are here.
 *
 * The last test is the finding itself: a script injected into the page must not run. It is the regression
 * that matters, because every other test here would still pass if the policy were quietly relaxed back to
 * 'unsafe-inline' while keeping the nonce in the header.
 */

/** Pages worth loading under the policy: the landing page, the auth pair, and two content-heavy ones. */
const PAGES = ["/", "/login", "/signup", "/communities", "/compete"];

/** Every <script> the server rendered, except JSON-LD: script-src does not apply to a non-JavaScript
 *  MIME type, so a structured-data block is not something a nonce has any bearing on. */
async function serverRenderedScripts(html: string): Promise<string[]> {
  return [...html.matchAll(/<script\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((tag) => !/type="application\/ld\+json"/i.test(tag));
}

/** Installs the violation listener before any page script runs, and hands back a reader. */
async function watchForViolations(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(`${e.effectiveDirective} → ${e.blockedURI}`);
    });
  });
  return () => page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
}

test.describe("the Content-Security-Policy", () => {
  test("is enforced rather than report-only", async ({ request }) => {
    // Finding #10's first half. Before the fix this header did not exist and the policy arrived as
    // Content-Security-Policy-Report-Only, which blocks nothing at all.
    const response = await request.get("/login");
    const policy = response.headers()["content-security-policy"];

    expect(policy, "no enforced Content-Security-Policy").toBeTruthy();
    expect(response.headers()["content-security-policy-report-only"]).toBeUndefined();
    // ...and its script-src is a nonce rather than 'unsafe-inline', which is the second half.
    const scriptSrc = policy!.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toMatch(/'nonce-[^']+'/);
    expect(scriptSrc).not.toContain("unsafe-inline");
  });

  test("stamps that request's nonce onto every script the server renders", async ({ request }) => {
    // Header and body from the same request, because the nonce is per request — a second fetch would carry
    // a different one and this would fail while the app was perfectly correct.
    const response = await request.get("/login");
    const nonce = response.headers()["content-security-policy"].match(/'nonce-([^']+)'/)![1];
    const scripts = await serverRenderedScripts(await response.text());

    expect(scripts.length).toBeGreaterThan(5);
    const withoutNonce = scripts.filter((tag) => !tag.includes(`nonce="${nonce}"`));
    // Named in the failure message: a script that loses its nonce is a blocked script, and which one it was
    // is the whole diagnosis.
    expect(withoutNonce, `scripts missing this request's nonce: ${withoutNonce.join(" ")}`).toEqual([]);
  });

  test("loads the app's pages without a single violation", async ({ page }) => {
    // Catches the failure the policy is most likely to cause in future: someone adds a third-party script,
    // an inline snippet or a new connect target, and the only symptom is a feature quietly not working.
    const violations = await watchForViolations(page);

    for (const path of PAGES) {
      await page.goto(path, { waitUntil: "networkidle" });
      expect(await violations(), `CSP violations on ${path}`).toEqual([]);
    }
  });

  test("blocks a script injected into the page — the XSS this policy is for", async ({ page }) => {
    // Finding #10 verbatim: "there is no second line of defence if one is ever introduced." This is that
    // line being tested. Verified against the code before the fix, where the same injection ran and no
    // violation was raised, because the policy was report-only.
    //
    // The listener goes on before the navigation, not after: addInitScript only takes effect on a
    // navigation that follows it, so installing it afterwards would leave the assertion below reading an
    // empty array it had never actually been listening for.
    const violations = await watchForViolations(page);
    await page.goto("/login", { waitUntil: "networkidle" });

    const executed = await page.evaluate(async () => {
      (window as unknown as { __pwned?: boolean }).__pwned = false;
      const script = document.createElement("script");
      script.textContent = "window.__pwned = true;";
      document.head.appendChild(script);
      await new Promise((r) => setTimeout(r, 50));
      return (window as unknown as { __pwned?: boolean }).__pwned === true;
    });

    expect(executed, "an injected inline script executed — the policy is not blocking scripts").toBe(false);
    // ...and the block was reported, not silent. This half is what makes the assertion above trustworthy:
    // a listener that never fired would leave `executed` false for some unrelated reason and pass anyway.
    expect(await violations()).toContain("script-src-elem → inline");
  });
});
