import { describe, expect, it } from "vitest";
import { countryFromSlug, countrySlug } from "@/lib/countrySeo";

describe("country addresses", () => {
  it("round-trips a country through its address", () => {
    expect(countrySlug("NG")).toBe("nigeria");
    expect(countryFromSlug("nigeria")).toBe("NG");
    expect(countryFromSlug(countrySlug("GB"))).toBe("GB");
  });
  it("doesn't invent countries", () => {
    expect(countryFromSlug("atlantis")).toBeNull();
    expect(countryFromSlug("NG")).toBeNull();
  });
});
