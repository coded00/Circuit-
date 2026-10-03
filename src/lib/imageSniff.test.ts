import { describe, it, expect } from "vitest";
import { sniffImageType } from "./imageSniff";

const pad = (bytes: number[] | string) =>
  Buffer.concat([typeof bytes === "string" ? Buffer.from(bytes, "ascii") : Buffer.from(bytes), Buffer.alloc(16)]);

/**
 * The upload routes serve a file as whatever type this returns, so the
 * guarantee that matters is the negative one: anything that isn't one of
 * the four raster formats — SVG and HTML especially — must come back null.
 */
describe("sniffImageType", () => {
  it("recognises PNG, JPEG, GIF and WebP by their signatures", () => {
    expect(sniffImageType(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe("image/png");
    expect(sniffImageType(pad([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffImageType(pad("GIF89a"))).toBe("image/gif");
    expect(sniffImageType(pad("GIF87a"))).toBe("image/gif");
    expect(sniffImageType(pad("RIFF\x00\x00\x00\x00WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects SVG and HTML even though a browser might label them images", () => {
    expect(sniffImageType(pad('<svg xmlns="http://www.w3.org/2000/svg"><script>'))).toBeNull();
    expect(sniffImageType(pad("<!DOCTYPE html><html>"))).toBeNull();
  });

  it("rejects a RIFF container that isn't WebP (e.g. WAV/AVI)", () => {
    expect(sniffImageType(pad("RIFF\x00\x00\x00\x00WAVEfmt "))).toBeNull();
  });

  it("rejects files too short to carry a signature", () => {
    expect(sniffImageType(Buffer.from([0xff, 0xd8, 0xff]))).toBeNull();
    expect(sniffImageType(Buffer.alloc(0))).toBeNull();
  });
});
