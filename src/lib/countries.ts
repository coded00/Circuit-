/**
 * Circuit — countries for the signup "Country" field. Stored as the ISO
 * 3166-1 alpha-2 code; the display name comes from the runtime's own
 * locale data, so there's no hand-typed name list to keep in sync.
 */

const CODES =
  "AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI KH CM CA CV CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW".split(
    " ",
  );

const CODE_SET = new Set(CODES);

/** Shown first: where Circuit's players mostly are. */
const FEATURED = ["NG", "GH", "KE", "ZA"];

export function isCountryCode(value: unknown): value is string {
  return typeof value === "string" && CODE_SET.has(value);
}

export function countryName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** Featured countries first, then everything else A–Z. */
export function countryOptions(): { code: string; name: string }[] {
  const all = CODES.map((code) => ({ code, name: countryName(code) }));
  const featured = FEATURED.map((c) => all.find((o) => o.code === c)!);
  const rest = all.filter((o) => !FEATURED.includes(o.code)).sort((a, b) => a.name.localeCompare(b.name));
  return [...featured, ...rest];
}

/** The country's flag as an emoji (regional-indicator letters). */
export function flagEmoji(code: string): string {
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}
