import { useCallback, useEffect, useRef, useState } from "react";
import { courses as seedCourses, fetchNotes, type SlideNote } from "@/data/courses";
import { extractDocId, type ParsedDoc, type ParsedSlide } from "@/lib/gdocs-parse";
import { supabase } from "@/integrations/supabase/client";


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
  /** link to the PDF/Doc summary shown as "Конспект" */
  summaryUrl?: string;
  /** link to the self-check app shown as "Самоперевірка" */
  selfCheckUrl?: string;
  /** link to the Google Form shown as "Тест" */
  testUrl?: string;
  /** false = module is shown but locked for students */
  active?: boolean;
};

export type CourseItem = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  modules: ModuleItem[];
  /** false = course is visible but locked for students */
  active?: boolean;
  /** Google Doc this course was imported from */
  sourceDocId?: string;
  sourceDocUrl?: string;
};

const LEGACY_STORAGE_KEY = "lms-content-v1";
const ROW_ID = "main";

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

/** Content saved in this browser before the shared database existed. */
function legacyLocal(): CourseItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CourseItem[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchRemote(): Promise<CourseItem[] | null> {
  const { data, error } = await supabase
    .from("site_content")
    .select("data")
    .eq("id", ROW_ID)
    .maybeSingle();
  if (error || !data) return null;
  const parsed = data.data as unknown as CourseItem[];
  return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
}

async function saveRemote(courses: CourseItem[]) {
  const { error } = await supabase
    .from("site_content")
    .upsert({ id: ROW_ID, data: courses as never, updated_at: new Date().toISOString() });
  if (error) throw error;
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

function sameSlides(a: ParsedSlide[] | undefined, b: ParsedSlide[]) {
  return JSON.stringify(a ?? null) === JSON.stringify(b);
}

/** Merge a parsed Google Doc into an existing course (or build a new one), in place. */
function mergeDoc(course: CourseItem | null, doc: ParsedDoc, url: string): CourseItem {
  const base: CourseItem = course ?? {
    id: uid(),
    title: doc.title,
    subtitle: "",
    description: "",
    modules: [],
  };

  // Match existing modules by tab id first, then by title, then by presentation url.
  const pool = [...base.modules];
  const takeMatch = (m: { tabId: string; title: string; url: string }): ModuleItem | undefined => {
    const byId = pool.findIndex((x) => x.sourceTabId && x.sourceTabId === m.tabId);
    const idx =
      byId >= 0
        ? byId
        : pool.findIndex(
            (x) =>
              x.title.trim().toLowerCase() === m.title.trim().toLowerCase() ||
              (!!m.url && !!x.url && x.url === m.url),
          );
    if (idx < 0) return undefined;
    return pool.splice(idx, 1)[0];
  };

  const imported: ModuleItem[] = doc.modules.map((m) => {
    const prev = takeMatch(m);
    const extras = {
      ...(prev ? { active: prev.active } : {}),
      ...(m.summaryUrl ? { summaryUrl: m.summaryUrl } : {}),
      ...(m.selfCheckUrl ? { selfCheckUrl: m.selfCheckUrl } : {}),
      ...(m.testUrl ? { testUrl: m.testUrl } : {}),
    };
    if (!prev) {
      return {
        id: uid(),
        title: m.title,
        url: m.url,
        slides: m.slides.length,
        notesDoc: m.slides,
        sourceTabId: m.tabId,
        ...extras,
      };
    }
    const unchanged =
      prev.title === m.title &&
      prev.url === (m.url || prev.url) &&
      prev.sourceTabId === m.tabId &&
      (prev.summaryUrl ?? undefined) === m.summaryUrl &&
      (prev.selfCheckUrl ?? undefined) === m.selfCheckUrl &&
      (prev.testUrl ?? undefined) === m.testUrl &&
      sameSlides(prev.notesDoc, m.slides);
    if (unchanged) return prev;
    const { summaryUrl: _s, selfCheckUrl: _c, testUrl: _t, ...rest } = prev;
    return {
      ...rest,
      title: m.title,
      url: m.url || prev.url || "",
      slides: m.slides.length,
      notesDoc: m.slides,
      sourceTabId: m.tabId,
      ...extras,
    };
  });

  // Anything left in the pool that came from the doc was removed from the doc → drop it.
  // Manually added modules (no sourceTabId and no doc match) are kept.
  const manual = pool.filter((m) => !m.sourceTabId);

  const nextTitle = course && course.title !== doc.title ? doc.title : base.title;

  return {
    ...base,
    title: nextTitle,
    modules: [...imported, ...manual],
    sourceDocId: doc.docId,
    sourceDocUrl: url,
  };
}


/**
 * Shared content stored in Lovable Cloud so every device sees the same courses.
 * Only a signed-in teacher (`canEdit`) writes changes back.
 */
export function useContent(canEdit = false) {
  const [courses, setCourses] = useState<CourseItem[]>(seed);
  const [hydrated, setHydrated] = useState(false);
  const [remoteEmpty, setRemoteEmpty] = useState(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const dirty = useRef(false);
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;

  useEffect(() => {
    let active = true;
    void (async () => {
      const remote = await fetchRemote();
      if (!active) return;
      setCourses(remote ?? legacyLocal() ?? seed());
      setRemoteEmpty(!remote);
      setHydrated(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  // First teacher to sign in publishes the local content into the shared database.
  useEffect(() => {
    if (!hydrated || !remoteEmpty || !canEdit) return;
    setRemoteEmpty(false);
    saveRemote(courses).catch(() => setRemoteEmpty(true));
  }, [hydrated, remoteEmpty, canEdit, courses]);


  useEffect(() => {
    if (!hydrated || !dirty.current || !canEditRef.current) return;
    const t = window.setTimeout(() => {
      saveRemote(courses)
        .then(() => setStorageError(null))
        .catch(() =>
          setStorageError("Не вдалося зберегти зміни у спільній базі. Перевірте вхід і зв'язок."),
        );
    }, 600);
    return () => window.clearTimeout(t);
  }, [courses, hydrated]);

  const mutate = useCallback((fn: (prev: CourseItem[]) => CourseItem[]) => {
    dirty.current = true;
    setCourses(fn);
  }, []);


  const addCourse = useCallback(
    (data: Omit<CourseItem, "id" | "modules">) => {
      mutate((prev) => [...prev, { ...data, id: uid(), modules: [] }]);
    },
    [mutate],
  );

  const updateCourse = useCallback(
    (id: string, data: Partial<CourseItem>) => {
      mutate((prev) => prev.map((c) => (c.id === id ? { ...c, ...data } : c)));
    },
    [mutate],
  );

  const removeCourse = useCallback(
    (id: string) => {
      mutate((prev) => prev.filter((c) => c.id !== id));
    },
    [mutate],
  );

  const addModule = useCallback(
    (courseId: string, data: Omit<ModuleItem, "id">) => {
      mutate((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, modules: [...c.modules, { ...data, id: uid() }] } : c,
        ),
      );
    },
    [mutate],
  );

  const updateModule = useCallback(
    (courseId: string, moduleId: string, data: Partial<ModuleItem>) => {
      mutate((prev) =>
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
    [mutate],
  );

  const removeModule = useCallback(
    (courseId: string, moduleId: string) => {
      mutate((prev) =>
        prev.map((c) =>
          c.id === courseId ? { ...c, modules: c.modules.filter((m) => m.id !== moduleId) } : c,
        ),
      );
    },
    [mutate],
  );

  /** Move a course to the position of another course (drag & drop reordering). */
  const moveCourse = useCallback(
    (fromId: string, toId: string) => {
      if (fromId === toId) return;
      mutate((prev) => {
        const from = prev.findIndex((c) => c.id === fromId);
        const to = prev.findIndex((c) => c.id === toId);
        if (from < 0 || to < 0) return prev;
        const next = [...prev];
        const moved = next.splice(from, 1)[0];
        if (!moved) return prev;
        next.splice(to, 0, moved);
        return next;
      });
    },
    [mutate],
  );

  const closeAllModules = useCallback(
    (courseId: string) => {
      mutate((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, modules: c.modules.map((m) => ({ ...m, active: false })) }
            : c,
        ),
      );
    },
    [mutate],
  );

  /** Re-open every module of a course in one step. */
  const openAllModules = useCallback(
    (courseId: string) => {
      mutate((prev) =>
        prev.map((c) =>
          c.id === courseId
            ? { ...c, modules: c.modules.map((m) => ({ ...m, active: true })) }
            : c,
        ),
      );
    },
    [mutate],
  );

  /** Create a course from a Google Doc, or refresh an existing one. */
  const applyDoc = useCallback(
    (doc: ParsedDoc, url: string, courseId?: string) => {
      let resultId = courseId ?? "";
      mutate((prev) => {
        const target =
          prev.find((c) => c.id === courseId) ??
          prev.find((c) => c.sourceDocId && c.sourceDocId === doc.docId) ??
          prev.find((c) => c.sourceDocUrl && extractDocId(c.sourceDocUrl) === doc.docId) ??
          prev.find((c) => c.sourceDocUrl && extractDocId(c.sourceDocUrl) === extractDocId(url)) ??
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
    },
    [mutate],
  );

  const resetAll = useCallback(() => mutate(() => seed()), [mutate]);


  return {
    courses,
    hydrated,
    storageError,
    addCourse,
    updateCourse,
    removeCourse,
    moveCourse,
    addModule,
    updateModule,
    removeModule,
    closeAllModules,
    openAllModules,
    applyDoc,
    resetAll,
  };
}
