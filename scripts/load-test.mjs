// Circuit — load test. Creates N throwaway "TEST-" users (+ a TEST- organizer, tournaments
// and a listing), mints their session cookies directly, and has them act concurrently
// against a running server: browsing, social posts, community chat, marketplace orders,
// tournament registration (free + paid), challenges (open battles + quick matches),
// wallet deposits and withdrawals. Everything is tagged "TEST-" and removed by `cleanup`.
//
// Deposits and withdrawals go through a fake Paystack (scripts/fake-paystack.mjs) so no real
// payment API is touched. Start the app with:
//   PAYSTACK_BASE_URL=http://localhost:4010   (works only with an sk_test_ key)
//
//   node --env-file=.env scripts/load-test.mjs setup [users=120]
//   node --env-file=.env scripts/load-test.mjs run [users=120] [seconds=60] [base=http://localhost:3000]
//   node --env-file=.env scripts/load-test.mjs cleanup
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { createHmac, randomUUID } from "crypto";
import { writeFileSync, readFileSync, existsSync, unlinkSync } from "fs";
import { startFakePaystack } from "./fake-paystack.mjs";

const prisma = new PrismaClient();
const STATE = "scripts/.load-state.json";
const [, , cmd = "run", usersArg = "120", secsArg = "60", baseArg = "http://localhost:3000"] = process.argv;
const N = Number(usersArg);
const SECONDS = Number(secsArg);
const BASE = baseArg;
const FAKE = "http://localhost:4010";
const START_WALLET = 5_000_000;
const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const sign = (userId) => new SignJWT({ userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("3h").sign(secret);
const stamp = Date.now();

async function setup() {
  if (!process.env.PAYSTACK_SECRET_KEY?.startsWith("sk_test_")) throw new Error("refusing to run without an sk_test_ Paystack key");
  const adult = new Date("1995-01-01");
  const base = (id, label, extra = {}) => ({
    id,
    displayName: `TEST-Load-${stamp}-${label}`,
    handle: `test-load-${stamp}-${label}`,
    emailOrPhone: `test-load-${stamp}-${label}@example.com`,
    walletBalance: START_WALLET,
    emailVerifiedAt: new Date(),
    dateOfBirth: adult,
    country: "Nigeria",
    payoutMethodRef: `RCP_${id}`,
    ...extra,
  });
  const org = await prisma.user.create({ data: base(randomUUID(), "org", { isStaff: true }) });
  await prisma.organizerProfile.create({ data: { userId: org.id } });
  const t = (name, over) => prisma.tournament.create({
    data: {
      organizerId: org.id, name: `TEST-Load-${name}-${stamp}`, game: "Test Game", status: "OPEN",
      registrationOpenAt: new Date(Date.now() - 3_600_000), registrationCloseAt: new Date(Date.now() + 86_400_000),
      startAt: new Date(Date.now() + 172_800_000), ...over,
    },
  });
  const freeT = await t("free", { participantCap: Math.max(64, Math.floor(N / 2)), entryFee: 0 });
  const paidT = await t("paid", { participantCap: Math.max(40, Math.floor(N / 4)), entryFee: 100_000 });
  const listing = await prisma.listing.create({
    data: { sellerId: org.id, category: "STORE", title: `TEST-Load-Tee-${stamp}`, description: "Load test product.", priceKobo: 500_000, stock: Math.max(25, Math.floor(N / 5)) },
  });
  const rows = Array.from({ length: N }, (_, i) => base(randomUUID(), String(i)));
  for (let i = 0; i < rows.length; i += 250) await prisma.user.createMany({ data: rows.slice(i, i + 250) });
  if ((await prisma.community.count({ where: { kind: "PLAYER", enabled: true } })) < 3) {
    // A fresh database (the local one) has no communities to chat in: make a few.
    for (let i = 0; i < 3; i++) {
      await prisma.community.create({ data: { kind: "PLAYER", name: `TEST-Load-Community-${stamp}-${i}`, slug: `test-load-${stamp}-${i}`, joinPolicy: "OPEN", ownerId: org.id, channels: { create: { key: "general", name: "general" } } } });
    }
  }
  const communities = await prisma.community.findMany({
    where: { kind: "PLAYER", enabled: true },
    select: { id: true, channels: { where: { modOnly: false, slowModeSeconds: 0 }, select: { id: true }, take: 1 } },
    take: 4,
  });
  writeFileSync(STATE, JSON.stringify({
    stamp, orgId: org.id, freeT: freeT.id, paidT: paidT.id, listing: listing.id, freeCap: freeT.participantCap, paidCap: paidT.participantCap,
    stockStart: listing.stock,
    communities: communities.map((c) => ({ id: c.id, channelId: c.channels[0]?.id ?? null })),
    users: rows.map((u) => ({ id: u.id, handle: u.handle })),
  }));
  console.log(`setup: ${N} users, free cap ${freeT.participantCap}, paid cap ${paidT.participantCap}, stock ${listing.stock}`);
}

// ---- metrics ----
const stats = new Map();
function record(key, ms, status) {
  let s = stats.get(key);
  if (!s) stats.set(key, (s = { n: 0, ms: [], status: {} }));
  s.n++; s.ms.push(ms); s.status[status] = (s.status[status] ?? 0) + 1;
}

function client(token) {
  return async (key, method, path, body, { raw = false, headers = {}, base = BASE } = {}) => {
    const t0 = performance.now();
    try {
      const res = await fetch(base + path, {
        method,
        headers: { ...(raw ? {} : { cookie: `circuit_session=${token}` }), ...(body ? { "content-type": "application/json" } : {}), ...headers },
        body: body ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined,
        redirect: "manual",
        signal: AbortSignal.timeout(30_000),
      });
      const text = await res.text();
      record(key, performance.now() - t0, res.status);
      let json = null;
      try { json = JSON.parse(text); } catch { /* html */ }
      return { status: res.status, json };
    } catch (e) {
      record(key, performance.now() - t0, e.name === "TimeoutError" ? "timeout" : `neterr:${e.cause?.code ?? e.message}`);
      return null;
    }
  };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const think = () => sleep(300 + Math.random() * 1500);

const webhook = (c, event, data) => {
  const body = JSON.stringify({ event, data });
  const sig = createHmac("sha512", process.env.PAYSTACK_SECRET_KEY).update(body).digest("hex");
  return c(`WEBHOOK ${event}`, "POST", "/api/webhooks/paystack", body, { raw: true, headers: { "x-paystack-signature": sig } });
};

const PERSONAS = {
  async browser(c, st) {
    const page = pick(["/", "/compete", "/marketplace", "/communities", "/leaderboard", "/ladder", "/battles", "/calendar", `/tournaments/${st.freeT}`, `/marketplace/${st.listing}`]);
    await c(`GET ${page.replace(/[a-z0-9-]{20,}/g, ":id")}`, "GET", page);
    if (Math.random() < 0.4) await c("GET /api/search", "GET", `/api/search?q=${pick(["test", "lagos", "codm", "circuit", "fifa"])}`);
  },
  async social(c, st, me, others) {
    const r = Math.random();
    if (r < 0.3) await c("POST /api/community/posts", "POST", "/api/community/posts", { content: `load test post ${Math.random().toString(36).slice(2)}` });
    else if (r < 0.5) await c("POST /api/communities/:id/join", "POST", `/api/communities/${pick(st.communities).id}/join`, { acceptRules: true });
    else if (r < 0.65) await c("POST /api/friends", "POST", "/api/friends", { handle: pick(others).handle });
    else if (r < 0.8) await c("GET /api/community/posts", "GET", "/api/community/posts?scope=all");
    else { await c("GET /api/notifications", "GET", "/api/notifications"); await c("POST /api/presence/heartbeat", "POST", "/api/presence/heartbeat"); }
  },
  async chatter(c, st, me) {
    const com = pick(st.communities.filter((x) => x.channelId));
    if (!com) return;
    if (!me.joined) { await c("POST /api/communities/:id/join", "POST", `/api/communities/${com.id}/join`, { acceptRules: true }); me.joined = com; }
    const home = me.joined;
    const r = Math.random();
    if (r < 0.4) await c("POST channel message", "POST", `/api/channels/${home.channelId}/messages`, { content: `hello from load test ${Math.random().toString(36).slice(2, 8)}` });
    else if (r < 0.65) await c("GET channel messages", "GET", `/api/channels/${home.channelId}/messages`);
    else if (r < 0.8) {
      const list = await c("GET channel messages", "GET", `/api/channels/${home.channelId}/messages`);
      const msg = list?.json?.messages?.[0];
      if (msg) await c("POST message reaction", "POST", `/api/messages/${msg.id}/reactions`, { emoji: "🔥", on: true });
    } else if (r < 0.9) await c("POST /api/communities/:id/threads", "POST", "/api/communities/x/threads", { channelId: home.channelId, title: `load thread ${Math.random().toString(36).slice(2, 6)}`, content: "thread from load test" });
    else await c("GET /communities/:id", "GET", `/communities/${home.id}`);
  },
  async buyer(c, st) {
    const r = Math.random();
    if (r < 0.2) await c("POST /api/marketplace/orders (stock race)", "POST", "/api/marketplace/orders", { listingId: st.listing, note: "load" });
    else if (r < 0.6) await c("GET /marketplace/:id", "GET", `/marketplace/${st.listing}`);
    else await c("GET /marketplace/orders", "GET", "/marketplace/orders");
    if (Math.random() < 0.3) await c("GET /wallet", "GET", "/wallet");
  },
  async competitor(c, st, me) {
    const r = Math.random();
    const name = `lt-${me.id.slice(-10)}`;
    if (r < 0.25) await c("POST register FREE", "POST", `/api/tournaments/${st.freeT}/registrations`, { inGameId: name });
    else if (r < 0.5) await c("POST register PAID (wallet)", "POST", `/api/tournaments/${st.paidT}/registrations`, { inGameId: name, payFrom: "wallet" });
    else await c("GET /tournaments/:id", "GET", `/tournaments/${r < 0.75 ? st.freeT : st.paidT}`);
  },
  async challenger(c, st) {
    const r = Math.random();
    if (r < 0.25) await c("POST /api/quick-match", "POST", "/api/quick-match", { game: "Test Game", format: "SINGLE", stakeAmount: 0 });
    else if (r < 0.4) await c("GET /api/quick-match/pending", "GET", "/api/quick-match/pending");
    else if (r < 0.6) {
      const made = await c("POST /api/battles", "POST", "/api/battles", { game: "Test Game", format: "SINGLE", visibility: "OPEN", stakeAmount: 0, expiresInHours: 24 });
      if (made?.json?.id) st.openBattles.push(made.json.id);
    } else if (r < 0.85) {
      const id = st.openBattles.length ? st.openBattles[Math.floor(Math.random() * st.openBattles.length)] : null;
      if (id) await c("POST /api/battles/:id/accept", "POST", `/api/battles/${id}/accept`);
    } else await c("GET /battles", "GET", "/battles");
  },
  async banker(c, st, me) {
    const r = Math.random();
    if (r < 0.45) {
      const dep = await c("POST /api/wallet/fund", "POST", "/api/wallet/fund", { amount: 200_000 + Math.floor(Math.random() * 300_000) });
      const ref = dep?.json?.authorizationUrl?.split("/pay/")[1];
      if (ref) {
        await webhook(c, "charge.success", { reference: ref });
        if (Math.random() < 0.3) await Promise.all([webhook(c, "charge.success", { reference: ref }), webhook(c, "charge.success", { reference: ref })]); // duplicate delivery
      }
    } else if (r < 0.85) {
      const w = await c("POST /api/wallet/withdraw", "POST", "/api/wallet/withdraw", { amount: 100_000 + Math.floor(Math.random() * 200_000) });
      if (w?.status === 200) {
        const ref = (await (await fetch(`${FAKE}/_transfer/RCP_${me.id}`)).json()).reference;
        if (ref && Math.random() < 0.7) await webhook(c, "transfer.success", { reference: ref });
      }
    } else if (r < 0.92) await c("POST /api/wallet/withdraw (too much)", "POST", "/api/wallet/withdraw", { amount: 900_000_000 });
    else await c("GET /wallet", "GET", "/wallet");
  },
};
const NAMES = ["browser", "social", "chatter", "buyer", "competitor", "challenger", "banker"];

async function run() {
  if (!existsSync(STATE)) throw new Error("run `setup` first");
  const st = JSON.parse(readFileSync(STATE, "utf8"));
  st.openBattles = [];
  const users = st.users.slice(0, N);
  await startFakePaystack();
  console.log(`running ${users.length} concurrent users for ${SECONDS}s against ${BASE} (fake Paystack on :4010)`);
  const deadline = Date.now() + SECONDS * 1000;
  const t0 = Date.now();
  await Promise.all(users.map(async (u, i) => {
    await sleep((i / users.length) * Math.min(30_000, SECONDS * 300)); // ramp up
    const c = client(await sign(u.id));
    const me = { ...u };
    const persona = PERSONAS[NAMES[i % NAMES.length]];
    const others = users.filter((x, j) => x.id !== u.id && j % 7 === 0);
    while (Date.now() < deadline) {
      if (Math.random() < 0.2) await PERSONAS.competitor(c, st, me); // everyone races for tournament slots
      else await persona(c, st, me, others);
      await think();
    }
  }));
  const secs = (Date.now() - t0) / 1000;
  report(secs);
  await verify(st);
  process.exit(0);
}

const pct = (a, p) => a[Math.min(a.length - 1, Math.floor((p / 100) * a.length))];
const EXPECTED = new Set(["409", "400", "402", "429", "403", "423", "404"]);
function report(secs) {
  let total = 0, bad = 0;
  const rows = [...stats.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, s]) => {
    s.ms.sort((x, y) => x - y);
    const errs = Object.entries(s.status).filter(([c]) => !/^[23]/.test(c) && !EXPECTED.has(c) && c !== "502").reduce((x, [, n]) => x + n, 0);
    total += s.n; bad += errs;
    return `${k.padEnd(42)} n=${String(s.n).padStart(5)}  p50=${pct(s.ms, 50).toFixed(0).padStart(6)}ms  p95=${pct(s.ms, 95).toFixed(0).padStart(6)}ms  max=${s.ms.at(-1).toFixed(0).padStart(6)}ms  ${JSON.stringify(s.status)}`;
  });
  console.log("\n" + rows.join("\n"));
  console.log(`\n${total} requests in ${secs.toFixed(0)}s = ${(total / secs).toFixed(1)} req/s; unexpected failures (5xx/timeout/neterr): ${bad}`);
}

// Per-user ledger check: balance must equal start + credits - debits, exactly.
async function verify(st) {
  const ids = st.users.map((u) => u.id);
  // Requests queued on the server keep running after the clients stop: wait until the numbers stop moving.
  let last = "";
  for (let i = 0; i < 60; i++) {
    const now = JSON.stringify(await Promise.all([prisma.registration.count({ where: { tournamentId: { in: [st.freeT, st.paidT] } } }), prisma.walletTransaction.count({ where: { userId: { in: ids } } }), prisma.order.count({ where: { listingId: st.listing } })]));
    if (now === last) break;
    last = now;
    await sleep(5000);
  }
  const [free, paid, orders, listing, neg] = await Promise.all([
    prisma.registration.count({ where: { tournamentId: st.freeT, status: "CONFIRMED" } }),
    prisma.registration.count({ where: { tournamentId: st.paidT, status: "CONFIRMED" } }),
    prisma.order.count({ where: { listingId: st.listing, status: "PAID" } }),
    prisma.listing.findUnique({ where: { id: st.listing }, select: { stock: true } }),
    prisma.user.count({ where: { id: { in: ids }, walletBalance: { lt: 0 } } }),
  ]);
  const [users, txns] = await prisma.$transaction([
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, walletBalance: true } }),
    prisma.walletTransaction.findMany({ where: { userId: { in: ids } }, select: { userId: true, type: true, amount: true, status: true } }),
  ], { isolationLevel: "RepeatableRead" }); // one snapshot, so a late commit can't land between the two reads
  const delta = new Map();
  for (const t of txns) {
    let d = 0;
    if (t.type === "FUND" && t.status === "COMPLETE") d = t.amount;
    else if (["MARKETPLACE_REFUND", "ENTRY_FEE_REFUND"].includes(t.type)) d = t.amount;
    else if (["ENTRY_FEE_DEBIT", "MARKETPLACE_DEBIT"].includes(t.type)) d = -t.amount;
    else if (t.type === "WITHDRAWAL" && t.status !== "FAILED") d = -t.amount;
    delta.set(t.userId, (delta.get(t.userId) ?? 0) + d);
  }
  const drift = users.filter((u) => u.walletBalance !== START_WALLET + (delta.get(u.id) ?? 0));
  const funds = txns.filter((t) => t.type === "FUND");
  const wds = txns.filter((t) => t.type === "WITHDRAWAL");
  const count = (a, s) => a.filter((t) => t.status === s).length;
  const [battles, accepted, matches] = await Promise.all([
    prisma.battle.count({ where: { creatorId: { in: ids } } }),
    prisma.battle.count({ where: { creatorId: { in: ids }, status: { not: "OPEN" } } }),
    prisma.match.count({ where: { OR: [{ playerAId: { in: ids } }, { playerBId: { in: ids } }] } }),
  ]);
  const [posts, msgs, members] = await Promise.all([
    prisma.communityPost.count({ where: { authorId: { in: ids } } }),
    prisma.message.count({ where: { authorId: { in: ids } } }),
    prisma.communityMember.count({ where: { userId: { in: ids } } }),
  ]);
  console.log("\n--- integrity ---");
  console.log(`free tournament confirmed: ${free}/${st.freeCap} ${free <= st.freeCap ? "ok" : "OVERSOLD"}`);
  console.log(`paid tournament confirmed: ${paid}/${st.paidCap} ${paid <= st.paidCap ? "ok" : "OVERSOLD"}`);
  console.log(`listing: ${orders} orders + ${listing?.stock} left = ${orders + (listing?.stock ?? 0)} (started ${st.stockStart}) ${orders + (listing?.stock ?? 0) === st.stockStart ? "ok" : "MISMATCH"}`);
  console.log(`negative wallets: ${neg} ${neg === 0 ? "ok" : "BAD"}`);
  console.log(`wallet drift (balance != start + ledger): ${drift.length} users ${drift.length === 0 ? "ok (every wallet matches its ledger to the kobo)" : "BAD"}`);
  console.log(`deposits: ${funds.length} created, ${count(funds, "COMPLETE")} credited, ${count(funds, "PENDING")} still pending`);
  console.log(`withdrawals: ${wds.length} created, ${count(wds, "COMPLETE")} settled, ${count(wds, "PENDING")} pending, ${count(wds, "FAILED")} failed+restored`);
  console.log(`challenges: ${battles} open battles created, ${accepted} accepted, ${matches} matches exist`);
  console.log(`communities: ${members} memberships, ${msgs} chat messages, ${posts} feed posts`);
  if (drift.length) console.log("first drifts:", drift.slice(0, 3).map((u) => ({ id: u.id, balance: u.walletBalance, expected: START_WALLET + (delta.get(u.id) ?? 0) })));
}

