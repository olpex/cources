export const normalizeResultEmail = (email: string) => email.trim().toLowerCase();

/** Filter raw Sheets rows while email is still server-only (column E). */
export function filterExcludedTests(rows: string[][], emails: string[]): string[][] {
  const excluded = new Set(emails.map(normalizeResultEmail).filter(Boolean));
  return rows.filter((row) => !excluded.has(normalizeResultEmail(row[4] ?? "")));
}