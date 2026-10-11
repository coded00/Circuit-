/**
 * Escapes one CSV cell. Spreadsheet programs run a cell that starts with = + - @ (or a tab or
 * carriage return) as a formula, so a player named `=HYPERLINK(...)` would execute when an
 * organiser or admin opens the export. Those cells get a leading apostrophe, which makes the
 * spreadsheet show them as plain text.
 */
export function csvEscape(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}
