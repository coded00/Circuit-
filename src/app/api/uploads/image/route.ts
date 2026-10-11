/**
 * Circuit — upload a public image (multipart: `file`, `purpose`). Returns
 * the URL to save into the relevant field (avatarUrl, posterUrl, ...);
 * the upload itself doesn't change any record. See src/lib/uploads.ts.
 */

import { NextResponse } from "next/server";
import { getCurrentUser, suspendedResponse } from "@/lib/session";
import { isRateLimited, recordAttempt } from "@/lib/rateLimit";
import { IMAGE_PURPOSES, MAX_PUBLIC_IMAGE_BYTES, UploadError, isImagePurpose, storePublicImage } from "@/lib/uploads";

/** Every upload costs storage even if it's never saved to a record, so
 *  cap it per user — plenty for re-picking a photo a few times. */
const UPLOAD_RATE_LIMIT = { max: 30, windowMs: 10 * 60 * 1000 };

/** Multipart framing (boundaries, part headers, the purpose field) sits on top of the file itself, so the
 *  declared length of a legitimate 4MB upload is a little over 4MB. Generous, because this check exists to
 *  avoid buffering something enormous, not to be exact — `file.size` below is the exact check. */
const MULTIPART_OVERHEAD_ALLOWANCE = 64 * 1024;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });
  const suspended = suspendedResponse(user);
  if (suspended) return suspended;

  // Before formData(), which buffers the whole body before `file.size` can be looked at — so on a
  // deployment with no platform body limit in front (the self-hosted Docker one), a huge POST used to cost
  // the full allocation just to be rejected afterwards. Best-effort: a chunked upload declares no length
  // and falls through to the exact check on `file.size`.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_PUBLIC_IMAGE_BYTES + MULTIPART_OVERHEAD_ALLOWANCE) {
    return NextResponse.json({ error: "Images are limited to 4MB." }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  const purpose = form?.get("purpose");
  if (!isImagePurpose(purpose)) return NextResponse.json({ error: "Unknown upload type." }, { status: 400 });
  if (IMAGE_PURPOSES[purpose].staffOnly && !user.isStaff) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  }
  if (file.size > MAX_PUBLIC_IMAGE_BYTES) {
    return NextResponse.json({ error: "Images are limited to 4MB." }, { status: 413 });
  }

  const rateLimitKey = `image-upload:${user.id}`;
  const { limited, retryAfterSeconds } = await isRateLimited(rateLimitKey, UPLOAD_RATE_LIMIT);
  if (limited) {
    return NextResponse.json(
      { error: `Too many uploads. Try again in ${Math.ceil(retryAfterSeconds / 60)} min.` },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
    );
  }
  await recordAttempt(rateLimitKey);

  try {
    const url = await storePublicImage(purpose, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ url }, { status: 201 });
  } catch (err) {
    if (err instanceof UploadError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
}
