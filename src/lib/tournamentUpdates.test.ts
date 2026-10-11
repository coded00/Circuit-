import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/db";
import { deleteTournamentUpdate, parseUpdateBody, postTournamentUpdate, MAX_UPDATE_LENGTH } from "./tournamentUpdates";
import { createTestOrganizer, createTestStaff, createTestTournament, createTestUser, cleanupAll } from "@/testHelpers";

afterEach(async () => {
  await cleanupAll();
});

async function enter(tournamentId: string, userId: string, status: "CONFIRMED" | "WITHDRAWN" | "PENDING_PAYMENT" = "CONFIRMED") {
  return prisma.registration.create({ data: { tournamentId, userId, status, inGameId: `ign-${userId.slice(-4)}` } });
}
const heard = (userId: string) => prisma.notification.count({ where: { userId, type: "TOURNAMENT_UPDATE" } });

describe("postTournamentUpdate", () => {
  it("saves the update and tells everyone entered, but not the organizer, withdrawn or unpaid players", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id);
    const [playing, withdrawn, unpaid, captain, teammate] = await Promise.all([createTestUser(), createTestUser(), createTestUser(), createTestUser(), createTestUser()]);
    await enter(tournament.id, playing.id);
    await enter(tournament.id, withdrawn.id, "WITHDRAWN");
    await enter(tournament.id, unpaid.id, "PENDING_PAYMENT");
    const teamEntry = await enter(tournament.id, captain.id);
    await prisma.rosterMember.create({ data: { registrationId: teamEntry.id, userId: teammate.id } });

    const update = await postTournamentUpdate({ tournamentId: tournament.id, authorId: organizer.id, body: "  Room code is in the community.  " });

    expect(update.body).toBe("Room code is in the community.");
    expect(await heard(playing.id)).toBe(1);
    expect(await heard(captain.id)).toBe(1);
    expect(await heard(teammate.id)).toBe(1);
    expect(await heard(withdrawn.id)).toBe(0);
    expect(await heard(unpaid.id)).toBe(0);
    expect(await heard(organizer.id)).toBe(0);
  });

  it("refuses anyone but the tournament's organizer", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id);
    const stranger = await createTestUser();
    await expect(postTournamentUpdate({ tournamentId: tournament.id, authorId: stranger.id, body: "hello" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.tournamentUpdate.count({ where: { tournamentId: tournament.id } })).toBe(0);
  });

  it("rejects empty and over-long text, and an unknown tournament", async () => {
    const organizer = await createTestOrganizer();
    const tournament = await createTestTournament(organizer.id);
    await expect(postTournamentUpdate({ tournamentId: tournament.id, authorId: organizer.id, body: "   " })).rejects.toMatchObject({ code: "INVALID" });
    await expect(postTournamentUpdate({ tournamentId: tournament.id, authorId: organizer.id, body: "x".repeat(MAX_UPDATE_LENGTH + 1) })).rejects.toMatchObject({ code: "INVALID" });
    await expect(postTournamentUpdate({ tournamentId: "does-not-exist", authorId: organizer.id, body: "hi" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("deleteTournamentUpdate", () => {
  it("lets the organizer or staff delete, but nobody else", async () => {
    const organizer = await createTestOrganizer();
    const staff = await createTestStaff();
    const stranger = await createTestUser();
    const tournament = await createTestTournament(organizer.id);
    const other = await createTestTournament(organizer.id);
    const post = () => postTournamentUpdate({ tournamentId: tournament.id, authorId: organizer.id, body: "note" });

    const a = await post();
    await expect(deleteTournamentUpdate({ updateId: a.id, tournamentId: tournament.id, actor: { id: stranger.id, isStaff: false } })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(deleteTournamentUpdate({ updateId: a.id, tournamentId: other.id, actor: { id: organizer.id, isStaff: false } })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deleteTournamentUpdate({ updateId: a.id, tournamentId: tournament.id, actor: { id: organizer.id, isStaff: false } });

    const b = await post();
    await deleteTournamentUpdate({ updateId: b.id, tournamentId: tournament.id, actor: { id: staff.id, isStaff: true } });
    expect(await prisma.tournamentUpdate.count({ where: { tournamentId: tournament.id } })).toBe(0);
  });
});

describe("parseUpdateBody", () => {
  it("trims, and accepts only non-empty text within the limit", () => {
    expect(parseUpdateBody("  hi  ")).toBe("hi");
    expect(parseUpdateBody("")).toBeNull();
    expect(parseUpdateBody(42)).toBeNull();
    expect(parseUpdateBody("x".repeat(MAX_UPDATE_LENGTH))).not.toBeNull();
  });
});
