/**
 * Circuit — platform fee calculation. Basis points (1/100 of a percent),
 * not a plain percent, so a fractional rate never needs special-casing —
 * see PlatformSetting.platformFeeBps's own schema comment for why this
 * is admin-configurable rather than a code constant.
 */

export function computePlatformFee(entryFeeAmount: number, platformFeeBps: number): number {
  return Math.round((entryFeeAmount * platformFeeBps) / 10000);
}
