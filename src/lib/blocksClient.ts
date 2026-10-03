/** Circuit — the browser side of blocking: one call to /api/blocks, used by the profile button and the Blocked list. */

/** Block (`blocked: true`) or unblock a player by handle. Resolves to whether it worked. */
export async function setBlocked(handle: string, blocked: boolean): Promise<boolean> {
  const res = await fetch("/api/blocks", {
    method: blocked ? "POST" : "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ handle }),
  }).catch(() => null);
  return res?.ok ?? false;
}
