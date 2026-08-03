import { useCallback, useEffect, useState } from "react";
import { courses as seedCourses, fetchNotes, type SlideNote } from "@/data/courses";
import type { ParsedDoc, ParsedSlide } from "@/lib/gdocs-parse";

export type ModuleItem = {
  id: string;
  title: string;
  url: string;
  slides?: number;
  /** id of a bundled notes JSON in /public/notes (read-only source) */
  builtinNotesId?: string;
  /** custom notes text; overrides builtin notes when present */
  notes?: string;
  /** structured notes imported from a Google Doc tab */
  notesDoc?: ParsedSlide[];
  /** Google Docs tab id this module was imported from */
  sourceTabId?: string;
};

export type CourseItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  modules: ModuleItem[];
  /** Google Doc this course was imported from */
  sourceDocId?: string;
  sourceDocUrl?: string;
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

export function docSlidesToText(slides: ParsedSlide[]): string {
  return slides
    .map((s) => {
      const body = s.blocks
        .map((b) => (b.type === "li" ? `${"  ".repeat(b.level ?? 0)}• ${b.text}` : b.text))
        .join("\n\n");
      return `${s.title}\n\n${body}`;
    })
    .join("\n\n———\n\n");
}

export async function builtinNotesText(id: string): Promise<string> {
  const data = await fetchNotes(id);
  return slidesToText(data.slides);
}

/** Merge a parsed Google Doc into an existing course (or build a new one). */
function mergeDoc(course: CourseItem | null, doc: ParsedDoc, url: string): CourseItem {
  const base: CourseItem = course ?? {
    id: uid(),
    title: doc.title,
    subtitle: "",
    description: "",
    modules: [],
  };

  const existing = new Map(base.modules.filter((m) => m.sourceTabId).map((m) => [m.sourceTabId!, m]));
  const imported: ModuleItem[] = doc.modules.map((m) => {
    const prev = existing.get(m.tabId);
    const next: ModuleItem = {
      id: prev?.id ?? uid(),
      title: m.title,
      url: m.url || prev?.url || "",
      slides: m.slides.length,
      notesDoc: m.slides,
      sourceTabId: m.tabId,
    };
    return next;
  });


  const manual = base.modules.filter((m) => !m.sourceTabId);
  return {
    ...base,
    modules: [...imported, ...manual],
    sourceDocId: doc.docId,
    sourceDocUrl: url,
  };
}

export function useContent() {
  const [courses, setCourses] = useState<CourseItem[]>(seed);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    setCourses(load());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(courses));
      setStorageError(null);
    } catch {
      setStorageError(
        "Забагато вмісту для збереження в браузері — останні зміни можуть не зберегтися після перезавантаження.",
      );
    }
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

  /** Create a course from a Google Doc, or refresh an existing one. */
  const applyDoc = useCallback((doc: ParsedDoc, url: string, courseId?: string) => {
    let resultId = courseId ?? "";
    setCourses((prev) => {
      const target =
        prev.find((c) => c.id === courseId) ??
        prev.find((c) => c.sourceDocId && c.sourceDocId === doc.docId) ??
        null;
      if (target) {
        resultId = target.id;
        return prev.map((c) => (c.id === target.id ? mergeDoc(c, doc, url) : c));
      }
      const created = mergeDoc(null, doc, url);
      resultId = created.id;
      return [...prev, created];
    });
    return resultId;
  }, []);

  const resetAll = useCallback(() => setCourses(seed()), []);

  return {
    courses,
    hydrated,
    storageError,
    addCourse,
    updateCourse,
    removeCourse,
    addModule,
    updateModule,
    removeModule,
    applyDoc,
    resetAll,
  };
}