// Removes everything the test created: what cleanupAll() knows, then whatever still blocks the users.
async function cleanup() {
  const users = await prisma.user.findMany({ where: { displayName: { startsWith: "TEST-" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  const w = { in: ids };
  const tournaments = await prisma.tournament.findMany({ where: { name: { startsWith: "TEST-" } }, select: { id: true } });
  const tIds = tournaments.map((t) => t.id);
  await prisma.escrowTransaction.deleteMany({ where: { OR: [{ tournamentId: { in: tIds } }, { userId: w }] } });
  await prisma.registration.deleteMany({ where: { tournamentId: { in: tIds } } });
  await prisma.order.deleteMany({ where: { OR: [{ buyerId: w }, { listing: { sellerId: w } }] } });
  await prisma.listing.deleteMany({ where: { sellerId: w } });
  await prisma.walletTransaction.deleteMany({ where: { userId: w } });
  await prisma.notification.deleteMany({ where: { userId: w } });
  await prisma.communityPost.deleteMany({ where: { authorId: w } });
  const cleared = new Set();
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      await prisma.tournament.deleteMany({ where: { id: { in: tIds } } });
      await prisma.organizerProfile.deleteMany({ where: { userId: w } });
      await prisma.user.deleteMany({ where: { id: w } });
      console.log(`cleanup: removed ${ids.length} test users (also cleared: ${[...cleared].join(", ") || "nothing extra"})`);
      return;
    } catch (e) {
      const m = /(\w+)_(\w+)_fkey\\?"\s+on table\s+\\?"(\w+)/.exec(String(e.message));
      const model = m && m[3][0].toLowerCase() + m[3].slice(1);
      if (!m || !prisma[model]) { console.log("blocked by something unexpected:", String(e.message).slice(0, 300)); throw e; }
      if (!cleared.has(`${m[3]}.${m[2]}`)) console.log(`  clearing ${m[3]}.${m[2]}`);
      cleared.add(`${m[3]}.${m[2]}`);
      await prisma[model].deleteMany({ where: { [m[2]]: w } }).catch(() => {
        console.log(`could not clear ${m[3]}.${m[2]} by user id; needs a manual look`);
        throw e;
      });
    }
  }
  throw new Error(`gave up after many attempts; still blocked. Cleared so far: ${[...cleared].join(", ")}`);
}

try {
  if (cmd === "cleanup") { await cleanup().catch((e) => { console.error("cleanup failed:", String(e.message).slice(0, 600)); process.exitCode = 1; }); if (existsSync(STATE)) unlinkSync(STATE); }
  else if (cmd === "verify") await verify(JSON.parse(readFileSync(STATE, "utf8")));
  else if (cmd === "setup") await setup();
  else await run();
} finally {
  await prisma.$disconnect();
}
