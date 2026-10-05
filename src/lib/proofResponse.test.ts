import { describe, expect, it } from "vitest";
import { proofResponse } from "@/lib/proofResponse";

describe("proofResponse", () => {
  it("serves a known image type as itself, sandboxed", () => {
    const r = proofResponse(Buffer.from("x"), "image/png");
    expect(r.headers.get("content-type")).toBe("image/png");
    expect(r.headers.get("x-content-type-options")).toBe("nosniff");
    expect(r.headers.get("content-security-policy")).toContain("sandbox");
    expect(r.headers.get("content-disposition")).toBeNull();
  });
  it("turns a stored text/html file into an opaque download", () => {
    const r = proofResponse(Buffer.from("<script>alert(1)</script>"), "text/html");
    expect(r.headers.get("content-type")).toBe("application/octet-stream");
    expect(r.headers.get("content-disposition")).toBe("attachment");
  });
});
