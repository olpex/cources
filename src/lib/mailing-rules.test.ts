import { test } from "node:test";
import assert from "node:assert/strict";
import { filterRecipients, mayReceiveCourseMail, type RegistrationFacts } from "./mailing-rules";

const facts = (over: Partial<RegistrationFacts> = {}): RegistrationFacts => ({
  email: "stud@x.com",
  activeCourseId: "ai",
  hasRegistration: true,
  ...over,
});

test("a student receives mail for their own course", () => {
  assert.equal(mayReceiveCourseMail(facts(), "ai", false), true);
});

test("a student receives nothing for another course", () => {
  assert.equal(mayReceiveCourseMail(facts(), "smm", false), false);
});

test("a closed registration receives nothing, not even its old course", () => {
  assert.equal(
    mayReceiveCourseMail(facts({ activeCourseId: null, hasRegistration: true }), "ai", false),
    false,
  );
});

test("an address that never registered keeps working (old Google flow)", () => {
  assert.equal(
    mayReceiveCourseMail(facts({ activeCourseId: null, hasRegistration: false }), "smm", false),
    true,
  );
});

test("the teacher is never filtered", () => {
  assert.equal(
    mayReceiveCourseMail(facts({ activeCourseId: null, hasRegistration: true }), "design", true),
    true,
  );
});

test("filterRecipients drops foreign subscribers but keeps the rest", () => {
  const map = new Map<string, RegistrationFacts>([
    ["ai@x.com", facts({ email: "ai@x.com", activeCourseId: "ai" })],
    ["smm@x.com", facts({ email: "smm@x.com", activeCourseId: "smm" })],
    ["old@x.com", facts({ email: "old@x.com", activeCourseId: null, hasRegistration: false })],
    ["closed@x.com", facts({ email: "closed@x.com", activeCourseId: null })],
  ]);
  const kept = filterRecipients(
    ["ai@x.com", "smm@x.com", "old@x.com", "closed@x.com"],
    map,
    "ai",
    false,
  );
  assert.deepEqual(kept, ["ai@x.com", "old@x.com"]);
});

test("addresses with no facts are dropped, so a failed lookup mails nobody", () => {
  assert.deepEqual(filterRecipients(["ghost@x.com"], new Map(), "ai", false), []);
});

test("matching ignores the case of the address", () => {
  const map = new Map<string, RegistrationFacts>([["stud@x.com", facts()]]);
  assert.deepEqual(filterRecipients(["STUD@X.com"], map, "ai", false), ["STUD@X.com"]);
});
