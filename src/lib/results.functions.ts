import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ResultRow = { module: string; time: string; score: string; name: string };

/**
 * Module titles are the join key between the Google Doc, the site and the
 * results sheet, so matching must survive renumbering: the doc numbers modules
 * "1. Назва" while the sheet may still hold "1.1 Назва". Leading numbers are
 * therefore dropped before comparison.
 */
export function normTitle(s: string) {
  return s
    .toLowerCase()
    .replace(/[’'`ʼ]/g, "'")
    .replace(/[^\p{L}\p{N}.']+/gu, " ")
    .trim()
    .replace(/^\d+(?:\s*\.\s*\d+)*\.?(?=\s)/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Modules were renumbered and some were retitled in the source Google Doc
 * (27.11.2026). The results sheet keeps the wording students answered under,
 * so map the old wording forward instead of losing those results.
 * Keys and values are normTitle() output.
 */
const TITLE_ALIASES: Record<string, string> = {
  "найбільш результативні техніки промтингу в llm": "результативні техніки промтингу llm",
  "штучний інтелект у повсякденній роботі": "ші у повсякденній роботі",
  "аудит навичок і персональний план розвитку": "аудит навичок і план розвитку",
  "промтинг у створенні зображень відео та аудіо": "промтинг зображень відео та аудіо",
  "штучний інтелект у працевлаштуванні": "ші у працевлаштуванні",
  "штучний інтелект під час україно-російської війни": "ші під час україно-російської війни",
  "тенденції і тренди штучного інтелекту": "тенденції і тренди ші",
  "artificial analysis як насправді вимірюють ші": "artificial analysis вимірювання ші",
  "як влаштовані і працюють великі мовні моделі llm": "як влаштовані і працюють llm",
  "olpex.github.iollm": "olpex.github.io llm",
};

/** Canonical form used on both sides of the comparison. */
export function matchKey(s: string) {
  const n = normTitle(s);
  return TITLE_ALIASES[n] ?? n;
}

export const fetchCourseResults = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ modules: z.array(z.string().max(300)).max(200) }).parse(d))
  .handler(async ({ data }): Promise<ResultRow[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
    if (!lovableKey || !sheetsKey) throw new Error("Таблицю результатів не підключено");
    const { readResultsSheet } = await import("@/lib/results-sheet.server");
    const sheet = await readResultsSheet(lovableKey, sheetsKey);
    // Match on the renumbering-insensitive key, then show the current module
    // title so the UI keeps the new numbering and its module filter works.
    const current = new Map<string, string>();
    for (const m of data.modules) {
      const k = matchKey(m);
      if (k && !current.has(k)) current.set(k, m);
    }
    // Only columns A–D are returned: email (column E) is never sent to the browser.
    return sheet
      .filter((r) => r[0] && current.has(matchKey(r[0])))
      .map((r) => ({
        module: current.get(matchKey(r[0]!)) ?? r[0] ?? "",
        time: r[1] ?? "",
        score: r[2] ?? "",
        name: r[3] ?? "",
      }));
  });

export type SummaryRow = {
  key: string;
  name: string;
  p: number | null;
  t: number | null;
  total: number | null;
  practical: { id: string; module_title: string; score: number | null; awaiting: boolean }[];
};

const num = (s: string) => {
  const m = s.replace(",", ".").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};
const avg = (a: number[]) => (a.length ? Math.round((a.reduce((x, y) => x + y, 0) / a.length) * 10) / 10 : null);

/**
 * Per-student course summary. Tests and practical works are matched by email
 * on the server (Google account names are often fake), the displayed name is
 * the one the student typed. Emails never leave the server.
 */
export const fetchCourseSummary = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ courseId: z.string().max(100), modules: z.array(z.string().max(300)).max(200) }).parse(d),
  )
  .handler(async ({ data }): Promise<SummaryRow[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
    const current = new Map<string, string>();
    for (const m of data.modules) {
      const k = matchKey(m);
      if (k && !current.has(k)) current.set(k, m);
    }
    let sheet: string[][] = [];
    if (lovableKey && sheetsKey) {
      const { readResultsSheet } = await import("@/lib/results-sheet.server");
      try {
        sheet = await readResultsSheet(lovableKey, sheetsKey);
      } catch {
        // Practical results remain available during a Sheets outage.
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("practical_submissions")
      .select("id, user_id, email, module_id, module_title, student_name, ai_score, teacher_score, created_at, status")
      .eq("course_id", data.courseId)
      .order("created_at", { ascending: false });

    type Acc = { testName: string; pracName: string; tests: number[]; practical: SummaryRow["practical"]; seen: Set<string> };
    const map = new Map<string, Acc>();
    const get = (email: string) => {
      const k = email.trim().toLowerCase();
      const existing = map.get(k);
      if (existing) return existing;
      const created: Acc = { testName: "", pracName: "", tests: [], practical: [], seen: new Set() };
      map.set(k, created);
      return created;
    };
    for (const r of subs ?? []) {
      const a = get(r.email);
      if (a.seen.has(r.module_id)) continue; // latest attempt only
      a.seen.add(r.module_id);
      if (!a.pracName) a.pracName = r.student_name;
      const awaiting = r.status !== "graded";
      a.practical.push({ id: r.id, module_title: r.module_title, score: awaiting ? null : (r.teacher_score ?? r.ai_score), awaiting });
    }
    for (const r of sheet) {
      if (!r[0] || !current.has(matchKey(r[0])) || !r[4]) continue;
      const a = get(r[4]);
      const n = num(r[2] ?? "");
      if (n !== null) a.tests.push(n);
      if (!a.testName && r[3]) a.testName = r[3].trim();
    }
    return [...map.values()]
      .filter((a) => a.practical.length)
      .map((a, i) => {
        const p = avg(a.practical.map((x) => x.score).filter((n): n is number => n !== null));
        const t = avg(a.tests);
        const total = p !== null && t !== null ? Math.round(((p + t) / 2) * 10) / 10 : (p ?? t);
        return { key: String(i), name: a.testName || a.pracName || "Без імені", p, t, total, practical: a.practical };
      })
      .sort((a, b) => a.name.localeCompare(b.name, "uk"));
  });
