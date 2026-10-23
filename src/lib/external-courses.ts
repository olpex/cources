import type { ExternalCourseItem } from "@/data/store";

export function showExternalCourses(courses: ExternalCourseItem[], edit: boolean) {
  return edit || courses.length > 0;
}

export function externalCourseUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

export function removeExternalCourse(courses: ExternalCourseItem[], id: string) {
  return courses.filter((course) => course.id !== id);
}