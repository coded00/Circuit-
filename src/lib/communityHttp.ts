/**
 * Circuit Community — the one CommunityError → HTTP response mapping every
 * community route uses. A route can override a code's status where its
 * meaning differs there, e.g. leaving a community you aren't in is a 404
 * rather than a 403. `code` is included so the client can react (e.g.
 * show the rules step on RULES_NOT_ACCEPTED).
 */

import { NextResponse } from "next/server";
import { CommunityError } from "@/lib/community";
import { CommunityInputError } from "@/lib/communityDirectory";

const STATUS_BY_CODE: Record<CommunityError["code"], number> = {
  NOT_FOUND: 404,
  DISABLED: 409,
  FORBIDDEN: 403,
  NOT_A_MEMBER: 403,
  ALREADY_MEMBER: 409,
  BANNED: 403,
  RULES_NOT_ACCEPTED: 400,
  INVITE_REQUIRED: 403,
  APPLICATION_REQUIRED: 403,
  MOD_ONLY: 403,
  INVALID: 400,
  TAKEN: 409,
  LIMIT_REACHED: 409,
  MUTED: 403,
  SLOW_MODE: 429,
  NOT_VERIFIED: 403,
  THREAD_LOCKED: 403,
  EMPTY_MESSAGE: 400,
  MESSAGE_TOO_LONG: 400,
  INVALID_STICKER: 400,
  INVALID_IMAGE: 400,
  IMAGE_TOO_LARGE: 413,
  INVALID_REACTION: 400,
  TOO_MANY_REACTIONS: 409,
};

export function communityErrorResponse(err: CommunityError, overrides: Partial<Record<CommunityError["code"], number>> = {}) {
  return NextResponse.json({ error: err.message, code: err.code }, { status: overrides[err.code] ?? STATUS_BY_CODE[err.code] });
}

/** For routes that can throw either: a known community/input error becomes
 *  a response, anything else is rethrown. */
export function handleCommunityError(err: unknown): NextResponse {
  if (err instanceof CommunityError) return communityErrorResponse(err);
  if (err instanceof CommunityInputError) return NextResponse.json({ error: err.message, field: err.field }, { status: 400 });
  throw err;
}

/** Reads a JSON body, or {} when it's missing/malformed. */
export async function jsonBody(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
}
