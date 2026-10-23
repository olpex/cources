import { useId, useState } from "react";
import { ChevronDown, ExternalLink, GraduationCap, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogAction, AlertDialogCancel } from "@/components/ui/alert-dialog";
import { uid, type ExternalCourseItem } from "@/data/store";
import { externalCourseUrl, removeExternalCourse, showExternalCourses } from "@/lib/external-courses";

type Props = {
  courses: ExternalCourseItem[];
  edit: boolean;
  onChange: (courses: ExternalCourseItem[]) => void;
};

export function ExternalCourses({ courses, edit, onChange }: Props) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ExternalCourseItem | null>(null);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [description, setDescription] = useState("");
  const safeUrl = externalCourseUrl(url);

  if (!showExternalCourses(courses, edit)) return null;

  return (
    <section aria-label="Курси українською" className="mb-4 rounded-2xl border border-border bg-card shadow-soft">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={expanded}
        aria-controls={`${id}-list`}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <GraduationCap className="size-5 text-primary" />
          </span>
          <span className="min-w-0">
            <span className="block font-semibold">
              Курси українською <span className="text-muted-foreground">({courses.length})</span>
            </span>
            <span className="block text-sm text-muted-foreground">
              Україномовні курси інших освітніх платформ для поглиблення знань із цієї теми.
            </span>
          </span>
        </span>
        <ChevronDown className={`size-5 shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t border-border px-3 py-2">
          {courses.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Сторонні курси ще не додано.</p>
          )}
          <ul id={`${id}-list`} className="max-h-96 divide-y divide-border overflow-y-auto">
            {courses.map((course) => {
              const href = externalCourseUrl(course.url);
              return (
                <li key={course.id} className="flex items-start gap-3 rounded-lg px-2 py-3 hover:bg-secondary">
                  <div className="min-w-0 flex-1">
                    {href ? <Button asChild variant="link" className="h-auto max-w-full justify-start whitespace-normal p-0 text-left"><a href={href} target="_blank" rel="noopener noreferrer"><span className="break-words">{course.title}</span><ExternalLink /></a></Button> : <p className="font-medium">{course.title}</p>}
                    <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-muted-foreground">{course.description}</p>
                  </div>
                  {edit && <Button variant="ghost" size="icon" aria-label={`Видалити сторонній курс «${course.title}»`} title="Видалити сторонній курс" onClick={() => setRemoving(course)}><Trash2 className="text-destructive" /></Button>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {edit && (
        <div className="border-t border-border px-5 py-3">
          <Button size="sm" variant="outline" onClick={() => { setTitle(""); setUrl(""); setDescription(""); setAdding(true); }}><Plus />Додати сторонній курс</Button>
        </div>
      )}

      <Dialog open={adding && edit} onOpenChange={setAdding}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Додати сторонній курс</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={(event) => {
            event.preventDefault();
            if (!edit || !safeUrl || !title.trim() || !description.trim()) return;
            onChange([...courses, { id: uid(), title: title.trim(), url: safeUrl, description: description.trim() }]);
            setAdding(false); setExpanded(true);
          }}>
            <div className="space-y-2"><Label htmlFor={`${id}-title`}>Назва курсу</Label><Input id={`${id}-title`} value={title} onChange={(event) => setTitle(event.target.value)} required maxLength={200} /></div>
            <div className="space-y-2"><Label htmlFor={`${id}-url`}>Посилання на курс</Label><Input id={`${id}-url`} type="url" value={url} onChange={(event) => setUrl(event.target.value)} required aria-invalid={Boolean(url && !safeUrl)} placeholder="https://…" />{url && !safeUrl && <p className="text-sm text-destructive">Введіть повне посилання на вебсторінку курсу.</p>}</div>
            <div className="space-y-2"><Label htmlFor={`${id}-description`}>Стислий огляд змісту</Label><Textarea id={`${id}-description`} value={description} onChange={(event) => setDescription(event.target.value)} required rows={4} maxLength={600} /></div>
            <DialogFooter><Button type="button" variant="outline" onClick={() => setAdding(false)}>Скасувати</Button><Button type="submit" disabled={!safeUrl || !title.trim() || !description.trim()}>Додати курс</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={Boolean(removing) && edit} onOpenChange={(open) => { if (!open) setRemoving(null); }}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Видалити сторонній курс?</AlertDialogTitle><AlertDialogDescription>Курс «{removing?.title}» буде прибрано зі списку рекомендацій.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Скасувати</AlertDialogCancel><AlertDialogAction onClick={() => { if (edit && removing) onChange(removeExternalCourse(courses, removing.id)); setRemoving(null); }}>Видалити</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </section>
  );
}