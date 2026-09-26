/**
 * Circuit Community — the one CommunityError → HTTP response mapping every
 * community route uses (previously copied into each route). A route can
 * override a code's status where its meaning differs there, e.g. leaving
 * a community you aren't in is a 404 rather than a 403.
 */

import { NextResponse } from "next/server";
import type { CommunityError } from "@/lib/community";

const STATUS_BY_CODE: Record<CommunityError["code"], number> = {
  NOT_FOUND: 404,
  DISABLED: 409,
  FORBIDDEN: 403,
  NOT_A_MEMBER: 403,
  ALREADY_MEMBER: 409,
  EMPTY_MESSAGE: 400,
  MESSAGE_TOO_LONG: 400,
  INVALID_STICKER: 400,
  INVALID_IMAGE: 400,
  IMAGE_TOO_LARGE: 413,
  INVALID_REACTION: 400,
  TOO_MANY_REACTIONS: 409,
};

export function communityErrorResponse(err: CommunityError, overrides: Partial<Record<CommunityError["code"], number>> = {}) {
  return NextResponse.json({ error: err.message }, { status: overrides[err.code] ?? STATUS_BY_CODE[err.code] });
}
