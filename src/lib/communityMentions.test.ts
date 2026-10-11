import { describe, expect, it } from "vitest";
import { activeMentionQuery, findMentionCandidates } from "./communityMentions";
import { isAllowedReaction, summarizeReactions } from "./communityReactions";

describe("findMentionCandidates", () => {
  it("finds mentions with their exact position, lowercased", () => {
    const text = "@Solomon check this out 🔥 cc @ada_1";
    expect(findMentionCandidates(text)).toEqual([
      { handle: "solomon", start: 0, length: 8 },
      { handle: "ada_1", start: text.indexOf("@ada_1"), length: 6 },
    ]);
  });

  it("ignores email-like text, too-short handles and double @", () => {
    expect(findMentionCandidates("mail me@circuit_gg or @ab or @@solomon")).toEqual([]);
  });

  it("allows punctuation around a mention and keeps repeats", () => {
    const found = findMentionCandidates("(@tobi), @tobi!");
    expect(found.map((f) => [f.handle, f.start])).toEqual([["tobi", 1], ["tobi", 9]]);
  });

  it("stops at the 20-character handle limit rather than truncating", () => {
    expect(findMentionCandidates("@" + "a".repeat(21))).toEqual([]);
  });
});

describe("activeMentionQuery", () => {
  it("detects the @query right before the caret", () => {
    expect(activeMentionQuery("hey @sol")).toEqual({ query: "sol", start: 4 });
    expect(activeMentionQuery("@")).toEqual({ query: "", start: 0 });
    expect(activeMentionQuery("hey @sol ")).toBeNull();
    expect(activeMentionQuery("me@sol")).toBeNull();
  });
});

describe("reactions", () => {
  it("only allows emoji from the supported set", () => {
    expect(isAllowedReaction("🔥")).toBe(true);
    expect(isAllowedReaction("<script>")).toBe(false);
    expect(isAllowedReaction(42)).toBe(false);
  });

  it("groups by emoji in first-use order and flags the viewer", () => {
    const t = (s: number) => new Date(2026, 0, 1, 0, 0, s);
    const rows = [
      { emoji: "🔥", userId: "b", createdAt: t(2), user: { displayName: "Bola" } },
      { emoji: "❤️", userId: "a", createdAt: t(1), user: { displayName: "Ada" } },
      { emoji: "🔥", userId: "me", createdAt: t(3), user: { displayName: "Me" } },
    ];
    expect(summarizeReactions(rows, "me")).toEqual([
      { emoji: "❤️", count: 1, reacted: false, names: ["Ada"] },
      { emoji: "🔥", count: 2, reacted: true, names: ["Bola", "You"] },
    ]);
  });
});
