/** Circuit — country pages are addressed by the country's name ("/countries/nigeria"), not its two-letter code. */
import { countryName, countryOptions } from "@/lib/countries";
import { slugify } from "@/lib/seo";

let bySlug: Map<string, string> | null = null;

export function countrySlug(code: string): string {
  return slugify(countryName(code));
}

/** The ISO code for an address like "nigeria", or null if it isn't a country. */
export function countryFromSlug(slug: string): string | null {
  if (!bySlug) bySlug = new Map(countryOptions().map((o) => [slugify(o.name), o.code]));
  return bySlug.get(slug) ?? null;
}
