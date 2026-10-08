import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const SHEET_ID = "1sLbxZhWvHBfkvhCq_e3r7nAeWxWEwIOYPWiNispyFUc";
const RANGE = "'_Дані_для_Looker_Studio'!A1:E5000";
const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_sheets/v4";

export type ResultRow = { module: string; time: string; score: string; name: string };

export function normTitle(s: string) {
  return s.toLowerCase().replace(/[’'`ʼ]/g, "'").replace(/[^\p{L}\p{N}.']+/gu, " ").trim();
}

export const fetchCourseResults = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ modules: z.array(z.string().max(300)).max(200) }).parse(d))
  .handler(async ({ data }): Promise<ResultRow[]> => {
    const lovableKey = process.env["LOVABLE_API_KEY"];
    const sheetsKey = process.env["GOOGLE_SHEETS_API_KEY"];
    if (!lovableKey || !sheetsKey) throw new Error("Таблицю результатів не підключено");
    const res = await fetch(`${GATEWAY_URL}/spreadsheets/${SHEET_ID}/values/${RANGE}`, {
      headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`Sheets request failed [${res.status}]: ${body}`);
      throw new Error(`Не вдалося прочитати таблицю результатів [${res.status}]`);
    }
    const json = (await res.json()) as { values?: string[][] };
    const wanted = new Set(data.modules.map(normTitle).filter(Boolean));
    // Only columns A–D are returned: email (column E) is never sent to the browser.
    return (json.values ?? [])
      .slice(1)
      .filter((r) => r[0] && wanted.has(normTitle(r[0])))
      .map((r) => ({ module: r[0] ?? "", time: r[1] ?? "", score: r[2] ?? "", name: r[3] ?? "" }));
  });

export type SummaryRow = {
  key: string;
  name: string;
  p: number | null;
  t: number | null;
  total: number | null;
  practical: { id: string; module_title: string; score: number | null }[];
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
    const wanted = new Set(data.modules.map(normTitle).filter(Boolean));
    let sheet: string[][] = [];
    if (lovableKey && sheetsKey) {
      const res = await fetch(`${GATEWAY_URL}/spreadsheets/${SHEET_ID}/values/${RANGE}`, {
        headers: { Authorization: `Bearer ${lovableKey}`, "X-Connection-Api-Key": sheetsKey },
      });
      if (res.ok) sheet = (((await res.json()) as { values?: string[][] }).values ?? []).slice(1);
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("practical_submissions")
      .select("id, user_id, email, module_id, module_title, student_name, ai_score, teacher_score, created_at")
      .eq("course_id", data.courseId)
      .eq("status", "graded")
      .order("created_at", { ascending: false });

    type Acc = { testName: string; pracName: string; tests: number[]; practical: SummaryRow["practical"]; seen: Set<string> };
    const map = new Map<string, Acc>();
    const get = (email: string) => {
      const k = email.trim().toLowerCase();
      if (!map.has(k)) map.set(k, { testName: "", pracName: "", tests: [], practical: [], seen: new Set() });
      return map.get(k)!;
    };
    for (const r of subs ?? []) {
      const a = get(r.email);
      if (a.seen.has(r.module_id)) continue; // latest attempt only
      a.seen.add(r.module_id);
      if (!a.pracName) a.pracName = r.student_name;
      a.practical.push({ id: r.id, module_title: r.module_title, score: r.teacher_score ?? r.ai_score });
    }
    for (const r of sheet) {
      if (!r[0] || !wanted.has(normTitle(r[0])) || !r[4]) continue;
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
