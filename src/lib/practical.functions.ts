import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendGmail } from "@/lib/forum.functions";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "meta/llama-3.2-90b-vision-instruct";

type Input = {
  courseId: string;
  moduleId: string;
  answer: string;
  links: string;
  image?: string | null;
};

type Slide = { title: string; blocks: { text: string }[] };

export const submitPractical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => {
    if (!d || typeof d.courseId !== "string" || typeof d.moduleId !== "string")
      throw new Error("Невірні дані");
    const answer = String(d.answer ?? "").slice(0, 20000);
    const links = String(d.links ?? "").slice(0, 2000);
    const image = typeof d.image === "string" && d.image.startsWith("data:image/") ? d.image : null;
    if (image && image.length > 6_000_000) throw new Error("Зображення завелике (до 4 МБ)");
    if (!answer.trim() && !image && !links.trim()) throw new Error("Додайте відповідь, зображення або посилання");
    return { courseId: d.courseId, moduleId: d.moduleId, answer, links, image };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = String((claims as Record<string, unknown>)["email"] ?? "");
    const meta = ((claims as Record<string, unknown>)["user_metadata"] ?? {}) as Record<string, string>;
    const name = meta["full_name"] || meta["name"] || email;

    const { data: content } = await supabase.from("site_content").select("data").eq("id", "main").maybeSingle();
    const courses = (content?.data ?? []) as unknown as {
      id: string;
      title: string;
      modules: { id: string; title: string; practicalTask?: string; notesDoc?: Slide[] }[];
    }[];
    const course = courses.find((c) => c.id === data.courseId);
    const mod = course?.modules.find((m) => m.id === data.moduleId);
    if (!course || !mod?.practicalTask) throw new Error("Для цього модуля немає практичної роботи");

    const { data: row, error } = await supabase
      .from("practical_submissions")
      .insert({
        course_id: course.id,
        module_id: mod.id,
        module_title: mod.title,
        user_id: userId,
        email,
        student_name: name,
        answer: data.answer,
        links: data.links,
        has_image: !!data.image,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error("Не вдалося зберегти роботу");

    const notes = (mod.notesDoc ?? [])
      .map((s) => `${s.title}\n${s.blocks.map((b) => b.text).join("\n")}`)
      .join("\n\n")
      .slice(0, 12000);

    const prompt = `Ти — викладач, що перевіряє практичну роботу студента з теми «${mod.title}» курсу «${course.title}».
Оціни роботу за 12-бальною шкалою (1–12), спираючись на завдання та матеріали лекції. Будь справедливим і доброзичливим. Якщо робота порожня або не стосується завдання — став 1–3.
Відповідай ЛИШЕ JSON без пояснень навколо: {"score": число, "feedback": "пояснення українською, 3–6 речень: що добре, що варто покращити"}

ЗАВДАННЯ:
${mod.practicalTask}

МАТЕРІАЛИ ЛЕКЦІЇ:
${notes || "(немає)"}

ВІДПОВІДЬ СТУДЕНТА:
${data.answer || "(текст відсутній)"}
${data.links ? `\nПосилання від студента (вміст недоступний для перегляду): ${data.links}` : ""}
${data.image ? "\nСтудент також додав зображення (див. нижче)." : ""}`;

    const key = process.env["NVIDIA_API_KEY"];
    const admin = (await import("@/integrations/supabase/client.server")).supabaseAdmin;
    if (!key) {
      await admin.from("practical_submissions").update({ status: "error", feedback: "ШІ не налаштовано" }).eq("id", row.id);
      throw new Error("Перевірку ще не налаштовано");
    }

    const userContent: unknown = data.image
      ? [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: data.image } },
        ]
      : prompt;

    let score: number | null = null;
    let feedback = "";
    try {
      const res = await fetch(NVIDIA_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: NVIDIA_MODEL,
          messages: [{ role: "user", content: userContent }],
          max_tokens: 800,
          temperature: 0.2,
        }),
      });
      if (!res.ok) {
        console.error(`NVIDIA failed [${res.status}]: ${await res.text()}`);
        throw new Error(String(res.status));
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content ?? "";
      const m = text.match(/\{[\s\S]*\}/);
      const parsed = m ? (JSON.parse(m[0]) as { score?: unknown; feedback?: unknown }) : {};
      const n = Math.round(Number(parsed.score));
      if (Number.isFinite(n)) score = Math.min(12, Math.max(1, n));
      feedback = String(parsed.feedback ?? text).slice(0, 4000);
    } catch (e) {
      console.error(e);
    }

    if (score === null) {
      await admin
        .from("practical_submissions")
        .update({ status: "error", feedback: "Автоматична перевірка тимчасово недоступна. Викладач оцінить роботу вручну." })
        .eq("id", row.id);
      return { score: null, feedback: "Роботу збережено, але автоматична перевірка зараз недоступна. Викладач оцінить її пізніше." };
    }

    await admin.from("practical_submissions").update({ status: "graded", ai_score: score, feedback }).eq("id", row.id);

    try {
      await sendGmail(
        email,
        `Практична робота: ${mod.title} — ${score}/12`,
        `Вітаю, ${name}!\n\nВашу практичну роботу з теми «${mod.title}» (курс «${course.title}») перевірено.\n\nОцінка: ${score} з 12\n\n${feedback}\n\nВаш викладач, Паращук Олег Леонідович`,
      );
    } catch (e) {
      console.error(e);
    }

    return { score, feedback };
  });
