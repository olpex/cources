import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { filterExcludedTests } from "./test-exclusions";

declare const Bun: { Transpiler: new (options: { loader: string; target: string }) => { transformSync(source: string): string } };
const source = readFileSync(new URL("./results.functions.ts", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace(/await import\("@\/lib\/results-sheet.server"\)/g, "({ readResultsSheet: __sheet })")
  .replace(/await import\("@\/integrations\/supabase\/client.server"\)/g, "({ supabaseAdmin: __admin })")
  .replace(/export /g, "");
const javascript = new Bun.Transpiler({ loader: "ts", target: "bun" }).transformSync(source);
const load = new Function("createServerFn", "process", "filterExcludedTests", "__sheet", "__admin", `${javascript}\nreturn { fetchCourseResults, fetchCourseSummary };`);
const sheet = [
  ["Модуль", "29.10.2026 20:00", "12", "Тестове ім'я", " OTHER@EXAMPLE.COM "],
  ["Модуль", "29.10.2026 20:01", "8", "Місцевий студент", "local@example.com"],
];
function handlers(emails: string[], fail = false) {
  const practical = [{ id: "work", user_id: "student", email: "other@example.com", module_id: "task", module_title: "Практична", student_name: "Практичне ім'я", ai_score: 10, teacher_score: null, status: "graded" }];
  const admin = { from: (table: string) => ({ select: () => table === "test_result_exclusions"
    ? Promise.resolve({ data: emails.map((email) => ({ email })), error: fail ? { message: "Unavailable" } : null })
    : { eq: () => ({ order: async () => ({ data: practical }) }) } }) };
  const builder = () => ({ inputValidator() { return this; }, handler(fn: unknown) { return fn; } });
  return load(builder, { env: { LOVABLE_API_KEY: "test", GOOGLE_SHEETS_API_KEY: "test" } }, filterExcludedTests, async () => structuredClone(sheet), admin);
}
test("production result handler filters email before browser projection", async () => {
  const fn = handlers([" other@example.COM "]);
  assert.deepEqual(await fn.fetchCourseResults({ data: { modules: ["Модуль"] } }), [
    { module: "Модуль", time: "29.10.2026 20:01", score: "8", name: "Місцевий студент" },
  ]);
});
test("production summary excludes tests but retains that student's local practical grade", async () => {
  const data = { courseId: "course", modules: ["Модуль"] };
  const excluded = await handlers(["other@example.com"]).fetchCourseSummary({ data });
  assert.equal(excluded.length, 1);
  assert.equal(excluded[0].p, 10);
  assert.equal(excluded[0].t, null);
  assert.equal(excluded[0].total, 10);
  assert.equal(excluded[0].practical[0].id, "work");
  const restored = await handlers([]).fetchCourseSummary({ data });
  assert.equal(restored[0].t, 12);
  assert.equal(restored[0].total, 11);
});
test("production result reads fail closed when the exclusion list is unavailable", async () => {
  const fn = handlers([], true);
  await assert.rejects(fn.fetchCourseResults({ data: { modules: ["Модуль"] } }), /список виключень/);
  await assert.rejects(fn.fetchCourseSummary({ data: { courseId: "course", modules: ["Модуль"] } }), /список виключень/);
});