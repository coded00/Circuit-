import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safeRedirect";
import { handleFromName, validateHandle } from "@/lib/handles";
import { flowCookie, pendingCookie, readFlowCookie, readPendingCookie } from "./flowCookies";
import { createSessionToken, verifySessionToken } from "@/lib/auth";
import { buildAuthorizationUrl, createAuthSecrets, type GoogleConfig } from "./google";
import { oauthErrorMessage } from "./errors";

describe("safeNextPath", () => {
  it("keeps same-site paths", () => {
    expect(safeNextPath("/tournaments/abc?tab=rules")).toBe("/tournaments/abc?tab=rules");
  });
  it("rejects anything that could leave the site", () => {
    for (const bad of ["https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "", null, undefined]) {
      expect(safeNextPath(bad)).toBe("/");
    }
  });
});

describe("handles", () => {
  it("validates and normalises", () => {
    expect(validateHandle("  Solomon_1 ")).toBe("solomon_1");
    expect(validateHandle("ab")).toBeNull();
    expect(validateHandle("admin")).toBeNull();
    expect(validateHandle("bad-name")).toBeNull();
  });
  it("suggests a valid starting handle from a name or email", () => {
    expect(handleFromName("Solomon Odetunde")).toBe("solomon_odetunde");
    expect(handleFromName("Ángel López")).toBe("angel_lopez");
    expect(handleFromName("jo@gmail.com")).toBe("joplayer");
    expect(validateHandle(handleFromName("😀😀"))).not.toBeNull();
  });
});

const profile = { sub: "g-123", email: "ada@example.com", name: "Ada", picture: null };

describe("flow cookies", () => {
  it("round-trips flow state and pending sign-ins", async () => {
    const flow = { ...createAuthSecrets(), intent: "signin" as const, from: "login" as const, next: "/compete" };
    const f = await flowCookie(flow);
    expect(await readFlowCookie(f.value)).toEqual(flow);
    const p = await pendingCookie({ kind: "new", profile, next: "/" });
    expect(await readPendingCookie(p.value)).toEqual({ kind: "new", profile, next: "/" });
  });

  it("rejects tampered tokens and cross-use between cookie types", async () => {
    const f = await flowCookie({ ...createAuthSecrets(), intent: "signin", from: "login", next: "/" });
    const p = await pendingCookie({ kind: "link", profile, userId: "u1", next: "/" });
    expect(await readFlowCookie(f.value.slice(0, -2) + "xx")).toBeNull();
    expect(await readPendingCookie(f.value)).toBeNull();
    expect(await readFlowCookie(p.value)).toBeNull();
  });

  it("can never be accepted as a session, and a session can't pass as either", async () => {
    const p = await pendingCookie({ kind: "link", profile, userId: "u1", next: "/" });
    expect(await verifySessionToken(p.value)).toBeNull();
    const session = await createSessionToken({ userId: "u1" });
    expect(await readPendingCookie(session)).toBeNull();
    expect(await readFlowCookie(session)).toBeNull();
  });
});

describe("authorization URL", () => {
  it("uses PKCE S256, state and nonce, never the secret", () => {
    const config: GoogleConfig = {
      clientId: "cid",
      clientSecret: "shh",
      redirectUri: "http://localhost:3000/api/auth/google/callback",
      endpoints: { authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "", jwksUrl: "", issuers: [] },
    };
    const secrets = createAuthSecrets();
    const url = new URL(buildAuthorizationUrl(config, secrets));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("code_challenge")).not.toBe(secrets.codeVerifier);
    expect(url.searchParams.get("state")).toBe(secrets.state);
    expect(url.searchParams.get("nonce")).toBe(secrets.nonce);
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.toString()).not.toContain("shh");
  });
});

it("maps only known error codes to messages", () => {
  expect(oauthErrorMessage("google_cancelled")).toMatch(/cancelled/);
  expect(oauthErrorMessage("<script>")).toBeNull();
});
