import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/session";
import { MAX_PUBLIC_IMAGE_BYTES } from "@/lib/uploads";
import { cleanupAll, createTestUser } from "@/testHelpers";
import { POST } from "./route";

/**
 * The declared-length check, which runs before request.formData() buffers the body. Without it the only
 * bound on an upload's size is `file.size`, read after the whole thing is already in memory — fine on
 * Vercel, where the platform refuses a body over 4.5MB first, but this repo also ships a self-hosted
 * Docker deployment, where nothing upstream refuses anything.
 */

vi.mock("@/lib/session", () => ({ getCurrentUser: vi.fn(), suspendedResponse: () => null }));
vi.mock("@/lib/storage", () => ({
  proofStorage: { store: vi.fn(async (prefix: string) => `${prefix}-upload`) },
  storageKeyOf: (ref: string) => ref,
}));

afterEach(async () => {
  vi.restoreAllMocks();
  await cleanupAll();
});

/** A body that is not multipart, so anything that gets past the length check lands on a 400. */
const upload = (headers: Record<string, string>) =>
  POST(new Request("http://localhost/api/uploads/image", { method: "POST", headers, body: "not multipart" }));

describe("image upload body limit", () => {
  it("refuses a large body on its declared length, before reading it", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(await createTestUser());

    const response = await upload({ "content-length": String(MAX_PUBLIC_IMAGE_BYTES * 20) });

    expect(response.status).toBe(413);
    expect((await response.json()).error).toMatch(/4MB/);
  });

  it("lets a normal declared length through to the exact check on the file itself", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(await createTestUser());

    // 400 is the "that wasn't a usable upload" outcome, which means the length check let it past — the
    // point of the guard is to sit in front of a body worth refusing, not to judge the contents.
    const response = await upload({ "content-length": String(MAX_PUBLIC_IMAGE_BYTES) });
    expect(response.status).toBe(400);
  });

  it("doesn't refuse a request that declares no length at all", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(await createTestUser());

    // A chunked upload has no content-length. It still meets the exact check on `file.size`; the guard is
    // best-effort and must not turn an unknown length into a rejection.
    expect((await upload({})).status).toBe(400);
  });
});
