/**
 * Circuit — the page a layout is rendering for, as forwarded by
 * src/proxy.ts (only for the routes its matcher covers). Falls back to
 * the given path when the header is missing.
 */

import { headers } from "next/headers";
import { REQUEST_PATH_HEADER } from "./requestPathHeader";

export async function requestPath(fallback: string): Promise<string> {
  return (await headers()).get(REQUEST_PATH_HEADER) ?? fallback;
}
