import { describe, expect, it } from "vitest";
import { displayGameName } from "@/lib/gameSeo";
import { parseGameInput } from "@/lib/gameCatalog";

describe("displayGameName", () => {
  it("adds the abbreviation when the full name differs", () => {
    expect(displayGameName("CODM", { name: "CODM", slug: "call-of-duty-mobile", seoName: "Call of Duty: Mobile", aliases: ["CODM"] })).toBe("Call of Duty: Mobile (CODM)");
  });
  it("leaves a name alone when there's nothing to add", () => {
    expect(displayGameName("PUBG Mobile", { name: "PUBG Mobile", slug: "pubg-mobile", seoName: "PUBG Mobile", aliases: [] })).toBe("PUBG Mobile");
    expect(displayGameName("FC Mobile", null)).toBe("FC Mobile");
  });
});

describe("parseGameInput SEO fields", () => {
  const base = { name: "CODM" };
  it("accepts a clean address, a full name and comma-separated aliases", () => {
    const r = parseGameInput({ ...base, slug: " Call-Of-Duty-Mobile ", seoName: "Call of Duty: Mobile", aliases: "CODM, COD Mobile, codm" });
    expect(r.ok && r.value.slug).toBe("call-of-duty-mobile");
    expect(r.ok && r.value.aliases).toEqual(["CODM", "COD Mobile", "codm"]);
  });
  it("rejects an address with spaces, capitals-turned-symbols or double dashes", () => {
    expect(parseGameInput({ ...base, slug: "call of duty" }).ok).toBe(false);
    expect(parseGameInput({ ...base, slug: "call--duty" }).ok).toBe(false);
    expect(parseGameInput({ ...base, slug: "-duty" }).ok).toBe(false);
  });
  it("treats the SEO fields as optional", () => {
    const r = parseGameInput(base);
    expect(r.ok && r.value.slug).toBeNull();
    expect(r.ok && r.value.aliases).toEqual([]);
  });
});
