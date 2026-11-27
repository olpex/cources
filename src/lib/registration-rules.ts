/**
 * Pure rules for student registration. No database, no mail, no cookies —
 * so every branch can be tested directly.
 */

export const CONTACT_EMAIL = "olppara@gmail.com";
export const CODE_TTL_MS = 15 * 60 * 1000;
export const CODE_MAX_ATTEMPTS = 3;
export const CODE_COOLDOWN_MS = 10 * 60 * 1000;
export const CODES_PER_HOUR = 3;

export type RefusalReason =
  | "banned"
  | "ended"
  | "other-course"
  | "cooldown"
  | "invalid-email"
  | "mail-failed"
  | "invalid-code";

export type Refusal = {
  ok: false;
  reason: RefusalReason;
  message: string;
  retryAfterMinutes?: number;
};

export function refuse(reason: RefusalReason, message: string, retryAfterMinutes?: number): Refusal {
  return retryAfterMinutes === undefined
    ? { ok: false, reason, message }
    : { ok: false, reason, message, retryAfterMinutes };
}

export const bannedRefusal = () =>
  refuse(
    "banned",
    `Доступ до платформи закрито. Якщо вважаєте це помилкою, напишіть на ${CONTACT_EMAIL}.`,
  );

export const endedRefusal = () =>
  refuse(
    "ended",
    `Навчання на цьому курсі завершено, повторна реєстрація неможлива. З питань інших курсів напишіть на ${CONTACT_EMAIL}.`,
  );

export const otherCourseRefusal = () =>
  refuse(
    "other-course",
    `Ця пошта вже зареєстрована на іншому курсі. Один студент — один курс. Напишіть на ${CONTACT_EMAIL}, якщо потрібно змінити курс.`,
  );

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

export function normalizeCode(value: unknown) {
  return typeof value === "string" ? value.replace(/\D/g, "") : "";
}

export type RegistrationRow = { course_id: string; status: string };

/**
 * May this email register for this course?
 *
 * One course per student: while a registration is active on another course the
 * request is refused. A finished or blocked course keeps its history, so the
 * same pair can never be entered again — but a different course still can.
 */
export function decideRegistration(input: {
  email: string;
  courseId: string;
  isTeacher: boolean;
  banned: boolean;
  rows: RegistrationRow[];
}): { ok: true; reentry?: boolean } | Refusal {
  if (!isEmail(input.email)) return refuse("invalid-email", "Перевірте адресу електронної пошти.");
  if (input.isTeacher) return { ok: true };
  if (input.banned) return bannedRefusal();
  if (!input.courseId) return refuse("invalid-email", "Оберіть курс.");

  const rows = input.rows;
  if (rows.some((r) => r.status === "blocked")) return bannedRefusal();

  const active = rows.find((r) => r.status === "active");
  // Already enrolled in THIS course: the visitor is not a new student, so
  // re-entry (new device, cleared cookie) must be possible instead of
  // "this course is already finished for you".
  if (active && active.course_id === input.courseId) return { ok: true, reentry: true };
  if (active && active.course_id !== input.courseId) return otherCourseRefusal();

  if (!active && rows.some((r) => r.course_id === input.courseId)) return endedRefusal();

  return { ok: true };
}

export type CodeRow = {
  code_hash: string;
  attempts: number;
  expires_at: string;
  used_at: string | null;
};

/**
 * Is a new code allowed right now?
 * Three codes per hour; after three failed attempts on the newest one a
 * ten-minute cooldown applies.
 */
export function decideNewCode(input: {
  recent: { attempts: number; created_at: string }[];
  now: number;
}): { ok: true } | Refusal {
  if (input.recent.length >= CODES_PER_HOUR) {
    return refuse(
      "cooldown",
      `Забагато спроб. Спробуйте за годину або напишіть на ${CONTACT_EMAIL}.`,
      60,
    );
  }
  const last = input.recent[0];
  if (last && last.attempts >= CODE_MAX_ATTEMPTS) {
    const waitMs = CODE_COOLDOWN_MS - (input.now - new Date(last.created_at).getTime());
    if (waitMs > 0) {
      const minutes = Math.ceil(waitMs / 60000);
      return refuse(
        "cooldown",
        `Забагато невдалих спроб. Новий код можна отримати за ${minutes} хв.`,
        minutes,
      );
    }
  }
  return { ok: true };
}

/**
 * Does the typed code match, and may it still be used?
 * `matched` is reported separately so the caller knows whether to bump the
 * attempt counter.
 */
export function decideCode(input: {
  row: CodeRow | null;
  matched: boolean;
  now: number;
}): { ok: true } | Refusal {
  const { row } = input;
  if (!row) return refuse("invalid-code", "Спочатку запросіть код.");
  if (row.used_at) return refuse("invalid-code", "Цей код уже використано. Запросіть новий.");
  if (new Date(row.expires_at).getTime() < input.now) {
    return refuse("invalid-code", "Код прострочений. Запросіть новий.");
  }
  if (row.attempts >= CODE_MAX_ATTEMPTS) {
    return refuse(
      "cooldown",
      `Забагато невдалих спроб. Спробуйте за 10 хв або напишіть на ${CONTACT_EMAIL}.`,
      10,
    );
  }
  if (!input.matched) {
    const left = CODE_MAX_ATTEMPTS - row.attempts - 1;
    return refuse(
      "invalid-code",
      left > 0
        ? `Невірний код. Залишилось спроб: ${left}.`
        : "Невірний код. Спроб більше немає — запросіть новий за 10 хв.",
    );
  }
  return { ok: true };
}
