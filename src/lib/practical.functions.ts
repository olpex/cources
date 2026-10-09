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
  studentName?: string;
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
  if (n.endsWith(".pdf") || f.type === "application/pdf") return "pdf";
  return "manual"; // audio, video, Access, old .doc/.xls — teacher checks by hand
};

async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  return String(text ?? "").replace(/\s+\n/g, "\n").trim();
}

// ---- Shared links ----
// Principle (no fixed list of services): open every public link and look at what it is.
// - A page whose metadata or content type says audio/video/music → teacher reviews it.
// - A page that yields enough readable text (e.g. a shared chat with any AI assistant) → AI grades the text.
// - Anything that can't be opened or gives too little text → teacher reviews it.
const MIN_LINK_TEXT = 400;

function isPublicHttpUrl(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(\d+\.){3}\d+$/.test(h) || h.includes(":")) return null;
    return u;
  } catch {
    return null;
  }
}

function decodeEntities(s: string) {
  return s
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
}

function collectJsonStrings(v: unknown, out: string[]) {
  if (typeof v === "string") { if (v.length > 40 && /\s/.test(v) && !/^https?:\/\//.test(v)) out.push(v); return; }
  if (Array.isArray(v)) { for (const x of v) collectJsonStrings(x, out); return; }
  if (v && typeof v === "object") for (const x of Object.values(v)) collectJsonStrings(x, out);
}

type LinkResult = { url: string; kind: "text"; text: string } | { url: string; kind: "manual"; reason: string };

async function readLink(raw: string): Promise<LinkResult> {
  const u = isPublicHttpUrl(raw);
  if (!u) return { url: raw, kind: "manual", reason: "некоректне посилання" };
  try {
    const res = await fetch(u.toString(), {
      redirect: "follow",
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; CoursePracticalChecker/1.0)", Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5" },
    });
    if (!res.ok) return { url: raw, kind: "manual", reason: `сторінка недоступна (${res.status})` };
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    if (/^(audio|video|image)\//.test(ct)) return { url: raw, kind: "manual", reason: "медіафайл" };
    if (!/text\/|json|xml/.test(ct)) return { url: raw, kind: "manual", reason: "непідтримуваний формат" };
    const html = (await res.text()).slice(0, 3_000_000);

    const meta = (p: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)`, "i"))?.[1] ?? "";
    const ogType = meta("og:type").toLowerCase();
    if (/video|music|audio|song/.test(ogType) || meta("og:video") || meta("og:audio") || meta("og:video:url") || meta("twitter:player"))
      return { url: raw, kind: "manual", reason: "аудіо / відео / музика" };

    // Visible text
    const visible = decodeEntities(
      html
        .replace(/<(script|style|noscript|svg|head)[\s\S]*?<\/\1>/gi, " ")
        .replace(/<\/(p|div|li|h\d|pre|tr|br)>/gi, "\n")
        .replace(/<[^>]+>/g, " "),
    ).replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim();

    // Many chat pages embed the conversation as JSON inside <script> tags.
    const jsonParts: string[] = [];
    for (const m of html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)) {
      const body = (m[1] ?? "").trim();
      if (!body.startsWith("{") && !body.startsWith("[")) continue;
      try { collectJsonStrings(JSON.parse(body), jsonParts); } catch { /* ignore */ }
    }
    const jsonText = [...new Set(jsonParts)].join("\n");
    const title = decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
    const desc = decodeEntities(meta("og:description") || meta("description"));
    const best = (jsonText.length > visible.length ? jsonText : visible).slice(0, 20000);
    if (best.length < MIN_LINK_TEXT) return { url: raw, kind: "manual", reason: "не вдалося прочитати вміст (сторінка вимагає входу або завантажується в браузері)" };
    return { url: raw, kind: "text", text: `${title}\n${desc}\n${best}`.trim() };
  } catch (e) {
    console.error("link read failed", raw, e);
    return { url: raw, kind: "manual", reason: "не вдалося відкрити" };
  }
}

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
    return { studentName: String(d.studentName ?? "").replace(/\s+/g, " ").trim().slice(0, 120), courseId: d.courseId, moduleId: d.moduleId, practicalId: typeof d.practicalId === "string" ? d.practicalId.slice(0, 100) : undefined, answer, links, files };
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const email = String((claims as Record<string, unknown>)["email"] ?? "");
    const meta = ((claims as Record<string, unknown>)["user_metadata"] ?? {}) as Record<string, string>;
    const name = data.studentName || meta["full_name"] || meta["name"] || email;
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

    const reasons: string[] = data.files.filter((f) => fileKind(f) === "manual").map((f) => `файл «${f.name}» (аудіо / відео / Access / старий формат)`);

    // Links: try to read each one; media or unreadable pages go to the teacher.
    let docsText = "";
    const urls = [...new Set(data.links.split(/\s+/).map((s) => s.trim()).filter(Boolean))].slice(0, 5);
    for (const r of await Promise.all(urls.map(readLink))) {
      if (r.kind === "text") docsText += `\n\n--- Вміст за посиланням ${r.url} ---\n${r.text.slice(0, 12000)}`;
      else reasons.push(`посилання ${r.url}: ${r.reason}`);
    }

    // Files the AI can read: Word/Excel/PDF text and the first image.
    let image: string | null = null;
    if (!reasons.length) for (const f of data.files) {
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
        } else if (kind === "pdf") {
          const t = await pdfText(bytes);
          if (t.length < 50) reasons.push(`файл «${f.name}»: PDF без тексту (скан або зображення)`);
          else docsText += `\n\n--- Файл «${f.name}» ---\n${t.slice(0, 15000)}`;
        }
      } catch (e) {
        console.error("file read failed", f.name, e);
        reasons.push(`файл «${f.name}»: не вдалося прочитати`);
      }
    }

    if (reasons.length) {
      await admin.from("practical_submissions").update({ status: "manual" }).eq("id", row.id);
      await notifyTeacher(name, email, course.title, taskTitle, `Потрібна ваша перевірка. ШІ не зміг оцінити:\n- ${reasons.join("\n- ")}`);
      return { score: null, manual: true, feedback: "Роботу отримано. Викладач перегляне посилання й файли та виставить оцінку." };
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