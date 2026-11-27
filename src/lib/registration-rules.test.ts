import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CODE_MAX_ATTEMPTS,
  CODE_TTL_MS,
  CONTACT_EMAIL,
  decideCode,
  decideNewCode,
  decideRegistration,
  isEmail,
  normalizeCode,
  normalizeEmail,
  type CodeRow,
} from "./registration-rules.ts";

const NOW = Date.UTC(2026, 10, 27, 10, 0, 0);
const iso = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();

const register = (over: Partial<Parameters<typeof decideRegistration>[0]> = {}) =>
  decideRegistration({
    email: "student@example.com",
    courseId: "ai",
    isTeacher: false,
    banned: false,
    rows: [],
    ...over,
  });

// ---------------------------------------------------------------- email

test("email is normalised and any domain is accepted", () => {
  assert.equal(normalizeEmail("  Student@Example.COM "), "student@example.com");
  assert.equal(isEmail("student@example.com"), true);
  assert.equal(isEmail("student@lnu.edu.ua"), true);
  assert.equal(isEmail("student@gmail.com"), true);
  assert.equal(isEmail("not-an-email"), false);
  assert.equal(isEmail("a@b"), false);
  assert.equal(isEmail(""), false);
});

test("code input keeps only digits", () => {
  assert.equal(normalizeCode(" 12 34-56 "), "123456");
  assert.equal(normalizeCode("12a34"), "1234");
});

// ------------------------------------------------------- one course rule

test("first registration on a free email is allowed", () => {
  assert.deepEqual(register(), { ok: true });
});

test("a second course is refused while the first is active", () => {
  const r = register({ courseId: "web", rows: [{ course_id: "ai", status: "active" }] });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "other-course");
  assert.match(r.ok === false ? r.message : "", /один курс/i);
});

test("re-entering the same active course is allowed (new device, cleared cookie)", () => {
  assert.deepEqual(register({ rows: [{ course_id: "ai", status: "active" }] }), {
    ok: true,
    reentry: true,
  });
});

test("after the teacher ends the course the same pair is refused forever", () => {
  const r = register({ rows: [{ course_id: "ai", status: "revoked" }] });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "ended");
});

test("after the course ends the same email may join a different course", () => {
  assert.deepEqual(register({ courseId: "web", rows: [{ course_id: "ai", status: "revoked" }] }), {
    ok: true,
  });
});

test("a manual block closes the email everywhere, on every course", () => {
  const blocked = { course_id: "ai", status: "blocked" };
  for (const courseId of ["ai", "web", "design"]) {
    const r = register({ courseId, rows: [blocked] });
    assert.equal(r.ok, false, courseId);
    assert.equal(r.ok === false && r.reason, "banned");
  }
});

test("a lifetime ban in forum_bans refuses the email even with no history", () => {
  const r = register({ banned: true });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "banned");
  assert.match(r.ok === false ? r.message : "", new RegExp(CONTACT_EMAIL.replace("+", "\\+")));
});

test("a blocked past course outweighs a revoked different course", () => {
  const r = register({
    courseId: "web",
    rows: [
      { course_id: "ai", status: "revoked" },
      { course_id: "design", status: "blocked" },
    ],
  });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "banned");
});

test("a course is required for students but not for the teacher", () => {
  const student = register({ courseId: "" });
  assert.equal(student.ok, false);
  assert.equal(student.ok === false && student.reason, "invalid-email");
  assert.deepEqual(register({ courseId: "", isTeacher: true }), { ok: true });
});

test("the teacher bypasses the one course rule", () => {
  assert.deepEqual(
    register({
      email: "olppara@gmail.com",
      courseId: "web",
      isTeacher: true,
      rows: [{ course_id: "ai", status: "active" }],
    }),
    { ok: true },
  );
});

test("an invalid email is refused before anything else", () => {
  const r = register({ email: "student", banned: true });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "invalid-email");
});

test("every refusal mentions the teacher address so the student can write", () => {
  const cases = [
    register({ rows: [{ course_id: "ai", status: "revoked" }] }),
    register({ courseId: "web", rows: [{ course_id: "ai", status: "active" }] }),
    register({ banned: true }),
  ];
  for (const r of cases) {
    assert.match(r.ok === false ? r.message : "", new RegExp(CONTACT_EMAIL.replace("+", "\\+")));
  }
});

// ---------------------------------------------------------- code issuing

test("three codes per hour, then a cooldown", () => {
  const one = { attempts: 0, created_at: iso(-1000) };
  assert.deepEqual(decideNewCode({ recent: [one], now: NOW }), { ok: true });
  assert.deepEqual(decideNewCode({ recent: [one, one], now: NOW }), { ok: true });
  const third = decideNewCode({ recent: [one, one, one], now: NOW });
  assert.equal(third.ok, false);
  assert.equal(third.ok === false && third.reason, "cooldown");
  assert.equal(third.ok === false && third.retryAfterMinutes, 60);
});

test("three failed attempts start a ten minute cooldown", () => {
  const spent = { attempts: CODE_MAX_ATTEMPTS, created_at: iso(-60_000) };
  const r = decideNewCode({ recent: [spent], now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.retryAfterMinutes, 9);

  const later = decideNewCode({ recent: [spent], now: NOW + 10 * 60_000 });
  assert.deepEqual(later, { ok: true });
});

test("two failed attempts do not block a new code", () => {
  assert.deepEqual(
    decideNewCode({ recent: [{ attempts: 2, created_at: iso(-60_000) }], now: NOW }),
    { ok: true },
  );
});

// ---------------------------------------------------------- code checking

const row = (over: Partial<CodeRow> = {}): CodeRow => ({
  code_hash: "hash",
  attempts: 0,
  expires_at: iso(CODE_TTL_MS),
  used_at: null,
  ...over,
});

test("a matching code inside the window is accepted", () => {
  assert.deepEqual(decideCode({ row: row(), matched: true, now: NOW }), { ok: true });
});

test("asking for a code without ever requesting one is refused", () => {
  const r = decideCode({ row: null, matched: false, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "invalid-code");
});

test("the code dies after fifteen minutes", () => {
  const expired = row({ expires_at: iso(-1000) });
  const r = decideCode({ row: expired, matched: true, now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.message : "", /прострочений/i);
});

test("a used code cannot be replayed", () => {
  const r = decideCode({ row: row({ used_at: iso(-500) }), matched: true, now: NOW });
  assert.equal(r.ok, false);
  assert.match(r.ok === false ? r.message : "", /уже використано/i);
});

test("a wrong code reports how many attempts are left", () => {
  const first = decideCode({ row: row(), matched: false, now: NOW });
  assert.match(first.ok === false ? first.message : "", /Залишилось спроб: 2/);

  const second = decideCode({ row: row({ attempts: 1 }), matched: false, now: NOW });
  assert.match(second.ok === false ? second.message : "", /Залишилось спроб: 1/);

  const third = decideCode({ row: row({ attempts: 2 }), matched: false, now: NOW });
  assert.match(third.ok === false ? third.message : "", /Спроб більше немає/);
});

test("after three failures even the right code is held back", () => {
  const r = decideCode({ row: row({ attempts: CODE_MAX_ATTEMPTS }), matched: true, now: NOW });
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "cooldown");
  assert.equal(r.ok === false && r.retryAfterMinutes, 10);
});
