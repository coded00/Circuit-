import { describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { MAX_IMAGE_PIXELS } from "./imageUrl";
import { MAX_PUBLIC_IMAGE_BYTES, UploadError, storePublicImage } from "./uploads";

/** Storage isn't what's under test here, and the local driver writes real files to disk. */
vi.mock("@/lib/storage", () => ({
  proofStorage: { store: vi.fn(async (prefix: string) => `${prefix}-upload`) },
  storageKeyOf: (ref: string) => ref,
}));

const realPng = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#ffffff" } }).png().toBuffer();

/**
 * A real PNG with its IHDR dimensions rewritten — the shape of the bug the
 * byte cap can't catch. The file stays 93 bytes; only what it claims to be
 * changes. IHDR is the first chunk, so width sits at byte 16 and height at 20.
 */
async function pngDeclaring(width: number, height: number): Promise<Buffer> {
  const buf = Buffer.from(await realPng());
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

describe("storePublicImage", () => {
  it("stores an ordinary image", async () => {
    await expect(storePublicImage("poster", await realPng())).resolves.toContain("/api/images/");
  });

  it("refuses a file that declares more pixels than the budget, though it passes the byte cap easily", async () => {
    const bomb = await pngDeclaring(20_000, 20_000); // 400 megapixels
    // The two assertions that make this the regression rather than a restatement: the file is far inside
    // the byte limit, and far outside the pixel one.
    expect(bomb.length).toBeLessThan(MAX_PUBLIC_IMAGE_BYTES);
    expect(20_000 * 20_000).toBeGreaterThan(MAX_IMAGE_PIXELS);

    await expect(storePublicImage("poster", bomb)).rejects.toThrow(UploadError);
  });

  it("still refuses non-images and files past the byte cap", async () => {
    // Order matters for cost as well as correctness: both of these are refused before sharp is asked to
    // parse anything.
    await expect(storePublicImage("poster", Buffer.from("not an image at all, just text"))).rejects.toThrow(UploadError);
    await expect(storePublicImage("poster", Buffer.alloc(MAX_PUBLIC_IMAGE_BYTES + 1))).rejects.toThrow(UploadError);
  });
});
