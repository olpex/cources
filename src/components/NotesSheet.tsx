import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, Loader2, ExternalLink, Pencil } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { fetchNotes, type SlideNote } from "@/data/courses";
import type { NoteBlock } from "@/lib/gdocs-parse";
import type { ModuleItem } from "@/data/store";

const FONTS = [
  { label: "Verdana", value: "Verdana, Geneva, sans-serif" },
  { label: "Roboto", value: '"Roboto", sans-serif' },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Calibri", value: "Calibri, Candara, Segoe UI, sans-serif" },
  { label: "Open Sans", value: '"Open Sans", sans-serif' },
  { label: "Tahoma", value: "Tahoma, Geneva, sans-serif" },
];
const SIZES = [12, 13, 14, 15, 16];
const LINE_HEIGHTS = [1, 1.15, 1.5, 2];

type Prefs = { font: string; size: number; lh: number };
const PREFS_KEY = "notes-typography";
const DEFAULT_PREFS: Prefs = { font: FONTS[0]!.value, size: 14, lh: 1.5 };

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) } : DEFAULT_PREFS;
  } catch {
    return DEFAULT_PREFS;
  }
}


type Props = {
  module: ModuleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (() => void) | undefined;
};

type Slide = { n: number; title: string; blocks: NoteBlock[]; sources?: string };

function textToBlocks(text: string): NoteBlock[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => {
      const bullet = p.match(/^\s*([•\-*–]|\d+[.)])\s+(.*)$/s);
      if (bullet) return { type: "li", text: bullet[2]!.trim(), level: 0 } as NoteBlock;
      return { type: "p", text: p } as NoteBlock;
    });
}

function parseNotesText(text: string): Slide[] {
  return text
    .split(/\n\s*—{2,}\s*\n|\n\s*-{3,}\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => {
      const lines = block.split("\n");
      const head = (lines[0] ?? "").trim();
      const rest = lines.slice(1).join("\n").trim();
      return {
        n: i + 1,
        title: rest ? head : `Блок ${i + 1}`,
        blocks: textToBlocks(rest || head),
      };
    });
}

function builtinToSlides(slides: SlideNote[]): Slide[] {
  return slides.map((s) => ({
    n: s.n,
    title: s.kind ? `Слайд ${s.n} — ${s.kind}` : `Слайд ${s.n}`,
    blocks: s.paragraphs.flatMap((p) => textToBlocks(p)),
    sources: s.sources,
  }));
}

function BlockView({ block }: { block: NoteBlock }) {
  const indent = { marginInlineStart: `${(block.level ?? 0) * 1.25}rem` };
  if (block.type === "h") {
    return (
      <h4 style={indent} className="mt-6 text-lg font-semibold leading-snug">
        {block.text}
      </h4>
    );
  }
  if (block.type === "li") {
    return (
      <li style={indent} className="ml-5 list-disc leading-relaxed marker:text-primary">
        {block.text}
      </li>
    );
  }
  return (
    <p style={indent} className="leading-[1.75]">
      {block.text}
    </p>
  );
}

export function NotesSheet({ module, open, onOpenChange, onEdit }: Props) {
  const [builtin, setBuiltin] = useState<SlideNote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const custom = module?.notes;
  const doc = module?.notesDoc;

  useEffect(() => {
    if (!open || !module) return;
    setQuery("");
    setError(null);
    setBuiltin(null);
    if (doc?.length || custom !== undefined || !module.builtinNotesId) return;

    let cancelled = false;
    setLoading(true);
    fetchNotes(module.builtinNotesId)
      .then((data) => {
        if (!cancelled) setBuiltin(data.slides);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, module, custom, doc]);

  const all = useMemo<Slide[]>(() => {
    if (doc?.length) return doc.map((s, i) => ({ n: i + 1, title: s.title, blocks: s.blocks }));
    if (custom !== undefined) return parseNotesText(custom);
    return builtin ? builtinToSlides(builtin) : [];
  }, [doc, custom, builtin]);

  const term = query.trim().toLowerCase();
  const slides = all.filter(
    (s) =>
      !term ||
      s.title.toLowerCase().includes(term) ||
      String(s.n).includes(term) ||
      s.blocks.some((b) => b.text.toLowerCase().includes(term)),
  );

  const goTo = (n: number) => {
    const el = scrollRef.current?.querySelector(`#slide-${n}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        className="flex h-svh w-screen max-w-none flex-col gap-0 p-0 sm:max-w-none"
      >
        <div className="border-b border-border bg-secondary/60 px-6 py-4">
          <SheetTitle className="pr-10 text-xl leading-snug">{module?.title}</SheetTitle>
          <SheetDescription>
            Нотатки викладача{all.length ? ` — ${all.length} слайдів` : ""}
          </SheetDescription>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {module?.url && (
              <Button asChild size="sm" variant="outline">
                <a href={module.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="size-4" />
                  Відкрити презентацію
                </a>
              </Button>
            )}
            {onEdit && (
              <Button size="sm" variant="outline" onClick={onEdit}>
                <Pencil className="size-4" />
                Редагувати нотатки
              </Button>
            )}
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Пошук у нотатках…"
              aria-label="Пошук у нотатках"
              className="h-9 w-full sm:w-72"
            />
          </div>
        </div>

        <div className="flex min-h-0 flex-1">
          <nav className="hidden w-72 shrink-0 overflow-y-auto border-r border-border bg-card/40 p-3 lg:block">
            <ol className="space-y-1">
              {slides.map((s) => (
                <li key={s.n}>
                  <button
                    type="button"
                    onClick={() => goTo(s.n)}
                    className="w-full rounded-lg px-3 py-2 text-left text-sm leading-snug text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-8">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Завантаження нотаток…
              </div>
            )}
            {error && <p className="py-10 text-center text-destructive">{error}</p>}
            {!loading && !error && slides.length === 0 && (
              <p className="py-10 text-center text-muted-foreground">
                {all.length === 0
                  ? "Нотаток ще немає — додайте їх у режимі редагування."
                  : "Нічого не знайдено."}
              </p>
            )}

            <article className="mx-auto max-w-3xl space-y-10 text-[1.05rem] text-foreground/90">
              {slides.map((slide) => (
                <section key={slide.n} id={`slide-${slide.n}`} className="scroll-mt-6">
                  <h3 className="mb-4 flex items-start gap-3 text-xl font-semibold leading-snug text-foreground">
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                      {slide.n}
                    </span>
                    {slide.title}
                  </h3>
                  <div className="space-y-4 [&_li+li]:mt-1">
                    {slide.blocks.map((b, i) => (
                      <BlockView key={i} block={b} />
                    ))}
                  </div>
                  {slide.sources && (
                    <p className="mt-4 rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                      <BookOpen className="mr-1 inline size-3.5 align-[-2px]" />
                      Джерела: {slide.sources}
                    </p>
                  )}
                </section>
              ))}
            </article>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
