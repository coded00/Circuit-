import { describe, expect, it } from "vitest";
import { loginPath, safeNextPath } from "./safeRedirect";

describe("safeNextPath — redirect-loop and open-redirect protection", () => {
  it("never returns an auth page, so a signed-in visitor can't bounce between them", () => {
    for (const p of ["/login", "/login?next=/wallet", "/login/link", "/signup", "/signup/complete", "/forgot-password", "/reset-password?token=x"]) {
      expect(safeNextPath(p)).toBe("/");
    }
  });
  it("refuses API routes and hidden control characters", () => {
    for (const p of ["/api/auth/logout", "/api", "/\t/evil.example", "/\n/evil.example", "/a\\b"]) expect(safeNextPath(p)).toBe("/");
  });
  it("keeps look-alike page paths", () => {
    expect(safeNextPath("/login-help")).toBe("/login-help");
    expect(safeNextPath("/players/signup_king")).toBe("/players/signup_king");
  });
});

describe("loginPath", () => {
  it("encodes the return path", () => {
    expect(loginPath("/tournaments/abc/register?tab=rules")).toBe("/login?next=%2Ftournaments%2Fabc%2Fregister%3Ftab%3Drules");
  });
  it("drops a pointless or unsafe next", () => {
    expect(loginPath("/")).toBe("/login");
    expect(loginPath("//evil.example")).toBe("/login");
    expect(loginPath("/login")).toBe("/login");
  });
});
