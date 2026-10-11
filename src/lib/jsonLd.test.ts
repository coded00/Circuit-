import { describe, expect, it } from "vitest";
import { safeJsonLd } from "@/lib/jsonLd";

describe("safeJsonLd", () => {
  it("cannot be closed early by a script tag in user text", () => {
    const out = safeJsonLd({ name: "x</script><script>alert(1)</script>" });
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe("x</script><script>alert(1)</script>");
  });
  it("round-trips ordinary data", () => {
    expect(JSON.parse(safeJsonLd({ a: [1, "b"], c: { d: null } }))).toEqual({ a: [1, "b"], c: { d: null } });
  });
});
