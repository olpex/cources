import { describe, expect, test } from "bun:test";
import { externalCourseUrl, removeExternalCourse, showExternalCourses } from "./external-courses";

const course = { id: "one", title: "Курс", url: "https://example.org/course", description: "Огляд" };

describe("external course rules", () => {
  test("students cannot see an empty section", () => {
    expect(showExternalCourses([], false)).toBe(false);
  });
  test("one course makes the section visible", () => {
    expect(showExternalCourses([course], false)).toBe(true);
  });
  test("editing exposes the empty section for adding courses", () => {
    expect(showExternalCourses([], true)).toBe(true);
  });
  test("deleting the last course removes the student section", () => {
    const remaining = removeExternalCourse([course], "one");
    expect(remaining).toEqual([]);
    expect(showExternalCourses(remaining, false)).toBe(false);
  });
  test("unsafe links cannot be saved or opened", () => {
    expect(externalCourseUrl("javascript:alert(1)")).toBeNull();
    expect(externalCourseUrl("https://example.org/course")).toBe(course.url);
  });
});