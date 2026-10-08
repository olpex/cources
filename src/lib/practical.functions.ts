import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendGmail } from "@/lib/forum.functions";

const NVIDIA_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "meta/llama-3.2-90b-vision-instruct";
const BUCKET = "practical-files";

export type PracticalFile = { path: string; name: string; type: string; size: number };

type Input = {
  courseId: string;
  moduleId: string;
  practicalId?: string;
  answer: string;
  links: string;
  files: PracticalFile[];
};

type Slide = { title: string; blocks: { text: string }[] };

const fileKind = (f: PracticalFile) => {
  const n = f.name.toLowerCase();
  if (f.type.startsWith("image/")) return "image";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".xlsx")) return "xlsx";
  return "manual"; // audio, video, Access, old .doc/.xls — teacher checks by hand
};

function xmlText(xml: string, tag: string) {
  const re = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "g");
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] ?? "");
  return out
    .join(" ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
}

async function officeText(bytes: Uint8Array, kind: "docx" | "xlsx"): Promise<string> {
  const { unzipSync, strFromU8 } = await import("fflate");
  const files = unzipSync(bytes);
  if (kind === "docx") {
    const doc = files["word/document.xml"]; const xml = doc ? strFromU8(doc) : "";
    return xmlText(xml.replace(/<\/w:p>/g, "</w:p>\n"), "w:t");
  }
  const parts: string[] = [];
  const ss = files["xl/sharedStrings.xml"]; if (ss) parts.push(xmlText(strFromU8(ss), "t"));
  for (const k of Object.keys(files).filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k))) {
    const sheet = files[k]; if (sheet) parts.push(`[${k.split("/").pop()}] ` + xmlText(strFromU8(sheet), "v"));
  }
  return parts.join("\n");
}

function toBase64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

const signature = "Ваш викладач, Паращук Олег Леонідович";
const TEACHER_EMAIL = "olppara@gmail.com";

async function notifyTeacher(student: string, email: string, courseTitle: string, moduleTitle: string, result: string) {
  try {
    await sendGmail(
      TEACHER_EMAIL,
      `Нова практична робота: ${student} — ${moduleTitle}`,
      `Студент: ${student} (${email})\nКурс: ${courseTitle}\nМодуль / практична робота: ${moduleTitle}\n\n${result}\n\nПереглянути роботу можна в блоці «Результати практичних робіт» на сторінці курсу.`,
    );
  } catch (e) {
    console.error("teacher notify failed", e);
  }
}

