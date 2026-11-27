import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RegistrationDatabase } from "@/lib/registration-database";
import { getRequestHeader, setCookie, deleteCookie, getCookie } from "@tanstack/react-start/server";
import { sendGmail } from "@/lib/forum.functions";
import {
  CONTACT_EMAIL,
  CODE_TTL_MS,
  CODE_MAX_ATTEMPTS,
  CODES_PER_HOUR,
  decideCode,
  decideNewCode,
  decideRegistration,
  isEmail,
  normalizeCode,
  normalizeEmail,
  refuse,
  type Refusal,
} from "@/lib/registration-rules";

export { CONTACT_EMAIL };

/**
 * Registration of students by email + course, bound to a device.
 *
 * The teacher keeps the ordinary Supabase login for editing. Students get a
 * real Supabase session too (created server-side, exchanged on the client),
 * so every existing feature that reads `user` keeps working unchanged.
 */

const DEVICE_COOKIE = "lms_device";
const DEVICE_MAX_AGE = 60 * 60 * 24 * 365;

const enc = new TextEncoder();

async function sha256(value: string) {
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(value));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String((a[0] ?? 0) % 1000000).padStart(6, "0");
}

function randomToken() {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Keep generated clients untouched; add the existing migration's query
  // contract locally while its objects are absent from generated live types.
  return supabaseAdmin as unknown as SupabaseClient<RegistrationDatabase>;
}

async function isTeacherEmail(email: string) {
  const db = await admin();
  const { data } = await db.rpc("student_is_teacher_email", { _email: email });
  return !!data;
}

async function isBanned(email: string) {
  const db = await admin();
  const { data } = await db.from("forum_bans").select("email").eq("email", email).maybeSingle();
  return !!data;
}

function setDeviceCookie(token: string) {
  setCookie(DEVICE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: DEVICE_MAX_AGE,
  });
}

/** Who is on this device right now, according to the cookie alone. */
export const getRegistrationState = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(DEVICE_COOKIE);
  if (!token) return { known: false as const };
  const db = await admin();
  const { data } = await db
    .from("student_devices")
    .select("email, course_id, role, revoked_at")
    .eq("token_hash", await sha256(token))
    .maybeSingle();
  if (!data || data.revoked_at) {
    if (data) deleteCookie(DEVICE_COOKIE, { path: "/" });
    return { known: false as const };
  }
  await db
    .from("student_devices")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("token_hash", await sha256(token));

  if (data.role === "teacher") {
    return { known: true as const, role: "teacher" as const, email: data.email, fullName: "", courseId: null };
  }
  const { data: reg } = await db
    .from("student_registrations")
    .select("email, course_id, full_name, status")
    .eq("email", data.email)
    .eq("course_id", data.course_id ?? "")
    .maybeSingle();
  if (!reg || reg.status !== "active") {
    deleteCookie(DEVICE_COOKIE, { path: "/" });
    return { known: false as const };
  }
  return {
    known: true as const,
    role: "student" as const,
    email: reg.email,
    fullName: reg.full_name,
    courseId: reg.course_id,
  };
});

/**
 * Returning visitor on a known device: no code is sent, but a real Supabase
 * session is still needed, so the server mints a one-time token for the email
 * the cookie already proved. Refuses if the registration was ended or blocked.
 */
export const resumeSession = createServerFn({ method: "POST" }).handler(
  async (): Promise<
    { ok: true; tokenHash: string; courseId: string | null; role: "student" | "teacher" } | { ok: false }
  > => {
    const token = getCookie(DEVICE_COOKIE);
    if (!token) return { ok: false };
    const db = await admin();
    const { data: device } = await db
      .from("student_devices")
      .select("email, course_id, role, revoked_at")
      .eq("token_hash", await sha256(token))
      .maybeSingle();
    if (!device || device.revoked_at) return { ok: false };

    if (device.role !== "teacher") {
      const { data: reg } = await db
        .from("student_registrations")
        .select("status")
        .eq("email", device.email)
        .eq("course_id", device.course_id ?? "")
        .maybeSingle();
      if (!reg || reg.status !== "active") return { ok: false };
    }

    const { data: link, error } = await db.auth.admin.generateLink({
      type: "magiclink",
      email: device.email,
    });
    if (error || !link?.properties?.hashed_token) return { ok: false };
    return {
      ok: true,
      tokenHash: link.properties.hashed_token,
      courseId: device.course_id ?? null,
      role: device.role === "teacher" ? "teacher" : "student",
    };
  },
);

type RefusalResult = Refusal;

