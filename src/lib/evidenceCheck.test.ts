import { describe, expect, it } from "vitest";
import { evidenceFlags, guessScoreFromText, parseExifTime } from "@/lib/evidenceCheck";

const win = { windowStartsAt: new Date("2026-10-11T12:00:00Z"), submissionsCloseAt: new Date("2026-10-11T16:00:00Z"), uploadedAt: new Date("2026-10-11T14:00:00Z") };

describe("parseExifTime", () => {
  it("reads Lagos time when there is no offset", () => {
    expect(parseExifTime("2026:10:11 13:00:00")?.toISOString()).toBe("2026-10-11T12:00:00.000Z");
  });
  it("uses the offset the phone wrote", () => {
    expect(parseExifTime("2026:10:11 13:00:00", "+00:00")?.toISOString()).toBe("2026-10-11T13:00:00.000Z");
  });
  it("refuses junk and zero dates", () => {
    expect(parseExifTime("not a date")).toBeNull();
    expect(parseExifTime("0000:00:00 00:00:00")).toBeNull();
    expect(parseExifTime(42)).toBeNull();
  });
});

describe("evidenceFlags", () => {
  const at = (iso: string) => ({ capturedAt: new Date(iso), software: null });
  it("is quiet for a screenshot taken inside the window", () => {
    expect(evidenceFlags(at("2026-10-11T13:00:00Z"), win)).toEqual([]);
  });
  it("flags one from before the window", () => {
    expect(evidenceFlags(at("2026-10-10T13:00:00Z"), win)).toEqual(["BEFORE_WINDOW"]);
  });
  it("tolerates a few minutes of clock drift", () => {
    expect(evidenceFlags(at("2026-10-11T11:55:00Z"), win)).toEqual([]);
  });
  it("flags one taken after submissions closed, and one dated after the upload", () => {
    expect(evidenceFlags(at("2026-10-11T17:00:00Z"), win)).toEqual(["AFTER_DEADLINE", "FROM_THE_FUTURE"]);
  });
  it("says plainly when there is no timestamp, and flags editors", () => {
    expect(evidenceFlags({ capturedAt: null, software: null }, win)).toEqual(["NO_TIMESTAMP"]);
    expect(evidenceFlags({ capturedAt: new Date("2026-10-11T13:00:00Z"), software: "Adobe Photoshop 25" }, win)).toEqual(["EDITING_SOFTWARE"]);
  });
});

describe("guessScoreFromText", () => {
  it("finds the number beside the stat's label", () => {
    expect(guessScoreFromText("Player Ada\nEliminations 14\nDamage 2310", ["Eliminations", "kills"])).toBe(14);
  });
  it("gives up when it is ambiguous or absent", () => {
    expect(guessScoreFromText("Eliminations 14 of 20", ["eliminations"])).toBeNull();
    expect(guessScoreFromText("Nothing useful", ["kills"])).toBeNull();
  });
});