export const submitPractical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Input) => {
    if (!d || typeof d.courseId !== "string" || typeof d.moduleId !== "string")
      throw new Error("Невірні дані");
    const answer = String(d.answer ?? "").slice(0, 20000);
    const links = String(d.links ?? "").slice(0, 3000);
    const files = (Array.isArray(d.files) ? d.files : []).slice(0, 5).map((f) => ({
      path: String(f.path),
      name: String(f.name).slice(0, 200),
      type: String(f.type ?? "").slice(0, 100),
      size: Number(f.size) || 0,
    }));
    if (!answer.trim() && !links.trim() && !files.length)
      throw new Error("Додайте відповідь, посилання або файл");
    return { courseId: d.courseId, moduleId: d.moduleId, practicalId: typeof d.practicalId === "string" ? d.practicalId.slice(0, 100) : undefined, answer, links, files };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = String((claims as Record<string, unknown>)["email"] ?? "");
    const meta = ((claims as Record<string, unknown>)["user_metadata"] ?? {}) as Record<string, string>;
    const name = meta["full_name"] || meta["name"] || email;
    if (data.files.some((f) => !f.path.startsWith(`${userId}/`))) throw new Error("Невірний файл");

    const { data: content } = await supabase.from("site_content").select("data").eq("id", "main").maybeSingle();
    const courses = (content?.data ?? []) as unknown as {
      id: string;
      title: string;
      modules: {
        id: string;
        title: string;
        practicalTask?: string;
        practicals?: { id: string; title: string; task: string }[];
        notesDoc?: Slide[];
      }[];
    }[];
    const course = courses.find((c) => c.id === data.courseId);
    const mod = course?.modules.find((m) => m.id === data.moduleId);
    const sub = data.practicalId ? mod?.practicals?.find((p) => p.id === data.practicalId) : undefined;
    const taskId = sub ? sub.id : mod?.id ?? "";
    const taskTitle = sub ? sub.title : mod?.title ?? "";
    const taskText = sub ? sub.task : mod?.practicalTask ?? "";
    if (!course || !mod || !taskText) throw new Error("Для цього модуля немає практичної роботи");

    const needsTeacher = !!data.links.trim() || data.files.some((f) => fileKind(f) === "manual");

    const { data: row, error } = await supabase
      .from("practical_submissions")
      .insert({
        course_id: course.id,
        module_id: taskId,
        module_title: taskTitle,
        user_id: userId,
        email,
        student_name: name,
        answer: data.answer,
        links: data.links,
        has_image: data.files.some((f) => fileKind(f) === "image"),
        files: data.files,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error("Не вдалося зберегти роботу");

    const admin = (await import("@/integrations/supabase/client.server")).supabaseAdmin;

    if (needsTeacher) {
      await admin.from("practical_submissions").update({ status: "manual" }).eq("id", row.id);
      await notifyTeacher(name, email, course.title, taskTitle, "Потрібна ваша перевірка: робота містить посилання або файли, які ШІ не оцінює.");
      return { score: null, manual: true, feedback: "Роботу отримано. Викладач перегляне посилання й файли та виставить оцінку." };
    }

    // Collect content the AI can read: Word/Excel text and the first image.
    let docsText = "";
    let image: string | null = null;
    for (const f of data.files) {
      const kind = fileKind(f);
      if (kind === "image" && image) continue;
      try {
        const { data: blob } = await admin.storage.from(BUCKET).download(f.path);
        if (!blob) continue;
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (kind === "image") {
          if (bytes.length <= 4 * 1024 * 1024) image = `data:${f.type};base64,${toBase64(bytes)}`;
        } else if (kind === "docx" || kind === "xlsx") {
          docsText += `\n\n--- Файл «${f.name}» ---\n${(await officeText(bytes, kind)).slice(0, 15000)}`;
        }
      } catch (e) {
        console.error("file read failed", f.name, e);
      }
    }

    const notes = (mod.notesDoc ?? [])
      .map((s) => `${s.title}\n${s.blocks.map((b) => b.text).join("\n")}`)
      .join("\n\n")
      .slice(0, 12000);

    const prompt = `Ти — викладач, що перевіряє практичну роботу студента з теми «${taskTitle}» курсу «${course.title}».
Оціни роботу за 12-бальною шкалою (1–12), спираючись на завдання та матеріали лекції. Будь справедливим і доброзичливим. Якщо робота порожня або не стосується завдання — став 1–3.
Відповідай ЛИШЕ JSON без пояснень навколо: {"score": число, "feedback": "пояснення українською, 3–6 речень: що добре, що варто покращити"}

ЗАВДАННЯ:
${taskText}

МАТЕРІАЛИ ЛЕКЦІЇ:
${notes || "(немає)"}

ВІДПОВІДЬ СТУДЕНТА:
${data.answer || "(текст відсутній)"}${docsText.slice(0, 30000)}
${image ? "\nСтудент також додав зображення (див. нижче)." : ""}`;

    const key = process.env["NVIDIA_API_KEY"];
    let score: number | null = null;
    let feedback = "";
    if (key) {
      try {
        const res = await fetch(NVIDIA_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: NVIDIA_MODEL,
            messages: [
              {
                role: "user",
                content: image
                  ? [
                      { type: "text", text: prompt },
                      { type: "image_url", image_url: { url: image } },
                    ]
                  : prompt,
              },
            ],
            max_tokens: 800,
            temperature: 0.2,
          }),
        });
        if (!res.ok) throw new Error(`NVIDIA failed [${res.status}]: ${await res.text()}`);
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
    }

    if (score === null) {
      await admin
        .from("practical_submissions")
        .update({ status: "manual", feedback: null })
        .eq("id", row.id);
      await notifyTeacher(name, email, course.title, taskTitle, "Потрібна ваша перевірка: автоматична оцінка не вдалася.");
      return { score: null, manual: true, feedback: "Роботу збережено. Автоматична перевірка зараз недоступна — викладач оцінить її вручну." };
    }

    await admin.from("practical_submissions").update({ status: "graded", ai_score: score, feedback }).eq("id", row.id);
    await notifyTeacher(name, email, course.title, taskTitle, `ШІ оцінив роботу: ${score}/12. За потреби ви можете змінити оцінку.\n\nПояснення ШІ:\n${feedback}`);
    try {
      await sendGmail(
        email,
        `Практична робота: ${taskTitle} — ${score}/12`,
        `Вітаю, ${name}!\n\nВашу практичну роботу з теми «${taskTitle}» (курс «${course.title}») перевірено.\n\nОцінка: ${score} з 12\n\n${feedback}\n\n${signature}`,
      );
    } catch (e) {
      console.error(e);
    }
    return { score, manual: false, feedback };
  });

export const gradePractical = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; score: number; feedback: string; notify: boolean }) => {
    const score = Number(d?.score);
    if (typeof d?.id !== "string" || !Number.isInteger(score) || score < 1 || score > 12)
      throw new Error("Оцінка має бути від 1 до 12");
    return { id: d.id, score, feedback: String(d.feedback ?? "").slice(0, 4000), notify: !!d.notify };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isTeacher } = await supabase.rpc("has_role", { _user_id: userId, _role: "teacher" });
    if (!isTeacher) throw new Error("Лише викладач може оцінювати");
    const { data: row, error } = await supabase
      .from("practical_submissions")
      .update({ teacher_score: data.score, feedback: data.feedback || null, status: "graded" })
      .eq("id", data.id)
      .select("email, student_name, module_title")
      .single();
    if (error || !row) throw new Error("Не вдалося зберегти оцінку");
    if (data.notify && row.email) {
      try {
        await sendGmail(
          row.email,
          `Практична робота: ${row.module_title} — ${data.score}/12`,
          `Вітаю, ${row.student_name}!\n\nВашу практичну роботу з теми «${row.module_title}» перевірено.\n\nОцінка: ${data.score} з 12\n\n${data.feedback}\n\n${signature}`,
        );
      } catch (e) {
        console.error(e);
      }
    }
    return { ok: true };
  });