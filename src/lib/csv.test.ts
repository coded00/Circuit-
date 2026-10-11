import { describe, expect, it } from "vitest";
import { csvEscape } from "@/lib/csv";

describe("csvEscape", () => {
  it("defuses spreadsheet formulas", () => {
    expect(csvEscape('=HYPERLINK("http://evil","x")')).toBe(`"'=HYPERLINK(""http://evil"",""x"")"`);
    for (const lead of ["+1", "-1", "@SUM(A1)"]) expect(csvEscape(lead).startsWith("'")).toBe(true);
  });
  it("still quotes commas, quotes and newlines and leaves plain text alone", () => {
    expect(csvEscape("a,b")).toBe('"a,b"');
    expect(csvEscape("plain name")).toBe("plain name");
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""');
  });
});
