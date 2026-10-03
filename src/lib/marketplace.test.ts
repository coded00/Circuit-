import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/blocks", () => ({ blockedEitherWay: async () => [] }));

import { parseListingInput, formatListingPrice } from "@/lib/marketplace";

const good = { category: "SERVICE", title: "1v1 coaching", description: "An hour of CODM coaching.", priceKobo: 500_000 };

describe("parseListingInput", () => {
  it("accepts a valid listing and trims text", () => {
    const r = parseListingInput({ ...good, title: "  1v1 coaching  ", game: " CODM " });
    expect(r.ok && r.value).toMatchObject({ title: "1v1 coaching", game: "CODM", imageUrl: null });
  });
  it.each([
    ["unknown category", { category: "NOPE" }],
    ["short title", { title: "ab" }],
    ["short description", { description: "too short" }],
    ["fractional price", { priceKobo: 100.5 }],
    ["price under the minimum", { priceKobo: 100 }],
    ["price over the maximum", { priceKobo: 999_999_999 }],
    ["bad image link", { imageUrl: "javascript:alert(1)" }],
  ])("rejects %s", (_name, patch) => {
    expect(parseListingInput({ ...good, ...patch }).ok).toBe(false);
  });
  it("reads stock and the buyer prompt; empty stock means unlimited", () => {
    expect(parseListingInput({ ...good, stock: 4, buyerPrompt: " Your in-game name " })).toMatchObject({ ok: true, value: { stock: 4, buyerPrompt: "Your in-game name" } });
    expect(parseListingInput({ ...good, stock: "" })).toMatchObject({ ok: true, value: { stock: null, buyerPrompt: null } });
  });
  it.each([[-1], [1.5], [10_001], ["3"]])("rejects stock %s", (stock) => {
    expect(parseListingInput({ ...good, stock }).ok).toBe(false);
  });
  it("accepts an https download link and rejects anything else", () => {
    expect(parseListingInput({ ...good, deliveryUrl: "https://files.example.com/book.pdf" })).toMatchObject({ ok: true, value: { deliveryUrl: "https://files.example.com/book.pdf" } });
    expect(parseListingInput({ ...good, deliveryUrl: "" })).toMatchObject({ ok: true, value: { deliveryUrl: null } });
    for (const bad of ["http://files.example.com/book.pdf", "javascript:alert(1)", "not a url", "ftp://x.com/a"]) {
      expect(parseListingInput({ ...good, deliveryUrl: bad }).ok).toBe(false);
    }
  });
  it("accepts an uploaded image path", () => {
    const r = parseListingInput({ ...good, imageUrl: "/api/images/public-listing-abc123.jpg" });
    expect(r.ok).toBe(true);
  });
});

describe("formatListingPrice", () => {
  it("shows naira from kobo", () => expect(formatListingPrice(500_000)).toBe("₦5,000"));
});
