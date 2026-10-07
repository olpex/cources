import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const TEACHER_EMAIL = "olppara@gmail.com";
const SENDER_NAME = "Паращук О. Л. — Навчальна платформа";

const b64 = (s: string) =>
  btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

async function sendGmail(
  to: string,
  subject: string,
  text: string,
  options: { senderName?: string; html?: string } = {},
) {
  const lovableKey = process.env["LOVABLE_API_KEY"];
  const gmailKey = process.env["GOOGLE_MAIL_API_KEY"];
  if (!lovableKey || !gmailKey) throw new Error("Пошту не налаштовано");
  const boundary = `forum-${crypto.randomUUID()}`;
  const mimeBody = options.html
    ? [
        `--${boundary}`,
        'Content-Type: text/plain; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64(text),
        `--${boundary}`,
        'Content-Type: text/html; charset="UTF-8"',
        "Content-Transfer-Encoding: base64",
        "",
        b64(options.html),
        `--${boundary}--`,
      ].join("\r\n")
    : b64(text);
  const raw = b64(
    [
      `From: ${header(options.senderName ?? SENDER_NAME)} <${TEACHER_EMAIL}>`,
      `To: ${to}`,
      `Subject: ${header(subject)}`,
      "MIME-Version: 1.0",
      options.html
        ? `Content-Type: multipart/alternative; boundary="${boundary}"`
        : 'Content-Type: text/plain; charset="UTF-8"',
      ...(options.html ? [] : ["Content-Transfer-Encoding: base64"]),
      "",
      mimeBody,
    ].join("\r\n"),
  )
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const res = await fetch(`${GATEWAY_URL}/users/me/messages/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": gmailKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`Gmail send failed [${res.status}]: ${body}`);
    throw new Error(`Не вдалося надіслати лист [${res.status}]`);
  }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

function forumUrl() {
  const req = getRequest();
  try {
    const u = new URL(req.url);
    const host = u.hostname === "localhost" ? req.headers.get("x-forwarded-host") : null;
    return `${host ? `https://${host}` : u.origin}/forum`;
  } catch {
    return "https://cources.lovable.app/forum";
  }
}

async function isTeacher(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "teacher" });
  return !!data;
}

/** Tell the teacher a new question was posted. */
export const notifyNewThread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { threadId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: t } = await context.supabase
      .from("forum_threads")
      .select("title, body, author_name, author_id")
      .eq("id", data.threadId)
      .maybeSingle();
    if (!t || t.author_id !== context.userId) return { ok: false };
    if (await isTeacher(context.supabase, context.userId)) return { ok: true };
    await sendGmail(
      TEACHER_EMAIL,
      `Нове звернення на форумі: ${t.title}`,
      `${t.author_name} написав(-ла):\n\n${t.body}\n\nВідповісти: ${forumUrl()}`,
    );
    return { ok: true };
  });

/** Email the other side of the conversation about a new reply. */
export const notifyReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { replyId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: r } = await context.supabase
      .from("forum_replies")
      .select("body, author_id, author_name, is_teacher, thread_id")
      .eq("id", data.replyId)
      .maybeSingle();
    if (!r || r.author_id !== context.userId) return { ok: false };
    const { data: t } = await context.supabase
      .from("forum_threads")
      .select("title, author_id")
      .eq("id", r.thread_id)
      .maybeSingle();
    if (!t) return { ok: false };
    if (r.is_teacher) {
      if (t.author_id === context.userId) return { ok: true };
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(t.author_id);
      const email = u?.user?.email;
      if (!email) return { ok: false };
      await sendGmail(
        email,
        `Відповідь викладача: ${t.title}`,
        `Викладач відповів на ваше звернення «${t.title}»:\n\n${r.body}\n\nПереглянути обговорення: ${forumUrl()}`,
      );
    } else {
      await sendGmail(
        TEACHER_EMAIL,
        `Нова відповідь на форумі: ${t.title}`,
        `${r.author_name} написав(-ла):\n\n${r.body}\n\nПереглянути: ${forumUrl()}`,
      );
    }
    return { ok: true };
  });

/** Teacher sends an organizational message to all subscribers of a course. */
export const sendBroadcast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { courseId: string; courseTitle: string; subject: string; body: string }) => {
    if (!d.subject?.trim() || !d.body?.trim() || !d.courseId) throw new Error("Заповніть тему й текст");
    return d;
  })
  .handler(async ({ data, context }) => {
    if (!(await isTeacher(context.supabase, context.userId))) throw new Error("Лише для викладача");
    const { data: subs, error } = await context.supabase
      .from("course_subscriptions")
      .select("email")
      .eq("course_id", data.courseId);
    if (error) throw error;
    const emails = [...new Set((subs ?? []).map((s) => s.email.toLowerCase()))];
    const url = forumUrl();
    const signature = "Ваш викладач, Паращук Олег Леонідович";
    const html = `<html lang="uk"><body><p>${escapeHtml(data.body).replace(/\r?\n/g, "<br>")}</p><p>—<br><em>${signature}<br>Форум курсу: <a href="${escapeHtml(url)}">${escapeHtml(url)}</a></em></p></body></html>`;
    let sent = 0;
    for (const email of emails) {
      try {
        await sendGmail(
          email,
          `[${data.courseTitle}] ${data.subject}`,
          `${data.body}\n\n—\n${signature}\nФорум курсу: ${url}`,
          { senderName: `${data.courseTitle}, повідомлення`, html },
        );
        sent++;
      } catch (e) {
        console.error("broadcast send failed", email, e);
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("forum_broadcasts").insert({
      course_id: data.courseId,
      subject: data.subject,
      body: data.body,
      sent_count: sent,
    });
    return { sent, total: emails.length };
  });
