import { describe, expect, it } from "vitest";
import { buildDoubleElim, doubleElimPlacements, recordDoubleElimResult, resolveDoubleElim, setNodeMatch, type DEStructure } from "./doubleElim";

/** Plays every ready match until a champion, with `pick` choosing each winner. */
function playOut(s: DEStructure, pick: (a: string, b: string) => string) {
  let ready = resolveDoubleElim(s);
  let matches = 0;
  const played: string[] = [];
  const losses = new Map<string, number>();
  while (ready.length) {
    const n = ready[0];
    const matchId = `m${matches++}`;
    setNodeMatch(s, n.id, matchId);
    const winner = pick(n.playerAId!, n.playerBId!);
    const loser = winner === n.playerAId ? n.playerBId! : n.playerAId!;
    losses.set(loser, (losses.get(loser) ?? 0) + 1);
    played.push(n.id);
    recordDoubleElimResult(s, matchId, winner);
    ready = resolveDoubleElim(s);
    if (matches > 200) throw new Error("runaway");
  }
  return { matches, played, losses };
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`);
const byNumber = (a: string, b: string) => (Number(a.slice(1)) < Number(b.slice(1)) ? a : b); // lower seed wins

describe("double elimination", () => {
  it.each([2, 3, 4, 5, 6, 7, 8, 11, 16, 32])("runs %i entries to a single champion; everyone else is out on two losses", (n) => {
    const s = buildDoubleElim(ids(n));
    const { losses } = playOut(s, byNumber);
    expect(s.championId).toBe("p1");
    // The champion never lost, so no reset: everyone else went out on their second loss.
    for (const p of ids(n).slice(1)) expect(losses.get(p)).toBe(2);
    expect(losses.get("p1") ?? 0).toBe(0);
  });

  it("plays a bracket reset when the losers' side wins the grand final", () => {
    const s = buildDoubleElim(ids(4));
    // p1 beats everyone in the winners' bracket, then p2 (from the losers') beats p1 twice.
    const { played } = playOut(s, (a, b) => {
      if ([a, b].includes("p1") && [a, b].includes("p2")) {
        const gf = s.nodes.find((x) => x.id === "GF")!;
        return gf.matchId && !gf.resolved ? "p2" : gf.resolved ? "p2" : "p1";
      }
      return byNumber(a, b);
    });
    expect(played).toContain("GF2");
    expect(s.championId).toBe("p2");
    expect(doubleElimPlacements(s)).toEqual({ first: "p2", second: "p1", third: "p3" });
  });

  it("skips the reset when the winners' champion wins the grand final", () => {
    const s = buildDoubleElim(ids(4));
    const { played } = playOut(s, byNumber);
    expect(played).not.toContain("GF2");
    expect(doubleElimPlacements(s).first).toBe("p1");
  });

  it("never pairs two byes in round one", () => {
    const s = buildDoubleElim(ids(5)); // bracket of 8
    const round1 = s.nodes.filter((x) => x.id.startsWith("W1-"));
    for (const n of round1) expect(n.a.kind === "seed" && n.a.player).toBeTruthy();
  });

  it("with 2 entries, the first match's loser goes straight to the grand final", () => {
    const s = buildDoubleElim(ids(2));
    const { played } = playOut(s, () => (s.nodes.find((x) => x.id === "GF")!.matchId ? "p2" : "p1"));
    expect(played).toEqual(["W1-0", "GF", "GF2"]);
    expect(s.championId).toBe("p2");
  });
});
