/**
 * Serialises structured data for a `<script type="application/ld+json">` block.
 * JSON.stringify leaves `<` alone, so a tournament name or display name containing
 * `</script><script>...` would close the block and run as page script. Escaping every
 * `<` (and the two line separators some parsers treat as newlines) keeps it inert.
 */
export function safeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}
