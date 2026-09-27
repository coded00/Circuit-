/**
 * Circuit — signing out, from anywhere in the UI. Ends with a full-page
 * `location.replace`, not a router push:
 * - a hard load drops the client router cache, so Back can't redisplay a
 *   signed-in page from memory (the server re-checks and redirects);
 * - replace removes the page they logged out from, so Back doesn't land
 *   straight on it.
 */
export async function logout(to = "/") {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
  window.location.replace(to);
}