/** Ask for a 6-digit code. Sent once per device. */
export const requestRegistrationCode = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; fullName?: string; courseId?: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true; role: "student" | "teacher" } | RefusalResult> => {
    const email = normalizeEmail(data.email);
    if (!isEmail(email)) {
      return refuse("invalid-email", "Перевірте адресу електронної пошти.");
    }
    const db = await admin();
    const teacher = await isTeacherEmail(email);
    const courseId = teacher ? "" : (data.courseId ?? "").trim();

    const banned = teacher ? false : await isBanned(email);
    const { data: rows } = teacher
      ? { data: [] as { course_id: string; status: string }[] }
      : await db.from("student_registrations").select("course_id, status").eq("email", email);

    const decision = decideRegistration({
      email,
      courseId,
      isTeacher: teacher,
      banned,
      rows: rows ?? [],
    });
    if (!decision.ok) return decision;

    // Rate limit: at most three codes per hour, and a cooldown after three
    // failed attempts on the newest one.
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await db
      .from("student_codes")
      .select("attempts, created_at")
      .eq("email", email)
      .gte("created_at", hourAgo)
      .order("created_at", { ascending: false });
    const allowed = decideNewCode({ recent: recent ?? [], now: Date.now() });
    if (!allowed.ok) return allowed;

    const code = randomCode();
    const { error } = await db.from("student_codes").insert({
      email,
      course_id: teacher ? null : courseId,
      role: teacher ? "teacher" : "student",
      full_name: teacher ? "" : (data.fullName ?? "").trim(),
      code_hash: await sha256(`${email}:${code}`),
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (error) throw error;

    const body = [
      `Код для входу: ${code}`,
      "",
      "Код діє 15 хвилин і підходить лише для цього пристрою.",
      "Якщо ви не реєструвалися на платформі, просто проігноруйте цей лист.",
      "",
      "Паращук Олег Леонідович",
    ].join("\n");
    try {
      await sendGmail(email, "Код входу на навчальну платформу", body, {
        senderName: "Навчальна платформа, вхід",
      });
    } catch (e) {
      console.error("registration code send failed", e);
      return refuse("mail-failed", `Не вдалося надіслати лист. Спробуйте пізніше або напишіть на ${CONTACT_EMAIL}.`);
    }
    return { ok: true, role: teacher ? "teacher" : "student" };
  });

/** Check the code, bind the device, and hand the client a token to open a session. */
export const verifyRegistrationCode = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; code: string }) => d)
  .handler(async ({ data }): Promise<{ ok: true; tokenHash: string } | RefusalResult> => {
    const email = normalizeEmail(data.email);
    const code = normalizeCode(data.code);
    if (code.length !== 6) return refuse("invalid-code", "Код складається з шести цифр.");

    const db = await admin();
    const { data: row } = await db
      .from("student_codes")
      .select("id, course_id, role, full_name, code_hash, attempts, expires_at, used_at")
      .eq("email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const matched = !!row && (await sha256(`${email}:${code}`)) === row.code_hash;
    const decision = decideCode({ row: row ?? null, matched, now: Date.now() });
    if (!decision.ok) {
      if (row && !row.used_at && decision.reason === "invalid-code" && row.attempts < CODE_MAX_ATTEMPTS) {
        await db.from("student_codes").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      }
      return decision;
    }
    if (!row) return refuse("invalid-code", "Спочатку запросіть код.");

    await db.from("student_codes").update({ used_at: new Date().toISOString() }).eq("id", row.id);

    const token = randomToken();
    const userAgent = getRequestHeader("user-agent") ?? "";
    await db.from("student_devices").insert({
      email,
      course_id: row.course_id,
      role: row.role,
      token_hash: await sha256(token),
      user_agent: userAgent.slice(0, 300),
    });

    // Keep a real Supabase user so existing features keep working.
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    let userId = created?.user?.id ?? null;
    if (createErr || !userId) {
      // Already registered earlier: find the existing account, page by page.
      for (let page = 1; page <= 25 && !userId; page++) {
        const { data: list } = await db.auth.admin.listUsers({ page, perPage: 200 });
        const users = list?.users ?? [];
        userId = users.find((u) => (u.email ?? "").toLowerCase() === email)?.id ?? null;
        if (users.length < 200) break;
      }
    }
    if (!userId) {
      console.error("student user could not be resolved", email);
      return refuse("mail-failed", `Не вдалося відкрити сесію. Напишіть на ${CONTACT_EMAIL}.`);
    }

    if (row.role === "student" && row.course_id) {
      // Never revive a finished or blocked registration: insert only when the
      // pair is new, otherwise keep the existing status untouched.
      const { data: existing } = await db
        .from("student_registrations")
        .select("id, status")
        .eq("email", email)
        .eq("course_id", row.course_id)
        .maybeSingle();
      if (!existing) {
        await db.from("student_registrations").insert({
          email,
          course_id: row.course_id,
          full_name: row.full_name,
          status: "active",
        });
      } else if (existing.status === "active" && row.full_name) {
        await db
          .from("student_registrations")
          .update({ full_name: row.full_name })
          .eq("id", existing.id);
      }
      if (!existing || existing.status === "active") {
        await db.from("announcement_subscriptions").upsert(
          { user_id: userId, course_id: row.course_id, email, name: row.full_name },
          { onConflict: "user_id,course_id" },
        );
      }
    }

    const { data: link, error: linkErr } = await db.auth.admin.generateLink({ type: "magiclink", email });
    if (linkErr || !link?.properties?.hashed_token) {
      console.error("generateLink failed", linkErr);
      return refuse("mail-failed", "Не вдалося відкрити сесію. Спробуйте ще раз.");
    }

    setDeviceCookie(token);
    return { ok: true, tokenHash: link.properties.hashed_token };
  });

/** Forget this device (the registration itself stays). */
export const forgetDevice = createServerFn({ method: "POST" }).handler(async () => {
  const token = getCookie(DEVICE_COOKIE);
  if (token) {
    const db = await admin();
    await db
      .from("student_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("token_hash", await sha256(token));
    deleteCookie(DEVICE_COOKIE, { path: "/" });
  }
  return { ok: true };
});

async function requireTeacher() {
  const token = getCookie(DEVICE_COOKIE);
  const db = await admin();
  if (token) {
    const { data } = await db
      .from("student_devices")
      .select("email, role, revoked_at")
      .eq("token_hash", await sha256(token))
      .maybeSingle();
    if (data && !data.revoked_at && data.role === "teacher") return data.email as string;
  }
  // Old flow keeps working: a normal Supabase session of a teacher is enough.
  const auth = getRequestHeader("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    const jwt = auth.slice(7);
    const { data: who } = await db.auth.getUser(jwt);
    const email = (who?.user?.email ?? "").toLowerCase();
    if (email && (await isTeacherEmail(email))) return email;
  }
  throw new Error("Потрібен вхід викладача.");
}

export type StudentRow = {
  id: string;
  email: string;
  full_name: string;
  status: string;
  created_at: string;
  ended_at: string | null;
};

/** Everyone ever registered for a course, with current state. */
export const listCourseStudents = createServerFn({ method: "POST" })
  .inputValidator((d: { courseId: string }) => d)
  .handler(async ({ data }): Promise<StudentRow[]> => {
    await requireTeacher();
    const db = await admin();
    const { data: rows, error } = await db
      .from("student_registrations")
      .select("id, email, full_name, status, created_at, ended_at")
      .eq("course_id", data.courseId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return (rows ?? []) as StudentRow[];
  });

/** Close the course for one student: they can never rejoin this course. */
export const revokeStudent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    await requireTeacher();
    const db = await admin();
    const { data: row } = await db
      .from("student_registrations")
      .select("email, course_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Студента не знайдено.");
    await db
      .from("student_registrations")
      .update({ status: "revoked", ended_at: new Date().toISOString() })
      .eq("id", data.id);
    await db.from("announcement_subscriptions").delete().eq("email", row.email).eq("course_id", row.course_id);
    await db
      .from("student_devices")
      .update({ revoked_at: new Date().toISOString() })
      .eq("email", row.email)
      .eq("course_id", row.course_id);
    return { ok: true };
  });

/** Lifetime ban for this email on every device and every course. */
export const blockStudent = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; reason?: string }) => d)
  .handler(async ({ data }) => {
    await requireTeacher();
    const db = await admin();
    const { data: row } = await db
      .from("student_registrations")
      .select("email, course_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Студента не знайдено.");
    await db
      .from("student_registrations")
      .update({ status: "blocked", ended_at: new Date().toISOString(), note: (data.reason ?? "").slice(0, 500) })
      .eq("id", data.id);
    await db.from("forum_bans").upsert({ email: row.email, reason: (data.reason ?? "").slice(0, 500) });
    await db.from("announcement_subscriptions").delete().eq("email", row.email);
    await db.from("student_devices").update({ revoked_at: new Date().toISOString() }).eq("email", row.email);
    return { ok: true };
  });

/** Lift a lifetime ban (kept separate from revoke on purpose). */
export const unblockStudent = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data }) => {
    await requireTeacher();
    const db = await admin();
    const email = normalizeEmail(data.email);
    await db.from("forum_bans").delete().eq("email", email);
    await db.from("student_registrations").update({ status: "revoked" }).eq("email", email).eq("status", "blocked");
    return { ok: true };
  });

/** End the course for everyone at once. */
export const revokeAllStudents = createServerFn({ method: "POST" })
  .inputValidator((d: { courseId: string }) => d)
  .handler(async ({ data }) => {
    await requireTeacher();
    const db = await admin();
    const { data: rows } = await db
      .from("student_registrations")
      .select("email")
      .eq("course_id", data.courseId)
      .eq("status", "active");
    const now = new Date().toISOString();
    await db
      .from("student_registrations")
      .update({ status: "revoked", ended_at: now })
      .eq("course_id", data.courseId)
      .eq("status", "active");
    await db.from("announcement_subscriptions").delete().eq("course_id", data.courseId);
    await db
      .from("student_devices")
      .update({ revoked_at: now })
      .eq("course_id", data.courseId);
    return { ok: true, count: rows?.length ?? 0 };
  });

export { DEVICE_COOKIE };
