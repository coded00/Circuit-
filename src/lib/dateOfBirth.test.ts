import { describe, expect, it } from "vitest";
import { parseDateOfBirth, resolveDobChange } from "@/lib/dateOfBirth";

const dob = (iso: string) => new Date(iso);

describe("parseDateOfBirth", () => {
  it("accepts a plausible past date and refuses the future, nonsense and absurd ages", () => {
    expect(parseDateOfBirth("1995-04-12")).toMatchObject({ ok: true });
    expect(parseDateOfBirth("2999-01-01")).toEqual({ ok: false });
    expect(parseDateOfBirth("1700-01-01")).toEqual({ ok: false });
    expect(parseDateOfBirth("not a date")).toEqual({ ok: false });
    expect(parseDateOfBirth(19950412)).toEqual({ ok: false });
  });
});

describe("resolveDobChange (write-once)", () => {
  it("lets a player set it when it is empty", () => {
    expect(resolveDobChange(null, "1995-04-12")).toMatchObject({ kind: "set" });
    expect(resolveDobChange(null, null)).toEqual({ kind: "unchanged" });
    expect(resolveDobChange(null, "")).toEqual({ kind: "unchanged" });
  });
  it("refuses to change or clear it once set", () => {
    const current = dob("1995-04-12");
    expect(resolveDobChange(current, "1990-01-01")).toEqual({ kind: "locked" }); // a different year to get past the age gate
    expect(resolveDobChange(current, null)).toEqual({ kind: "locked" });
    expect(resolveDobChange(current, "")).toEqual({ kind: "locked" });
  });
  it("treats saving the same date again as no change, so an ordinary profile save still works", () => {
    expect(resolveDobChange(dob("1995-04-12"), "1995-04-12")).toEqual({ kind: "unchanged" });
  });
  it("still validates what is sent", () => {
    expect(resolveDobChange(null, "2999-01-01")).toEqual({ kind: "invalid" });
  });
});
