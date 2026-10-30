import { test } from "node:test";
import assert from "node:assert/strict";
import { allowedAssistantKeys, askAssistant, assistantCourseKey, ASSISTANT_TIMEOUT_MS, filterAssistantCourses } from "./course-assistant";

test("AI course preselects ai_career", () => assert.equal(assistantCourseKey("ai", "Штучний інтелект"), "ai_career"));
test("Digital World preselects cyber", () => assert.equal(assistantCourseKey("digital", "Цифровий світ для початківців"), "cyber"));
test("Graphic Design preselects design even with a generated id", () => assert.equal(assistantCourseKey("generated", "Графічний дизайн"), "design"));
test("request timeout is 60 seconds", () => assert.equal(ASSISTANT_TIMEOUT_MS, 60_000));
test("each question sends only the selected key and question, without history or credentials", async () => {
  const original = globalThis.fetch;
  const bodies: unknown[] = [];
  globalThis.fetch = async (url, init) => {
    assert.equal(url, "https://olpex.pythonanywhere.com/ask");
    assert.equal(init?.credentials, "omit");
    bodies.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true, answer: "Відповідь", sources: ["Тема"] }));
  };
  try {
    assert.deepEqual(await askAssistant("ai_career", "Перше питання", new AbortController().signal), { answer: "Відповідь", sources: ["Тема"] });
    await askAssistant("cyber", "Друге питання", new AbortController().signal);
    assert.deepEqual(bodies, [{ course: "ai_career", question: "Перше питання" }, { course: "cyber", question: "Друге питання" }]);
  } finally { globalThis.fetch = original; }
});
for (const status of [400, 429, 502, 503]) {
  test(`server error ${status} preserves the supplied error`, async () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ ok: false, error: `Помилка ${status}` }), { status });
    try { await assert.rejects(askAssistant("design", "Питання", new AbortController().signal), { message: `Помилка ${status}` }); }
    finally { globalThis.fetch = original; }
  });
}