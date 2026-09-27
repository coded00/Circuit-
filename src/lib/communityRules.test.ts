import { describe, expect, it } from "vitest";
import {
  activityScore,
  generateInviteCode,
  INVITE_CODE_PATTERN,
  inviteProblem,
  normalizeChannelName,
  optionalText,
  slugify,
  validateCommunityName,
  validateSlug,
  validateTag,
} from "./communityRules";

describe("slugs", () => {
  it("slugifies display names", () => {
    expect(slugify("Lagos FC Crew!")).toBe("lagos-fc-crew");
    expect(slugify("  Ọ̀yọ́ Gamers  ")).toBe("oyo-gamers");
    expect(slugify("---")).toBe("");
  });
  it("accepts valid slugs and refuses reserved or malformed ones", () => {
    expect(validateSlug("unilag-esports")).toBe("unilag-esports");
    expect(validateSlug("UNILAG")).toBe("unilag");
    for (const bad of ["ab", "-lead", "trail-", "double--dash", "has space", "new", "circuit", "settings", "a".repeat(33)]) {
      expect(validateSlug(bad)).toBeNull();
    }
    expect(validateSlug("circuit", { allowReserved: true })).toBe("circuit");
  });
});

describe("names, tags and channels", () => {
  it("collapses whitespace and bounds length", () => {
    expect(validateCommunityName("  Abuja   Warzone  ")).toBe("Abuja Warzone");
    expect(validateCommunityName("ab")).toBeNull();
    expect(validateCommunityName("x".repeat(41))).toBeNull();
  });
  it("tags are 2-5 alphanumerics, uppercased; empty clears", () => {
    expect(validateTag("lgs")).toEqual({ ok: true, tag: "LGS" });
    expect(validateTag("")).toEqual({ ok: true, tag: null });
    expect(validateTag("A")).toEqual({ ok: false });
    expect(validateTag("TOOLONG")).toEqual({ ok: false });
    expect(validateTag("A-B")).toEqual({ ok: false });
    expect(validateTag("staff")).toEqual({ ok: false });
  });
  it("channel names become lowercase-hyphenated", () => {
    expect(normalizeChannelName("Looking For Squad")).toBe("looking-for-squad");
    expect(normalizeChannelName("#clips!!")).toBe("clips");
    expect(normalizeChannelName("x")).toBeNull();
  });
  it("optional text trims, nulls empties and rejects overlong", () => {
    expect(optionalText("  hi ", 10)).toEqual({ ok: true, value: "hi" });
    expect(optionalText("   ", 10)).toEqual({ ok: true, value: null });
    expect(optionalText(undefined, 10)).toEqual({ ok: true, value: null });
    expect(optionalText("x".repeat(11), 10)).toEqual({ ok: false });
    expect(optionalText(5, 10)).toEqual({ ok: false });
  });
});

describe("invites", () => {
  it("codes are 8 unambiguous characters", () => {
    const codes = new Set(Array.from({ length: 200 }, generateInviteCode));
    expect(codes.size).toBe(200);
    for (const c of codes) {
      expect(c).toMatch(INVITE_CODE_PATTERN);
      expect(c).toHaveLength(8);
      expect(c).not.toMatch(/[0O1lI]/);
    }
  });
  it("reports why an invite no longer works", () => {
    const base = { revokedAt: null, expiresAt: null, maxUses: null, uses: 0 };
    const now = new Date("2026-09-27T12:00:00Z");
    expect(inviteProblem(base, now)).toBeNull();
    expect(inviteProblem({ ...base, revokedAt: now }, now)).toBe("revoked");
    expect(inviteProblem({ ...base, expiresAt: new Date("2026-09-27T11:59:59Z") }, now)).toBe("expired");
    expect(inviteProblem({ ...base, maxUses: 5, uses: 5 }, now)).toBe("used_up");
    expect(inviteProblem({ ...base, maxUses: 5, uses: 4 }, now)).toBeNull();
  });
});

describe("activity score", () => {
  it("ranks many people talking above one person spamming", () => {
    const spam = activityScore({ messages: 500, posters: 1, newMembers: 0 });
    const lively = activityScore({ messages: 60, posters: 12, newMembers: 0 });
    expect(lively).toBeGreaterThan(spam);
  });
  it("is zero for a silent community", () => {
    expect(activityScore({ messages: 0, posters: 0, newMembers: 0 })).toBe(0);
  });
});
