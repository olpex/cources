import { useCallback, useEffect, useState } from "react";
import { courses as seedCourses, fetchNotes, type SlideNote } from "@/data/courses";

export type ModuleItem = {
  id: string;
  title: string;
  url: string;
  slides?: number;
  /** id of a bundled notes JSON in /public/notes (read-only source) */
  builtinNotesId?: string;
  /** custom notes text; overrides builtin notes when present */
  notes?: string;
};

export type CourseItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  modules: ModuleItem[];
};

const STORAGE_KEY = "lms-content-v1";

export function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function seed(): CourseItem[] {
  return seedCourses.map((c) => ({
    id: c.slug,
    title: c.title,
    subtitle: c.subtitle,
    description: c.description,
    modules: c.presentations.map((p) => ({
      id: p.id,
      title: p.title,
      url: p.url,
      slides: p.slides,
      builtinNotesId: p.id,
    })),
  }));
}

function load(): CourseItem[] {
  if (typeof window === "undefined") return seed();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw) as CourseItem[];
    if (!Array.isArray(parsed) || parsed.length === 0) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

/** Serialise bundled slide notes into editable plain text. */
export function slidesToText(slides: SlideNote[]): string {
  return slides
    .map((s) => {
      const head = `Слайд ${s.n}${s.kind ? ` — ${s.kind}` : ""}`;
      const body = s.paragraphs.join("\n\n");
      const src = s.sources ? `\n\nДжерела: ${s.sources}` : "";
      return `${head}\n\n${body}${src}`;
    })
    .join("\n\n———\n\n");
}

export async function builtinNotesText(id: string): Promise<string> {
  const data = await fetchNotes(id);
  return slidesToText(data.slides);
}

export function useContent() {
  const [courses, setCourses] = useState<CourseItem[]>(seed);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setCourses(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
  }, [courses, hydrated]);

  const addCourse = useCallback((data: Omit<CourseItem, "id" | "modules">) => {
    setCourses((prev) => [...prev, { ...data, id: uid(), modules: [] }]);
  }, []);

  const updateCourse = useCallback((id: string, data: Partial<CourseItem>) => {
    setCourses((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
  }, []);

  const removeCourse = useCallback((id: string) => {
    setCourses((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const addModule = useCallback((courseId: string, data: Omit<ModuleItem, "id">) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId ? { ...c, modules: [...c.modules, { ...data, id: uid() }] } : c,
      ),
    );
  }, []);

  const updateModule = useCallback(
    (courseId: string, moduleId: string, data: Partial<ModuleItem>) => {
      setCourses((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? {
                ...c,
                modules: c.modules.map((m) => (m.id === moduleId ? { ...m, ...data } : m)),
              }
            : c,
        ),
      );
    },
    [],
  );

  const removeModule = useCallback((courseId: string, moduleId: string) => {
    setCourses((prev) =>
      prev.map((c) =>
        c.id === courseId ? { ...c, modules: c.modules.filter((m) => m.id !== moduleId) } : c,
      ),
    );
  }, []);

  const resetAll = useCallback(() => setCourses(seed()), []);

  return {
    courses,
    hydrated,
    addCourse,
    updateCourse,
    removeCourse,
    addModule,
    updateModule,
    removeModule,
    resetAll,
  };
}
