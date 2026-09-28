/**
 * Circuit — double elimination: a winners' bracket, a losers' bracket
 * (a second loss knocks you out) and a grand final, with a bracket reset
 * if the losers' bracket finalist wins it. Pure functions over a JSON
 * structure stored on the Bracket row; match creation/completion live in
 * src/lib/matches.ts. Unit-tested in doubleElim.test.ts.
 *
 * Every slot is a node whose two sides come from a seed or from another
 * node's winner or loser. A node with both players known becomes a real
 * Match; one with a single player (a bye, or an empty feeder) resolves
 * on its own, so byes flow through both brackets without fake matches.
 *
 * Layout for a bracket of N = 2^k:
 * - winners' rounds 1..k (N/2, N/4, … 1 matches);
 * - losers' rounds 1..2(k-1): round 1 pairs the winners'-round-1 losers;
 *   each even round meets the survivors against the losers dropping from
 *   the next winners' round (in reverse order, to delay rematches); each
 *   odd round halves the field;
 * - grand final: winners' champion vs losers' champion; reset if the
 *   latter wins. (With 2 entries the loser of the only match goes
 *   straight to the grand final.)
 */

export const DOUBLE_ELIM_MAX_ENTRIES = 32;

export type DESource = { kind: "seed"; player: string | null } | { kind: "winner" | "loser"; node: string };

export type DENode = {
  id: string;
  bracket: "W" | "L" | "GF" | "GF2";
  round: number;
  position: number;
  a: DESource;
  b: DESource;
  playerAId: string | null;
  playerBId: string | null;
  matchId: string | null;
  winnerId: string | null;
  loserId: string | null;
  /** Decided — by a match, a bye, or because nobody reached it. */
  resolved: boolean;
};

export type DEStructure = {
  type: "DOUBLE_ELIMINATION";
  size: number;
  winnerRounds: number;
  loserRounds: number;
  nodes: DENode[];
  championId: string | null;
};

export function isDoubleElimStructure(s: unknown): s is DEStructure {
  return typeof s === "object" && s !== null && (s as { type?: unknown }).type === "DOUBLE_ELIMINATION";
}

const node = (id: string, bracket: DENode["bracket"], round: number, position: number, a: DESource, b: DESource): DENode => ({
  id,
  bracket,
  round,
  position,
  a,
  b,
  playerAId: null,
  playerBId: null,
  matchId: null,
  winnerId: null,
  loserId: null,
  resolved: false,
});

/**
 * Builds the bracket from entries in seed order. Byes fill the second
 * half of the first-round pairings, so no first-round match is empty.
 */
export function buildDoubleElim(ids: readonly string[]): DEStructure {
  let size = 2;
  while (size < ids.length) size *= 2;
  const k = Math.log2(size);
  const nodes: DENode[] = [];
  const half = size / 2;
  for (let p = 0; p < half; p++) {
    nodes.push(node(`W1-${p}`, "W", 1, p, { kind: "seed", player: ids[p] ?? null }, { kind: "seed", player: ids[p + half] ?? null }));
  }
  for (let r = 2; r <= k; r++) {
    const count = size / 2 ** r;
    for (let p = 0; p < count; p++) {
      nodes.push(node(`W${r}-${p}`, "W", r, p, { kind: "winner", node: `W${r - 1}-${2 * p}` }, { kind: "winner", node: `W${r - 1}-${2 * p + 1}` }));
    }
  }
  const loserRounds = 2 * (k - 1);
  for (let lr = 1; lr <= loserRounds; lr++) {
    if (lr === 1) {
      for (let p = 0; p < size / 4; p++) {
        nodes.push(node(`L1-${p}`, "L", 1, p, { kind: "loser", node: `W1-${2 * p}` }, { kind: "loser", node: `W1-${2 * p + 1}` }));
      }
    } else if (lr % 2 === 0) {
      const j = lr / 2;
      const count = size / 2 ** (j + 1);
      for (let p = 0; p < count; p++) {
        nodes.push(node(`L${lr}-${p}`, "L", lr, p, { kind: "winner", node: `L${lr - 1}-${p}` }, { kind: "loser", node: `W${j + 1}-${count - 1 - p}` }));
      }
    } else {
      const count = size / 2 ** ((lr + 1) / 2 + 1);
      for (let p = 0; p < count; p++) {
        nodes.push(node(`L${lr}-${p}`, "L", lr, p, { kind: "winner", node: `L${lr - 1}-${2 * p}` }, { kind: "winner", node: `L${lr - 1}-${2 * p + 1}` }));
      }
    }
  }
  const losersChampion: DESource = loserRounds > 0 ? { kind: "winner", node: `L${loserRounds}-0` } : { kind: "loser", node: "W1-0" };
  nodes.push(node("GF", "GF", 1, 0, { kind: "winner", node: `W${k}-0` }, losersChampion));
  nodes.push(node("GF2", "GF2", 1, 0, { kind: "winner", node: "GF" }, { kind: "loser", node: "GF" }));
  return { type: "DOUBLE_ELIMINATION", size, winnerRounds: k, loserRounds, nodes, championId: null };
}

