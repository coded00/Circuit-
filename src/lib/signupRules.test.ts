import { describe, expect, it } from "vitest";
import { formatNigerianPhone, looksLikePhone, normalizeNigerianPhone } from "./phone";
import { MIN_SIGNUP_AGE, parseSignupDateOfBirth } from "./age";

describe("normalizeNigerianPhone", () => {
  it("accepts every common way of writing the same number", () => {
    for (const input of ["08031234567", "0803 123 4567", "+2348031234567", "2348031234567", "+234 (803) 123-4567"]) {
      expect(normalizeNigerianPhone(input)).toBe("+2348031234567");
    }
  });
  it("accepts all mobile ranges", () => {
    for (const p of ["07012345678", "07112345678", "08112345678", "09012345678", "09112345678"]) expect(normalizeNigerianPhone(p)).not.toBeNull();
  });
  it("rejects landlines, short/long numbers, other countries and junk", () => {
    for (const bad of ["0123456789", "0803123456", "080312345678", "+447911123456", "08A31234567", "", "06012345678"]) {
      expect(normalizeNigerianPhone(bad)).toBeNull();
    }
  });
  it("formats for display and detects phone-shaped input", () => {
    expect(formatNigerianPhone("+2348031234567")).toBe("0803 123 4567");
    expect(looksLikePhone("0803 123 4567")).toBe(true);
    expect(looksLikePhone("ada@example.com")).toBe(false);
  });
});

describe("parseSignupDateOfBirth", () => {
  const isoYearsAgo = (years: number, dayOffset = 0) => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + dayOffset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  it(`allows exactly ${MIN_SIGNUP_AGE} today, refuses a day short`, () => {
    expect(parseSignupDateOfBirth(isoYearsAgo(MIN_SIGNUP_AGE)).ok).toBe(true);
    expect(parseSignupDateOfBirth(isoYearsAgo(MIN_SIGNUP_AGE, 1)).ok).toBe(false);
  });
  it("rejects impossible, future and implausible dates", () => {
    expect(parseSignupDateOfBirth("2000-02-30").ok).toBe(false);
    expect(parseSignupDateOfBirth(isoYearsAgo(-1)).ok).toBe(false);
    expect(parseSignupDateOfBirth("1850-01-01").ok).toBe(false);
    expect(parseSignupDateOfBirth("not a date").ok).toBe(false);
    expect(parseSignupDateOfBirth(undefined).ok).toBe(false);
  });
});
