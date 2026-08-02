import { useState } from "react";
import { ExternalLink, FileText, Presentation, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NotesSheet } from "@/components/NotesSheet";
import { courses, type Course, type PresentationMeta } from "@/data/courses";

function CourseSection({
  course,
  index,
  onNotes,
}: {
  course: Course;
  index: number;
  onNotes: (p: PresentationMeta) => void;
}) {
  return (
    <section id={course.slug} className="scroll-mt-24 py-14">
      <div className="mb-8 max-w-3xl">
        <Badge variant="secondary" className="mb-3 font-medium">
          Курс {index + 1}
        </Badge>
        <h2 className="text-3xl font-semibold sm:text-4xl">{course.title}</h2>
        <p className="mt-2 text-lg text-primary/80">{course.subtitle}</p>
        <p className="mt-4 leading-relaxed text-muted-foreground">{course.description}</p>
      </div>

      {course.presentations.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
          <Sparkles className="mx-auto mb-3 size-6 text-highlight" />
          <p className="font-medium">Матеріали готуються</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Надішліть посилання на презентації цього курсу — вони зʼявляться тут разом із
            нотатками для викладача.
          </p>
        </div>
      ) : (
        <ol className="grid gap-4 md:grid-cols-2">
          {course.presentations.map((p, i) => (
            <li
              key={p.id}
              className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3 className="text-base font-semibold leading-snug">{p.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{p.slides} слайдів</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button asChild size="sm">
                  <a href={p.url} target="_blank" rel="noopener noreferrer">
                    <Presentation className="size-4" />
                    Показати презентацію
                    <ExternalLink className="size-3.5 opacity-70" />
                  </a>
                </Button>
                <Button size="sm" variant="outline" onClick={() => onNotes(p)}>
                  <FileText className="size-4" />
                  Нотатки
                </Button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function CoursesLanding() {
  const [active, setActive] = useState<PresentationMeta | null>(null);
  const [open, setOpen] = useState(false);

  const total = courses.reduce((n, c) => n + c.presentations.length, 0);

  return (
    <main className="min-h-screen">
      <header className="surface-grid border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/70">
            Навчальна платформа для викладача
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] sm:text-6xl">
            Презентації та нотатки для аудиторних занять
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Один клік — і презентація відкривається для показу на екрані. Нотатки до кожного
            слайда відкриваються тут же, у бічній панелі, без переходу в Google Документи.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {courses.map((c) => (
              <Button key={c.slug} asChild variant={c.slug === "digital" ? "default" : "outline"}>
                <a href={`#${c.slug}`}>{c.title}</a>
              </Button>
            ))}
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Наразі доступно {total} презентацій із повними нотатками викладача.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl divide-y divide-border px-6">
        {courses.map((course, i) => (
          <CourseSection
            key={course.slug}
            course={course}
            index={i}
            onNotes={(p) => {
              setActive(p);
              setOpen(true);
            }}
          />
        ))}
      </div>

      <footer className="border-t border-border py-10">
        <p className="mx-auto max-w-6xl px-6 text-sm text-muted-foreground">
          Матеріали курсів «Цифровий світ для початківців» та «Штучний інтелект».
        </p>
      </footer>

      <NotesSheet presentation={active} open={open} onOpenChange={setOpen} />
    </main>
  );
}
