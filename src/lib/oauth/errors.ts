/**
 * Circuit — what a failed social sign-in says to the user. The callback
 * redirects back to the login/signup page with `?error=<code>`; the page
 * shows the matching sentence. Raw provider/database errors never reach
 * the browser.
 */

export const OAUTH_ERROR_MESSAGES = {
  google_cancelled: "Google sign-in was cancelled. You can try again, or continue with email.",
  google_failed: "Google sign-in didn't work this time. Please try again.",
  google_expired: "That sign-in took too long or was opened in another tab. Please start again.",
  google_network: "We couldn't reach Google. Check your connection and try again.",
  google_unverified: "Your Google account's email isn't verified, so it can't be used to sign in. Verify it with Google, or continue with email.",
  google_unavailable: "Google sign-in isn't available right now. Continue with email instead.",
  google_conflict: "That email is already used by a Circuit account that signs in with a different Google account. Sign in the way you did before.",
  google_session: "Your session changed while connecting Google. Sign in and try again.",
} as const;

export type OAuthErrorCode = keyof typeof OAUTH_ERROR_MESSAGES;

export function oauthErrorMessage(code: string | null | undefined): string | null {
  return code && code in OAUTH_ERROR_MESSAGES ? OAUTH_ERROR_MESSAGES[code as OAuthErrorCode] : null;
}
