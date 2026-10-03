/**
 * Circuit — where players reach a person. Set SUPPORT_URL (a mailto: or
 * https:// link, e.g. a WhatsApp chat) to show the "Contact support"
 * button on /help; unset, the button is simply not shown.
 */

export function supportUrl(): string | null {
  const url = process.env.SUPPORT_URL?.trim();
  return url && /^(mailto:|https:\/\/)/.test(url) ? url : null;
}
