import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { createSessionToken } from "@/lib/auth";
import { cleanupAll, createTestStaff, createTestUser, uniqueSuffix } from "@/testHelpers";
import { GET as walletExport } from "./wallet-transactions.csv/route";
import { GET as escrowExport } from "./escrow-transactions.csv/route";

/**
 * The finance CSV exports (finding #22).
 *
 * Both routes were behind `requireStaff()`, which put a 5,000-row export of every player's wallet and
 * escrow activity — names, handles, amounts, provider references — one click away from any staff
 * account, a MODERATOR included. The same rows stay browsable on the Finance page by anyone on staff,
 * a page at a time; what changes is the bulk copy that leaves Circuit as a file, and the fact that
 * taking one is now accounted for.
 *
 * The role check is the real one. Only `next/headers` is stubbed — it has no request scope under Vitest,
 * the same limitation src/app/api/auth/logout/route.test.ts documents — so `getCurrentUser` verifies a
 * real session token against a real User row and `requireSuperAdmin` makes a real decision about a real
 * `adminRole`. Mocking the guard instead would have proved only that the route calls it.
 */

let sessionToken: string | null = null;

vi.mock("next/headers", () => ({
  // The session cookie is the only cookie either route reads, so answering every name with it is enough.
  cookies: vi.fn(async () => ({
    get: () => (sessionToken === null ? undefined : { value: sessionToken }),
  })),
}));

const WALLET = "http://localhost/api/admin/finance/wallet-transactions.csv";
const ESCROW = "http://localhost/api/admin/finance/escrow-transactions.csv";

/** Both exports, with the audit action each is expected to write. */
const BOTH = [
  ["wallet", () => walletExport(new Request(WALLET)), "finance.export.wallet"],
  ["escrow", () => escrowExport(new Request(ESCROW)), "finance.export.escrow"],
] as const;

/** Signs the next request in as `user`, or out when it is null. */
async function signedInAs(user: { id: string } | null) {
  sessionToken = user ? await createSessionToken({ userId: user.id }) : null;
  return user;
}

beforeEach(() => {
  sessionToken = null;
});

afterEach(async () => {
  vi.restoreAllMocks();
  sessionToken = null;
  await cleanupAll();
});

describe("who can reach the finance exports", () => {
  it("refuses a MODERATOR, on both files, and records no export", async () => {
    // The finding, in one test. A moderator's job is moderation; a 5,000-row dump of everyone's money
    // is not part of it, and before this one could be taken without leaving a trace.
    const moderator = await signedInAs(await createTestStaff({ adminRole: "MODERATOR" }));

    for (const [, call] of BOTH) {
      expect((await call()).status).toBe(403);
    }
    expect(await prisma.auditLogEntry.count({ where: { actorId: moderator!.id } })).toBe(0);
  });

  it("refuses staff who hold no admin role at all", async () => {
    await signedInAs(await createTestStaff());

    for (const [, call] of BOTH) {
      expect((await call()).status).toBe(403);
    }
  });

  it("refuses an ordinary signed-in player", async () => {
    await signedInAs(await createTestUser());

    for (const [, call] of BOTH) {
      expect((await call()).status).toBe(403);
    }
  });

  it("refuses a signed-out caller with a 401, not a 403", async () => {
    // The distinction matters to the client: 401 means "sign in", 403 means "you never will be".
    await signedInAs(null);

    for (const [, call] of BOTH) {
      expect((await call()).status).toBe(401);
    }
  });

  it("lets a Super Admin take both, and logs each one", async () => {
    const admin = await signedInAs(await createTestStaff({ adminRole: "SUPER_ADMIN" }));

    for (const [label, call, action] of BOTH) {
      const response = await call();
      expect(response.status, label).toBe(200);
      expect(response.headers.get("content-type"), label).toContain("text/csv");

      const entry = await prisma.auditLogEntry.findFirstOrThrow({ where: { action, actorId: admin!.id } });
      expect(entry.metadata).toMatchObject({ rows: expect.any(Number) });
    }
    expect(await prisma.auditLogEntry.count({ where: { actorId: admin!.id } })).toBe(2);
  });
});

describe("what an export records", () => {
  it("names the filters it was taken with, and how many rows went out", async () => {
    // The two things that make the entry worth reading later: what slice of the ledger somebody pulled,
    // and how much of it there was. The count is driven off the filtered query's own length, so a bug
    // that reported the table size instead of the export size would show up here.
    const admin = await createTestStaff({ adminRole: "SUPER_ADMIN" });
    const player = await createTestUser();
    const other = await createTestUser();
    const stamp = uniqueSuffix();
    await prisma.walletTransaction.createMany({
      data: [
        ...[1, 2, 3].map((n) => ({
          userId: player.id,
          type: "FUND" as const,
          amount: n * 1_000,
          provider: "PAYSTACK" as const,
          providerRef: `test-export-${stamp}-${n}`,
          status: "COMPLETE" as const,
        })),
        // Same shape, different player: proves the filter is doing the counting, not the row builder.
        {
          userId: other.id,
          type: "FUND" as const,
          amount: 5_000,
          provider: "PAYSTACK" as const,
          providerRef: `test-export-${stamp}-other`,
          status: "COMPLETE" as const,
        },
      ],
    });
    await signedInAs(admin);

    const response = await walletExport(new Request(`${WALLET}?q=${player.handle}&type=FUND&status=COMPLETE`));

    expect(response.status).toBe(200);
    const csv = await response.text();
    expect(csv).toContain(player.handle);
    expect(csv).not.toContain(other.handle);
    expect(csv.split("\n")).toHaveLength(4); // header + the three rows

    const entry = await prisma.auditLogEntry.findFirstOrThrow({ where: { action: "finance.export.wallet" } });
    expect(entry.metadata).toMatchObject({
      filters: { q: player.handle, type: "FUND", status: "COMPLETE" },
      rows: 3,
    });
    expect(entry.targetType).toBe("WalletTransaction");
  });
});
