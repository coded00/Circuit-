/** Circuit — BreadcrumbList structured data: where a page sits ("Home > Games > CODM"). Paths are site-relative. */
import { absoluteUrl } from "@/lib/seo";

export function breadcrumbJsonLd(trail: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, index) => ({ "@type": "ListItem", position: index + 1, name: item.name, item: absoluteUrl(item.path) })),
  };
}
