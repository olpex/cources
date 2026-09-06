import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import {
  ExternalLink,
  FileText,
  FileUp,
  Link2,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  Plus,
  Presentation,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { importGoogleDoc } from "@/lib/gdocs.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { NotesSheet } from "@/components/NotesSheet";
import { CourseDialog } from "@/components/CourseDialog";
import { PresentationViewer } from "@/components/PresentationViewer";

import { ModuleDialog } from "@/components/ModuleDialog";
import { ImportDocDialog } from "@/components/ImportDocDialog";
import { useContent, type CourseItem, type ModuleItem } from "@/data/store";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

type Confirm = { title: string; description: string; action: () => void } | null;

export function CoursesLanding() {
  const { user, isTeacher } = useAuth();
  
  const {
    courses,
    storageError,
    addCourse,
    updateCourse,
    removeCourse,
    addModule,
    updateModule,
    removeModule,
    applyDoc,
    resetAll,
  } = useContent(isTeacher);

  const [editMode, setEditMode] = useState(false);
  const edit = editMode && isTeacher;


  const [notesFor, setNotesFor] = useState<{ course: CourseItem; module: ModuleItem } | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  const [courseDialog, setCourseDialog] = useState<{ course: CourseItem | null } | null>(null);
  const [importDialog, setImportDialog] = useState<{ course: CourseItem | null } | null>(null);
  const [moduleDialog, setModuleDialog] = useState<{
    courseId: string;
    module: ModuleItem | null;
  } | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [viewer, setViewer] = useState<{ title: string; url: string } | null>(null);


  const runImport = useServerFn(importGoogleDoc);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<{ id: string; message: string } | null>(null);

  const syncCourse = async (course: CourseItem) => {
    if (!course.sourceDocUrl) return;
    setSyncingId(course.id);
    setSyncError(null);
    try {
      const doc = await runImport({ data: { url: course.sourceDocUrl } });
      applyDoc(doc, course.sourceDocUrl, course.id);
    } catch (e) {
      setSyncError({
        id: course.id,
        message: e instanceof Error ? e.message : "Не вдалося оновити курс",
      });
    } finally {
      setSyncingId(null);
    }
  };

  const total = courses.reduce((n, c) => n + c.modules.length, 0);




  return (
    <main className="min-h-screen">
      <header className="surface-grid border-b border-border">
        <div className="mx-auto max-w-6xl px-6 py-20 sm:py-28">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-primary/70">
              Навчальна платформа для викладача
            </p>
            <div className="flex flex-wrap items-center gap-3">
              {isTeacher && (
                <div className="flex items-center gap-3 rounded-full border border-border bg-card px-4 py-2">
                  <Switch id="edit-mode" checked={editMode} onCheckedChange={setEditMode} />
                  <Label htmlFor="edit-mode" className="cursor-pointer text-sm">
                    Режим редагування
                  </Label>
                </div>
              )}
              {user ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setEditMode(false);
                  }}
                >
                  <LogOut className="size-4" />
                  Вийти
                </Button>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to="/auth">
                    <LogIn className="size-4" />
                    Вхід для викладача
                  </Link>
                </Button>
              )}
            </div>

          </div>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-[1.1] sm:text-6xl">
            Презентації та нотатки для аудиторних занять
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Один клік — і презентація відкривається для показу на екрані. Нотатки до кожного
            слайда відкриваються тут же, у бічній панелі, без переходу в Google Документи.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {courses.map((c, i) => (
              <Button key={c.id} asChild variant={i === 0 ? "default" : "outline"}>
                <a href={`#c-${c.id}`}>{c.title}</a>
              </Button>
            ))}
            {edit && (
              <>
                <Button variant="secondary" onClick={() => setCourseDialog({ course: null })}>
                  <Plus className="size-4" />
                  Додати курс
                </Button>
                <Button variant="secondary" onClick={() => setImportDialog({ course: null })}>
                  <FileUp className="size-4" />
                  Імпорт із Google Документа
                </Button>
              </>
            )}
          </div>
          {storageError && <p className="mt-4 text-sm text-destructive">{storageError}</p>}

          <p className="mt-6 text-sm text-muted-foreground">
            Наразі доступно {total} модулів із нотатками викладача.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl divide-y divide-border px-6">
        {courses.map((course, index) => (
          <section key={course.id} id={`c-${course.id}`} className="scroll-mt-24 py-14">
            <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
              <div className="max-w-3xl">
                <Badge variant="secondary" className="mb-3 font-medium">
                  Курс {index + 1}
                </Badge>
                <h2 className="text-3xl font-semibold sm:text-4xl">{course.title}</h2>
                {course.subtitle && (
                  <p className="mt-2 text-lg text-primary/80">{course.subtitle}</p>
                )}
                {course.description && (
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    {course.description}
                  </p>
                )}
              </div>
              {edit && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      course.sourceDocUrl
                        ? void syncCourse(course)
                        : setImportDialog({ course })
                    }
                    disabled={syncingId === course.id}
                    title={
                      course.sourceDocUrl
                        ? "Оновити дані з прив’язаного Google Документа"
                        : "Спочатку прив’яжіть Google Документ"
                    }
                  >
                    {syncingId === course.id ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <RefreshCw className="size-4" />
                    )}
                    Оновити
                  </Button>

                  <Button size="sm" variant="outline" onClick={() => setImportDialog({ course })}>
                    <Link2 className="size-4" />
                    Прив’язати документ
                  </Button>
                  <Button

                    size="sm"
                    variant="outline"
                    onClick={() => setCourseDialog({ course })}
                    aria-label="Редагувати курс"
                  >
                    <Pencil className="size-4" />
                    Курс
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label="Видалити курс"
                    onClick={() =>
                      setConfirm({
                        title: "Видалити курс?",
                        description: `Курс «${course.title}» і всі його модулі буде видалено.`,
                        action: () => removeCourse(course.id),
                      })
                    }
                  >
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </div>
              )}
            </div>
            {edit && syncError?.id === course.id && (
              <p className="-mt-4 mb-6 text-sm text-destructive">{syncError.message}</p>
            )}


            {course.modules.length === 0 && !edit ? (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
                <Sparkles className="mx-auto mb-3 size-6 text-highlight" />
                <p className="font-medium">Матеріали готуються</p>
                <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                  Увімкніть режим редагування, щоб додати презентації та нотатки.
                </p>
              </div>
            ) : (
              <ol className="grid gap-4 md:grid-cols-2">
                {course.modules.map((m, i) => (
                  <li
                    key={m.id}
                    className="group flex flex-col rounded-2xl border border-border bg-card p-6 shadow-soft transition-shadow hover:shadow-lift"
                  >
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-semibold text-secondary-foreground">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <h3 className="text-base font-semibold leading-snug">{m.title}</h3>
                        {m.slides ? (
                          <p className="mt-1 text-sm text-muted-foreground">{m.slides} слайдів</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      {m.url &&
                        (isTeacher ? (
                          <Button asChild size="sm">
                            <a href={m.url} target="_blank" rel="noopener noreferrer">
                              <Presentation className="size-4" />
                              Показати презентацію
                              <ExternalLink className="size-3.5 opacity-70" />
                            </a>
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            onClick={() => setViewer({ title: m.title, url: m.url })}
                          >
                            <Presentation className="size-4" />
                            Показати презентацію
                          </Button>
                        ))}

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setNotesFor({ course, module: m });
                          setNotesOpen(true);
                        }}
                      >
                        <FileText className="size-4" />
                        Нотатки
                      </Button>
                      {edit && (
                        <>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Редагувати модуль"
                            onClick={() => setModuleDialog({ courseId: course.id, module: m })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label="Видалити модуль"
                            onClick={() =>
                              setConfirm({
                                title: "Видалити модуль?",
                                description: `Модуль «${m.title}» буде видалено з курсу.`,
                                action: () => removeModule(course.id, m.id),
                              })
                            }
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}

                {edit && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setModuleDialog({ courseId: course.id, module: null })}
                      className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-border bg-card/40 p-6 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <Plus className="size-5" />
                      <span className="text-sm font-medium">Додати модуль</span>
                    </button>
                  </li>
                )}
              </ol>
            )}
          </section>
        ))}
      </div>

      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6">
          <p className="text-sm text-muted-foreground">
            Матеріали зберігаються у спільній базі — однакові на всіх комп'ютерах.
          </p>
          {edit && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setConfirm({
                  title: "Скинути до початкового вмісту?",
                  description: "Усі ваші зміни буде втрачено.",
                  action: resetAll,
                })
              }
            >
              <RotateCcw className="size-4" />
              Скинути зміни
            </Button>
          )}
        </div>
      </footer>

      <NotesSheet
        module={notesFor?.module ?? null}
        open={notesOpen}
        onOpenChange={setNotesOpen}
        onEdit={
          isTeacher && notesFor
            ? () => {
                setModuleDialog({ courseId: notesFor.course.id, module: notesFor.module });
                setNotesOpen(false);
              }
            : undefined
        }
      />

      <CourseDialog
        open={courseDialog !== null}
        onOpenChange={(o) => !o && setCourseDialog(null)}
        course={courseDialog?.course ?? null}
        onSave={(data) => {
          if (courseDialog?.course) updateCourse(courseDialog.course.id, data);
          else addCourse(data);
        }}
      />

      <ImportDocDialog
        open={importDialog !== null}
        onOpenChange={(o) => !o && setImportDialog(null)}
        courseId={importDialog?.course?.id}
        defaultUrl={importDialog?.course?.sourceDocUrl}
        onImported={(doc, url, courseId) => applyDoc(doc, url, courseId)}
      />



      <ModuleDialog
        open={moduleDialog !== null}
        onOpenChange={(o) => !o && setModuleDialog(null)}
        module={moduleDialog?.module ?? null}
        onSave={(data) => {
          if (!moduleDialog) return;
          if (moduleDialog.module) {
            updateModule(moduleDialog.courseId, moduleDialog.module.id, data);
            setNotesFor((prev) =>
              prev && prev.module.id === moduleDialog.module?.id
                ? { ...prev, module: { ...prev.module, ...data } }
                : prev,
            );
          } else {
            addModule(moduleDialog.courseId, data);
          }
        }}
      />

      <AlertDialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirm?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                confirm?.action();
                setConfirm(null);
              }}
            >
              Підтвердити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
