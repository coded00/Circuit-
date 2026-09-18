import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { toggleLike } from "@/lib/videos";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "You must be signed in to like a video." }, { status: 401 });
  }
  const { id } = await params;
  const result = await toggleLike(id, user.id);
  return NextResponse.json(result);
}
