import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { limitOrRespond } from "@/lib/rateLimitHttp";

const key = `test-limit-${Date.now()}`;
afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "test-limit-" } } });
});

describe("limitOrRespond", () => {
  it("lets actions through up to the cap, then answers 429 with a retry hint", async () => {
    const limit = { max: 3, windowMs: 60_000 };
    for (let i = 0; i < 3; i++) expect(await limitOrRespond(key, limit, "slow down")).toBeNull();
    const blocked = await limitOrRespond(key, limit, "slow down");
    expect(blocked?.status).toBe(429);
    expect(blocked?.headers.get("retry-after")).toBeTruthy();
    expect((await blocked!.json()).error).toBe("slow down");
  });
  it("counts each key separately", async () => {
    const limit = { max: 1, windowMs: 60_000 };
    expect(await limitOrRespond(`${key}-a`, limit, "x")).toBeNull();
    expect(await limitOrRespond(`${key}-b`, limit, "x")).toBeNull();
  });
});
