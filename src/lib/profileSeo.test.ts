import { describe, expect, it } from "vitest";
import { ageOn, isProfileIndexable } from "@/lib/profileSeo";

const NOW = new Date("2026-10-07T12:00:00Z");
const adult = { searchEngineIndexable: true, dateOfBirth: new Date("1999-05-01T00:00:00Z"), isSuspended: false, deletionRequestedAt: null };

describe("ageOn", () => {
  it("counts a birthday only once it has passed", () => {
    expect(ageOn(new Date("2008-10-07T00:00:00Z"), NOW)).toBe(18);
    expect(ageOn(new Date("2008-10-08T00:00:00Z"), NOW)).toBe(17);
  });
});

describe("isProfileIndexable", () => {
  it("allows an opted-in adult who has played", () => {
    expect(isProfileIndexable(adult, true, NOW)).toBe(true);
  });
  it("needs the opt-in", () => {
    expect(isProfileIndexable({ ...adult, searchEngineIndexable: false }, true, NOW)).toBe(false);
  });
  it("never indexes a minor, or someone whose age is unknown", () => {
    expect(isProfileIndexable({ ...adult, dateOfBirth: new Date("2010-01-01T00:00:00Z") }, true, NOW)).toBe(false);
    expect(isProfileIndexable({ ...adult, dateOfBirth: null }, true, NOW)).toBe(false);
  });
  it("skips suspended, deleting and empty profiles", () => {
    expect(isProfileIndexable({ ...adult, isSuspended: true }, true, NOW)).toBe(false);
    expect(isProfileIndexable({ ...adult, deletionRequestedAt: new Date() }, true, NOW)).toBe(false);
    expect(isProfileIndexable(adult, false, NOW)).toBe(false);
  });
});
