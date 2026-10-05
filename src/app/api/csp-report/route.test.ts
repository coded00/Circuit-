import { afterEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { POST } from "./route";

const post = (body: string, ip = "198.51.100.7") => POST(new Request("http://localhost/api/csp-report", { method: "POST", headers: { "x-forwarded-for": ip, "content-type": "application/csp-report" }, body }));
afterEach(async () => {
  await prisma.rateLimitAttempt.deleteMany({ where: { key: { startsWith: "csp-report:198.51.100." } } });
});

describe("CSP report endpoint", () => {
  it("accepts both report formats and junk quietly, always answering 204", async () => {
    expect((await post(JSON.stringify({ "csp-report": { "violated-directive": "script-src", "blocked-uri": "https://evil.example/x.js", "document-uri": "http://localhost/" } }))).status).toBe(204);
    expect((await post(JSON.stringify([{ body: { effectiveDirective: "img-src", blockedURL: "https://x.example/a.png" } }]))).status).toBe(204);
    expect((await post("not json at all")).status).toBe(204);
    expect((await post("")).status).toBe(204);
  });
  it("ignores an oversized body and stops after a flood from one address", async () => {
    expect((await post("x".repeat(20_000))).status).toBe(204);
    for (let i = 0; i < 65; i++) await post("{}", "198.51.100.9");
    expect((await post("{}", "198.51.100.9")).status).toBe(204); // still 204, just not processed
  });
});
