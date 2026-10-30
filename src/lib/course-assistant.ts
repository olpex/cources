export const ASSISTANT_URL = "https://olpex.pythonanywhere.com";
export const ASSISTANT_TIMEOUT_MS = 60_000;

export type AssistantCourse = { key: string; name: string };
export type AssistantAnswer = { answer: string; sources: string[] };

export function assistantCourseKey(id: string, title: string): string | null {
  const name = title.toLocaleLowerCase("uk");
  if (id === "ai" || name.includes("штучний інтелект")) return "ai_career";
  if (id === "digital" || name.includes("цифровий світ")) return "cyber";
  if (id === "design" || name.includes("графічний дизайн")) return "design";
  return null;
}

export function allowedAssistantKeys(courses: { id: string; title: string }[]): string[] {
  return courses.map((course) => assistantCourseKey(course.id, course.title)).filter((key): key is string => key !== null);
}

export function filterAssistantCourses(courses: AssistantCourse[], allowedKeys: string[]): AssistantCourse[] {
  return courses.filter((course) => allowedKeys.includes(course.key));
}

async function request(path: string, init: RequestInit, signal: AbortSignal): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(abort, ASSISTANT_TIMEOUT_MS);
  try {
    const response = await fetch(`${ASSISTANT_URL}${path}`, { ...init, signal: controller.signal, credentials: "omit" });
    const data = await response.json() as Record<string, unknown>;
    if (!response.ok || data['ok'] !== true) {
      throw new Error(typeof data['error'] === "string" ? data['error'] : "Помічник тимчасово недоступний. Спробуйте ще раз.");
    }
    return data;
  } catch (error) {
    if (signal.aborted) throw error;
    if (controller.signal.aborted) throw new Error("Час очікування минув (60 с). Спробуйте надіслати запит ще раз.");
    if (error instanceof TypeError) throw new Error("Не вдалося з’єднатися з помічником. Перевірте з’єднання та спробуйте ще раз.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export async function getAssistantCourses(signal: AbortSignal): Promise<AssistantCourse[]> {
  const data = await request("/courses", {}, signal);
  if (!Array.isArray(data['courses'])) throw new Error("Не вдалося отримати список курсів.");
  const courses = data['courses'].filter((course): course is AssistantCourse =>
    typeof course?.key === "string" && typeof course?.name === "string");
  if (!courses.length) throw new Error("Помічник ще налаштовується: список курсів порожній.");
  return courses;
}

export async function askAssistant(course: string, question: string, signal: AbortSignal): Promise<AssistantAnswer> {
  const data = await request("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ course, question: question.trim() }),
  }, signal);
  if (typeof data['answer'] !== "string") throw new Error("Помічник не повернув відповідь. Спробуйте ще раз.");
  return { answer: data['answer'], sources: Array.isArray(data['sources']) ? data['sources'].filter((s): s is string => typeof s === "string") : [] };
}