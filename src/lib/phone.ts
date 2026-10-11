/**
 * Circuit — Nigerian mobile numbers. Signup requires one, stored in
 * international form (+234 followed by 10 digits) so "0803…", "234803…"
 * and "+234 803 …" all end up as the same value and can't register twice.
 *
 * Accepts the NCC mobile ranges: 070/071, 080/081, 090/091 (+ the leading
 * 0 dropped in international form). Not verified by SMS — Circuit has no
 * SMS provider yet (see docs/circuit-stack.md).
 */

const NIGERIAN_MOBILE = /^[789][01]\d{8}$/;

/** "+2348031234567", or null if it isn't a Nigerian mobile number. */
export function normalizeNigerianPhone(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith("234")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);
  return NIGERIAN_MOBILE.test(digits) ? `+234${digits}` : null;
}

/** "+2348031234567" → "0803 123 4567", for display. */
export function formatNigerianPhone(e164: string): string {
  const local = `0${e164.replace(/^\+234/, "")}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

export function looksLikePhone(value: string): boolean {
  return /^[+\d][\d\s\-().]{6,}$/.test(value.trim());
}
