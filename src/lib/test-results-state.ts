import type { ResultRow } from "@/lib/results.functions";

export function parseResultTime(value: string): number {
  const local = value.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})[\s,]+(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (local) {
    const [, day, month, year, hour, minute, second] = local;
    return new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second ?? 0)).getTime();
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export const resultKey = (row: ResultRow) =>
  [row.module, row.time, row.score, row.name].map((value) => value.trim()).join("|");

export function hasUnseenResults(rows: ResultRow[], seen: string[], hidden: string[]): boolean {
  const known = new Set([...seen, ...hidden]);
  return rows.some((row) => !known.has(resultKey(row)));
}

export function readSeenResults(storage: Pick<Storage, "getItem">, key: string): string[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}