import { useEffect, useMemo, useState } from "react";
import { BookOpen, Loader2, ExternalLink, Pencil } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchNotes, type SlideNote } from "@/data/courses";
import type { ModuleItem } from "@/data/store";

type Props = {
  module: ModuleItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit?: (() => void) | undefined;
};

function parseNotesText(text: string): SlideNote[] {
  return text
    .split(/\n\s*—{2,}\s*\n|\n\s*-{3,}\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block, i) => {
      const lines = block.split("\n");
      const head = (lines[0] ?? "").trim();
      const rest = lines.slice(1).join("\n").trim();
      const paragraphs = (rest || head)
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .filter(Boolean);
      return {
        n: i + 1,
        kind: rest ? head : `Блок ${i + 1}`,
        paragraphs,
        sources: "",
      };
    });
}

export function NotesSheet({ module, open, onOpenChange, onEdit }: Props) {
  const [builtin, setBuiltin] = useState<SlideNote[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const custom = module?.notes;

  useEffect(() => {
    if (!open || !module) return;
    setQuery("");
    setError(null);
    setBuiltin(null);
    if (custom !== undefined || !module.builtinNotesId) return;

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
  }, [open, module, custom]);

  const all = useMemo<SlideNote[]>(() => {
    if (custom !== undefined) return parseNotesText(custom);
    return builtin ?? [];
  }, [custom, builtin]);

  const term = query.trim().toLowerCase();
  const slides = all.filter(
    (s) =>
      !term ||
      s.kind.toLowerCase().includes(term) ||
      String(s.n).includes(term) ||
      s.paragraphs.some((p) => p.toLowerCase().includes(term)),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-2xl">
        <SheetHeader className="border-b border-border bg-secondary/60 p-6">
          <SheetTitle className="pr-8 text-lg leading-snug">{module?.title}</SheetTitle>
          <SheetDescription>
            Нотатки викладача{all.length ? ` — ${all.length} блоків` : ""}
          </SheetDescription>
          <div className="mt-2 flex flex-wrap gap-2">
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
          </div>
        </SheetHeader>

        <div className="border-b border-border p-4">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Пошук у нотатках…"
            aria-label="Пошук у нотатках"
          />
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading && (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Завантаження нотаток…
            </div>
          )}
          {error && <p className="py-10 text-center text-destructive">{error}</p>}
          {!loading && !error && slides.length === 0 && (
            <p className="py-10 text-center text-muted-foreground">
              {all.length === 0 ? "Нотаток ще немає — додайте їх у режимі редагування." : "Нічого не знайдено."}
            </p>
          )}

          <Accordion type="multiple" className="space-y-2">
            {slides.map((slide) => (
              <AccordionItem
                key={slide.n}
                value={`s-${slide.n}`}
                className="overflow-hidden rounded-xl border border-border bg-card px-4"
              >
                <AccordionTrigger className="gap-3 text-left hover:no-underline">
                  <span className="flex items-center gap-3">
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-xs font-semibold text-primary-foreground">
                      {slide.n}
                    </span>
                    <span className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {slide.kind}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-3 pb-5 text-[0.95rem] leading-relaxed text-foreground/90">
                  {slide.paragraphs.map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                  {slide.sources && (
                    <p className="rounded-lg bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                      <BookOpen className="mr-1 inline size-3.5 align-[-2px]" />
                      Джерела: {slide.sources}
                    </p>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </SheetContent>
    </Sheet>
  );
}
