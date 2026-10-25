import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "fflate";

declare const Bun: { Transpiler: new (options: { loader: string; target: string }) => { transformSync(source: string): string } };

// Exercise the production handler without contacting storage, NVIDIA or Gmail.
const source = readFileSync(new URL("./practical.functions.ts", import.meta.url), "utf8")
  .replace(/^import .*;\n/gm, "")
  .replace('(await import("@/integrations/supabase/client.server")).supabaseAdmin', "__admin")
  .replace(/export /g, "");
const javascript = new Bun.Transpiler({ loader: "ts", target: "bun" }).transformSync(source);
const loadHandler = new Function("createServerFn", "requireSupabaseAuth", "sendGmail", "fetch", "process", "__admin", `${javascript}\nreturn submitPractical;`);
const fullText = "Виконання завдання: описано мету, промпт, отриманий результат і висновки. ".repeat(30);

async function submit(options: { answer?: string; document?: string; links?: string; missing?: boolean; scores?: number[]; media?: boolean; audio?: boolean; failRetry?: boolean }) {
  const requests: { temperature: number; messages: { content: string | { type: string; text?: string }[] }[] }[] = [];
  const updates: Record<string, unknown>[] = [];
  const emails: unknown[][] = [];
  const downloads: string[] = [];
  const xml = `<w:document><w:p><w:t>${options.document ?? fullText}</w:t></w:p></w:document>`;
  const bytes = zipSync({ "word/document.xml": strToU8(xml) });
  const admin = {
    storage: { from: () => ({ download: async (path: string) => {
      downloads.push(path);
      return { data: options.missing ? null : new Blob([bytes]) };
    } }) },
    from: () => ({ update: (value: Record<string, unknown>) => ({ eq: async () => { updates.push(value); return {}; } }) }),
  };
  const supabase = { from: () => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { data: [{ id: "course", title: "Курс", modules: [{ id: "module", title: "Модуль", practicalTask: "Виконайте завдання" }] }] } }) }) }),
    insert: () => ({ select: () => ({ single: async () => ({ data: { id: "submission" }, error: null }) }) }),
  }) };
  const builder = () => ({ middleware() { return this; }, inputValidator() { return this; }, handler(fn: unknown) { return fn; } });
  const handler = loadHandler(builder, {}, async (...args: unknown[]) => { emails.push(args); }, async (url: string, init?: RequestInit) => {
    if (!url.includes("integrate.api.nvidia.com")) return new Response("Sign in", { headers: { "content-type": "text/html" } });
    const request = JSON.parse(String(init?.body));
    requests.push(request);
    if (options.failRetry && requests.length === 2) throw new Error("retry unavailable");
    const score = options.scores?.[requests.length - 1] ?? 12;
    return Response.json({ choices: [{ message: { content: JSON.stringify({ score, feedback: "Оцінено виконання завдання." }) } }] });
  }, { env: { NVIDIA_API_KEY: "test-only" } }, admin);
  const files = options.audio
    ? [{ path: "user/audio.mp3", name: "audio.mp3", type: "audio/mpeg", size: 10 }]
    : [{ path: "user/answer.docx", name: "Зразок викладач тренер.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: bytes.length }];
  if (options.media) files.splice(0, 1, { path: "user/image.png", name: "image.png", type: "image/png", size: bytes.length });
  const result = await handler({ data: { courseId: "course", moduleId: "module", answer: options.answer ?? "", links: options.links ?? "", files }, context: { supabase, userId: "user", claims: { email: "student@example.test" } } });
  return { result, requests, updates, emails, downloads };
}

test("empty answer plus full DOCX reaches grading without an absent-work marker", async () => {
  const { result, requests } = await submit({});
  assert.equal(result.score, 12);
  assert.ok(String(requests[0]?.messages[0]?.content).includes(fullText.trim()));
  assert.equal(String(requests[0]?.messages[0]?.content).includes("(текст відсутній)"), false);
  assert.equal(requests[0]?.temperature, 0);
});

test("unreadable link never skips a readable DOCX and is appended to saved feedback", async () => {
  const { result, downloads, updates, emails } = await submit({ links: "https://example.test/document" });
  assert.deepEqual(downloads, ["user/answer.docx"]);
  assert.equal(result.manual, false);
  assert.match(result.feedback, /Не вдалося прочитати автоматично: посилання/);
  assert.equal(updates[0]?.["status"], "graded");
  assert.equal(updates[0]?.["feedback"], result.feedback);
  assert.equal(emails.length, 2);
});

test("unreadable-only submission goes to manual review without NVIDIA", async () => {
  const { result, requests, updates, emails } = await submit({ missing: true });
  assert.equal(result.manual, true);
  assert.equal(requests.length, 0);
  assert.equal(updates[0]?.["status"], "manual");
  assert.equal(emails.length, 1);
});

test("answer text is graded even with unsupported audio", async () => {
  const { result, requests } = await submit({ answer: "Виконання завдання", audio: true });
  assert.equal(result.score, 12);
  assert.equal(requests.length, 1);
  assert.match(result.feedback, /Не вдалося прочитати автоматично: файл «audio.mp3»/);
});

test("media-only submission uses the media marker and is graded", async () => {
  const { result, requests } = await submit({ media: true });
  assert.equal(result.manual, false);
  const content = requests[0]?.messages[0]?.content;
  assert.ok(Array.isArray(content));
  assert.match(content[0]?.text ?? "", /див\. зображення\/відео нижче/);
  assert.equal(content[1]?.type, "image_url");
});

test("score 3 with exactly 1500 readable characters retries once and uses second score", async () => {
  const { result, requests } = await submit({ audio: true, answer: "а".repeat(1500), scores: [3, 2] });
  assert.equal(requests.length, 2);
  assert.equal(result.score, 2);
  assert.match(String(requests[1]?.messages[0]?.content), /Оціни саме цей зміст за критеріями/);
  assert.equal(requests[1]?.temperature, 0);
});

test("score 3 below 1500 readable characters does not retry", async () => {
  const { result, requests } = await submit({ audio: true, answer: "а".repeat(1499), scores: [3, 12] });
  assert.equal(requests.length, 1);
  assert.equal(result.score, 3);
});

test("score 4 at 1500 readable characters does not retry", async () => {
  const { requests } = await submit({ audio: true, answer: "а".repeat(1500), scores: [4] });
  assert.equal(requests.length, 1);
});

test("full DOCX with low initial score uses the second grade", async () => {
  const { result, requests } = await submit({ scores: [1, 12] });
  assert.equal(requests.length, 2);
  assert.equal(result.score, 12);
});

test("failed retry never saves the suspected false minimum", async () => {
  const { result, updates } = await submit({ scores: [1], failRetry: true });
  assert.equal(result.manual, true);
  assert.equal(result.score, null);
  assert.equal(updates[0]?.["status"], "manual");
});