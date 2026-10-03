/**
 * Circuit Community — serves a chat image. Never a public URL: the
 * requester must be a member of the message's community (same gate as
 * reading the channel), mirroring how match proof and report evidence
 * are served through access-checked routes rather than static paths.
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getMessageAttachment, CommunityError } from "@/lib/community";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const { id } = await params;
  try {
    const { buffer, contentType } = await getMessageAttachment(id, user.id);
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": contentType,
        // The stored type was sniffed from the bytes at upload — tell the
        // browser not to second-guess it.
        "X-Content-Type-Options": "nosniff",
        // A message's image never changes; `private` keeps shared caches
        // from serving it to someone who isn't a member.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if (err instanceof CommunityError) {
      const status = err.code === "NOT_A_MEMBER" ? 403 : 404;
      return NextResponse.json({ error: err.message }, { status });
    }
    throw err;
  }
}
