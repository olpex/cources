import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { externalCourseUrl, removeExternalCourse, showExternalCourses } from "./external-courses";

const course = { id: "one", title: "Курс", url: "https://example.org/course", description: "Огляд" };

describe("external course rules", () => {
  test("students cannot see an empty section", () => {
    assert.equal(showExternalCourses([], false), false);
  });
  test("one course makes the section visible", () => {
    assert.equal(showExternalCourses([course], false), true);
  });
  test("editing exposes the empty section for adding courses", () => {
    assert.equal(showExternalCourses([], true), true);
  });
  test("deleting the last course removes the student section", () => {
    const remaining = removeExternalCourse([course], "one");
    assert.deepEqual(remaining, []);
    assert.equal(showExternalCourses(remaining, false), false);
  });
  test("unsafe links cannot be saved or opened", () => {
    assert.equal(externalCourseUrl("javascript:alert(1)"), null);
    assert.equal(externalCourseUrl("https://example.org/course"), course.url);
  });
});