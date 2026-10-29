import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { filterExcludedTests, normalizeResultEmail } from "./test-exclusions";

const rows = [
  ["Модуль 1", "29.10.2026 20:00", "12", "Інший студент", " Other@Example.com "],
  ["Модуль 1", "29.10.2026 20:01", "8", "Місцевий студент", "local@example.com"],
  ["Модуль 1", "29.10.2026 20:02", "9", "Без пошти"],
];
describe("test result exclusions", () => {
  test("email matching ignores case and surrounding whitespace", () => {
    assert.equal(normalizeResultEmail("  Other@Example.COM  "), "other@example.com");
    assert.deepEqual(filterExcludedTests(rows, [" OTHER@example.COM "]), rows.slice(1));
  });
  test("an empty list excludes nothing, including rows without email", () => {
    assert.deepEqual(filterExcludedTests(rows, []), rows);
    assert.deepEqual(filterExcludedTests(rows, ["  "]), rows);
  });
  test("every test attempt for the excluded email is removed before counting, notification or averaging", () => {
    const attempts = [...rows, ["Модуль 2", "29.10.2026 20:03", "1", "Інше ім'я", "other@example.com"]];
    const filtered = filterExcludedTests(attempts, ["other@example.com"]);
    assert.equal(filtered.length, 2);
    assert.equal(filtered.reduce((sum, row) => sum + Number(row[2]), 0) / filtered.length, 8.5);
    assert.equal(filtered.some((row) => row[1] === "29.10.2026 20:03"), false);
  });
  test("removing the exclusion restores rows without altering the shared source", () => {
    const copy = structuredClone(rows);
    assert.equal(filterExcludedTests(rows, ["other@example.com"]).length, 2);
    assert.deepEqual(filterExcludedTests(rows, []), copy);
    assert.deepEqual(rows, copy);
  });
});