function find(s: DEStructure, id: string): DENode {
  const n = s.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`No bracket node ${id}`);
  return n;
}

function side(s: DEStructure, src: DESource): { known: boolean; player: string | null } {
  if (src.kind === "seed") return { known: true, player: src.player };
  const from = find(s, src.node);
  if (!from.resolved) return { known: false, player: null };
  return { known: true, player: src.kind === "winner" ? from.winnerId : from.loserId };
}

/** Settles what follows a decided grand final: champion, or the reset. */
function afterGrandFinal(s: DEStructure, gf: DENode) {
  const reset = find(s, "GF2");
  if (gf.id === "GF") {
    // The winners' side winning (or a bye) ends it; otherwise the reset is played.
    if (gf.winnerId === null || gf.winnerId === gf.playerAId || gf.loserId === null) {
      s.championId = gf.winnerId;
      reset.resolved = true;
    }
  } else {
    s.championId = gf.winnerId;
  }
}

/**
 * Fills in everything that can be decided without a match (known players,
 * byes, empty slots) and returns the nodes now waiting for a real match —
 * the caller creates each Match and records it with setNodeMatch.
 */
export function resolveDoubleElim(s: DEStructure): DENode[] {
  let changed = true;
  while (changed) {
    changed = false;
    for (const n of s.nodes) {
      if (n.resolved || n.matchId) continue;
      if (n.id === "GF2" && !find(s, "GF").resolved) continue;
      const a = side(s, n.a);
      const b = side(s, n.b);
      if (!a.known || !b.known) continue;
      n.playerAId = a.player;
      n.playerBId = b.player;
      if (a.player && b.player) continue; // a real match — returned below
      n.winnerId = a.player ?? b.player;
      n.loserId = null;
      n.resolved = true;
      if (n.bracket === "GF" || n.bracket === "GF2") afterGrandFinal(s, n);
      changed = true;
    }
  }
  return s.nodes.filter((n) => !n.resolved && !n.matchId && n.playerAId && n.playerBId && (n.id !== "GF2" || find(s, "GF").resolved));
}

export function setNodeMatch(s: DEStructure, nodeId: string, matchId: string) {
  find(s, nodeId).matchId = matchId;
}

export function nodeByMatch(s: DEStructure, matchId: string): DENode | undefined {
  return s.nodes.find((n) => n.matchId === matchId);
}

/** Records a match result and returns the nodes that became ready. */
export function recordDoubleElimResult(s: DEStructure, matchId: string, winnerId: string): DENode[] {
  const n = nodeByMatch(s, matchId);
  if (!n || n.resolved) return [];
  n.winnerId = winnerId;
  n.loserId = winnerId === n.playerAId ? n.playerBId : n.playerAId;
  n.resolved = true;
  if (n.bracket === "GF" || n.bracket === "GF2") afterGrandFinal(s, n);
  return resolveDoubleElim(s);
}

/** Champion, runner-up, and 3rd (the losers' final loser), where decided. */
export function doubleElimPlacements(s: DEStructure): { first: string | null; second: string | null; third: string | null } {
  if (!s.championId) return { first: null, second: null, third: null };
  const gf = find(s, "GF");
  const reset = find(s, "GF2");
  const finalists = [gf.playerAId, gf.playerBId, reset.playerAId, reset.playerBId].filter(Boolean) as string[];
  const second = finalists.find((p) => p !== s.championId) ?? null;
  const lFinal = s.loserRounds > 0 ? find(s, `L${s.loserRounds}-0`) : null;
  return { first: s.championId, second, third: lFinal?.loserId ?? null };
}

/** "Winners round 1", "Winners final", "Losers final", "Grand final", "Grand final reset". */
export function nodeLabel(s: DEStructure, n: DENode): string {
  if (n.bracket === "GF") return "Grand final";
  if (n.bracket === "GF2") return "Grand final reset";
  if (n.bracket === "W") {
    if (n.round === s.winnerRounds) return "Winners final";
    if (n.round === s.winnerRounds - 1) return "Winners semi-final";
    return `Winners round ${n.round}`;
  }
  if (n.round === s.loserRounds) return "Losers final";
  return `Losers round ${n.round}`;
}

/** Match.round for a node: winners' rounds as-is, losers' 100+, grand final 200/201. */
export function nodeMatchRound(n: DENode): number {
  return n.bracket === "W" ? n.round : n.bracket === "L" ? 100 + n.round : n.bracket === "GF" ? 200 : 201;
}
