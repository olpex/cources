import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, ChevronRight, FileText, Hammer, Loader2, Paperclip, Trash2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { fetchCourseSummary, type SummaryRow } from "@/lib/results.functions";
import { gradePractical, submitPractical, type PracticalFile } from "@/lib/practical.functions";
import { formatPracticalTask } from "@/lib/practical-format";

const BUCKET = "practical-files";
const MAX_FILES = 5;
const MAX_SIZE = 50 * 1024 * 1024;
const ACCEPT = "image/*,audio/*,video/*,.pdf,application/pdf,.doc,.docx,.xls,.xlsx,.accdb,.mdb";

type Own = { id: string; ai_score: number | null; teacher_score: number | null; feedback: string | null; created_at: string; status: string };

/** Renders text with clickable links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s)]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-primary underline">
            {p}
          </a>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function PracticalButton(props: { courseId: string; moduleId: string; practicalId?: string; title: string; task: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="task" onClick={() => setOpen(true)}>
        <Hammer className="size-4" />
        {props.practicalId ? props.title : "Практична робота"}
      </Button>
      {open && <PracticalDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function PracticalDialog({ courseId, moduleId, practicalId, title, task, onClose }: { courseId: string; moduleId: string; practicalId?: string; title: string; task: string; onClose: () => void }) {
  const taskId = practicalId ?? moduleId;
  const { user, loading } = useAuth();
  const submit = useServerFn(submitPractical);
  const [answer, setAnswer] = useState("");
  const [links, setLinks] = useState("");
  const [fullName, setFullName] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Own | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (receipt) receiptRef.current?.scrollIntoView({ block: "nearest" });
  }, [receipt]);

  const loadOwn = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("practical_submissions")
      .select("id, ai_score, teacher_score, feedback, created_at, status")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .eq("module_id", taskId)
      .order("created_at", { ascending: false })
      .limit(1);
    setLast((data?.[0] as Own) ?? null);
  }, [user, courseId, taskId]);

  useEffect(() => {
    void loadOwn();
  }, [loadOwn]);

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      if (f.size > MAX_SIZE) {
        toast.error(`«${f.name}» більший за 50 МБ`);
        continue;
      }
      if (next.length >= MAX_FILES) {
        toast.error(`Не більше ${MAX_FILES} файлів`);
        break;
      }
      next.push(f);
    }
    setFiles(next);
  };

  const send = async () => {
    if (!user) return;
    if (fullName.trim().split(/\s+/).length < 2) {
      toast.error("Вкажіть прізвище та ім'я");
      return;
    }
    setBusy(true);
    setReceipt(null);
    try {
      const uploaded: PracticalFile[] = [];
      for (const f of files) {
        const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${user.id}/${courseId}/${taskId}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, f.type ? { contentType: f.type } : {});
        if (error) throw new Error(`Не вдалося завантажити «${f.name}»`);
        uploaded.push({ path, name: f.name, type: f.type, size: f.size });
      }
      const r = await submit({ data: { courseId, moduleId, studentName: fullName, ...(practicalId ? { practicalId } : {}), answer, links, files: uploaded } });
      window.dispatchEvent(new Event("practical-results-changed"));
      toast.success(r.score ? `Оцінка: ${r.score} з 12` : "Роботу надіслано викладачу на перевірку");
      setReceipt(r.manual
        ? "Роботу надіслано на перевірку викладачем. Очікуйте на результат на Вашу електронну пошту й на його відображення у секції «Результати практичних робіт»."
        : `Роботу перевірено. Оцінка: ${r.score} з 12. Результат доступний у секції «Результати практичних робіт»; повідомлення з оцінкою надсилається на Вашу електронну пошту.`);
      setAnswer("");
      setLinks("");
      setFiles([]);
      await loadOwn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  };

  const score = last ? (last.teacher_score ?? last.ai_score) : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-bold">{practicalId ? title : `Практична робота — ${title}`}</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-line rounded-xl bg-secondary p-4 text-sm">
          {formatPracticalTask(task).split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
            part.startsWith("**") && part.endsWith("**") ? (
              <strong key={i} className="font-bold"><Linkified text={part.slice(2, -2)} /></strong>
            ) : <Linkified key={i} text={part} />,
          )}
        </div>

        {last && (
          <div className="rounded-xl border border-border p-4 text-sm">
            <p className="font-semibold">
              Ваша остання оцінка: {score !== null ? `${score} з 12` : "очікує перевірки викладачем"}
            </p>
            {last.feedback && <p className="mt-2 whitespace-pre-line text-muted-foreground">{last.feedback}</p>}
            <p className="mt-2 text-xs text-muted-foreground">Можна надіслати роботу повторно — зараховується остання.</p>
          </div>
        )}

        {loading ? null : !user ? (
          <div className="space-y-3 text-sm">
            <p>Щоб здати роботу, увійдіть через Google.</p>
            <Button onClick={() => lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })}>
              Увійти через Google
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-sm">
              <label className="mb-1 block text-muted-foreground">Прізвище та ім'я (так само, як у тестах)</label>
              <Input value={fullName} maxLength={120} placeholder="Прізвище Ім'я" onChange={(e) => setFullName(e.target.value)} />
            </div>
            <Textarea rows={6} placeholder="Ваша відповідь або коментар (необов'язково)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <Textarea
              rows={2}
              placeholder="Загальнодоступні посилання на чат, Suno, відео тощо — кожне з нового рядка"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
            <div className="text-sm">
              <label className="mb-1 block text-muted-foreground">
                Файли: скріншоти, Word, Excel, Access, аудіо, відео
              </label>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="sr-only"
                onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
              />
              <div className="flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed border-primary/50 bg-secondary p-3">
                <Button type="button" onClick={() => fileRef.current?.click()}>
                  <Paperclip className="size-4" />
                  Прикріпити файли
                </Button>
                <span className="text-xs text-muted-foreground">
                  {files.length > 0
                    ? `Вибрано файлів: ${files.length} з ${MAX_FILES}`
                    : `до ${MAX_FILES} файлів, кожен до 50 МБ`}
                </span>
              </div>
              {files.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {files.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-1">
                      <FileText className="size-4 shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{f.name}</span>
                      <button aria-label="Прибрати" onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                        <X className="size-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Текст, скріншоти, Word, Excel і PDF перевіряються автоматично. Посилання на чати з ШІ-асистентами система спробує відкрити й оцінити сама; якщо не вдасться, а також для музики, відео, аудіо чи Access — роботу оцінить викладач. Посилання мають бути відкриті для всіх.
            </p>
            {receipt && (
              <div ref={receiptRef} role="status" aria-live="polite" className="flex items-start gap-3 rounded-lg border border-task bg-secondary p-4 text-sm">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-task" />
                <p>{receipt}</p>
              </div>
            )}
            <Button onClick={() => void send()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Надсилаємо…" : "Надіслати на перевірку"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Score = { id: string; module_id: string; module_title: string; student_name: string; score: number | null; created_at: string };
type Full = {
  id: string;
  module_title: string;
  student_name: string;
  email: string;
  answer: string;
  links: string;
  files: PracticalFile[];
  ai_score: number | null;
  teacher_score: number | null;
  feedback: string | null;
  status: string;
  created_at: string;
};

function ReviewDialog({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const grade = useServerFn(gradePractical);
  const [row, setRow] = useState<Full | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [score, setScore] = useState("");
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.from("practical_submissions").select("*").eq("id", id).maybeSingle();
      if (!data) return;
      const r = data as unknown as Full;
      setRow(r);
      setScore(String(r.teacher_score ?? r.ai_score ?? ""));
      setFeedback(r.feedback ?? "");
      const map: Record<string, string> = {};
      for (const f of r.files ?? []) {
        const { data: s } = await supabase.storage.from(BUCKET).createSignedUrl(f.path, 3600);
        if (s?.signedUrl) map[f.path] = s.signedUrl;
      }
      setUrls(map);
    })();
  }, [id]);

  const save = async () => {
    setBusy(true);
    try {
      await grade({ data: { id, score: Number(score), feedback, notify: true } });
      toast.success("Оцінку збережено й надіслано студенту");
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Помилка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{row ? `${row.student_name} — ${row.module_title}` : "Завантаження…"}</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4 text-sm">
            <p className="text-muted-foreground">
              {row.email} · {new Date(row.created_at).toLocaleString("uk-UA")}
              {row.ai_score !== null && ` · оцінка ШІ: ${row.ai_score}/12`}
            </p>
            {row.answer && (
              <div>
                <p className="mb-1 font-semibold">Відповідь</p>
                <div className="whitespace-pre-line rounded-xl bg-secondary p-3"><Linkified text={row.answer} /></div>
              </div>
            )}
            {row.links && (
              <div>
                <p className="mb-1 font-semibold">Посилання</p>
                <div className="whitespace-pre-line rounded-xl bg-secondary p-3"><Linkified text={row.links} /></div>
              </div>
            )}
            {row.files?.length > 0 && (
              <div className="space-y-2">
                <p className="font-semibold">Файли</p>
                {row.files.map((f) => {
                  const u = urls[f.path];
                  return (
                    <div key={f.path} className="rounded-xl bg-secondary p-3">
                      {u && f.type.startsWith("image/") && <img src={u} alt={f.name} className="mb-2 max-h-80 rounded-lg" />}
                      {u && f.type.startsWith("audio/") && <audio controls src={u} className="mb-2 w-full" />}
                      {u && f.type.startsWith("video/") && <video controls src={u} className="mb-2 max-h-80 w-full rounded-lg" />}
                      {u ? (
                        <a href={u} target="_blank" rel="noreferrer" className="text-primary underline">
                          Завантажити «{f.name}»
                        </a>
                      ) : (
                        <span>{f.name}</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <div className="space-y-2 border-t border-border pt-4">
              <Input type="number" min={1} max={12} placeholder="Оцінка 1–12" value={score} onChange={(e) => setScore(e.target.value)} />
              <Textarea rows={4} placeholder="Коментар для студента" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
              <Button onClick={() => void save()} disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                Зберегти й надіслати на пошту
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function PracticalResults({ courseId, edit, modules }: { courseId: string; edit: boolean; modules: string[] }) {
  const { user } = useAuth();
  const loadSummary = useServerFn(fetchCourseSummary);
  const [students, setStudents] = useState<SummaryRow[]>([]);
  const [tick, setTick] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const modulesKey = modules.join("|");
  const [rows, setRows] = useState<Score[]>([]);
  const [pending, setPending] = useState<Score[]>([]);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("practical_scores", { _course_id: courseId });
    setRows((data as Score[]) ?? []);
    if (user) {
      let query = supabase
        .from("practical_submissions")
        .select("id, user_id, module_id, module_title, student_name, created_at, status")
        .eq("course_id", courseId)
        .order("created_at", { ascending: false });
      if (!edit) query = query.eq("user_id", user.id);
      const { data: p, error } = await query;
      if (!error) {
        const seen = new Set<string>();
        const latest = (p ?? []).filter((r) => {
          const key = `${r.user_id}:${r.module_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return r.status !== "graded";
        });
        setPending(latest.map((r) => ({ ...r, score: null })));
      }
    } else {
      setPending([]);
    }
  }, [courseId, edit, user?.id]);

  useEffect(() => {
    const run = () =>
      loadSummary({ data: { courseId, modules: modulesKey.split("|") } })
        .then(setStudents)
        .catch(() => {});
    void run();
    const t = window.setInterval(run, 10000);
    window.addEventListener("practical-results-changed", run);
    window.addEventListener("focus", run);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("practical-results-changed", run);
      window.removeEventListener("focus", run);
    };
  }, [loadSummary, courseId, modulesKey, rows.length, tick]);



  useEffect(() => {
    void load();
    const refresh = () => void load();
    const t = window.setInterval(refresh, 10000);
    window.addEventListener("practical-results-changed", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(t);
      window.removeEventListener("practical-results-changed", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);

  // Deleting a work removes every attempt of that student for that task,
  // so an older attempt never "resurfaces" in the results.
  const removeSubmission = async (id: string) => {
    if (!window.confirm("Видалити цю практичну роботу (усі спроби студента)? Оцінку буде прибрано з результатів.")) return;
    const { data: one } = await supabase.from("practical_submissions").select("user_id, module_id, course_id").eq("id", id).maybeSingle();
    const q = supabase.from("practical_submissions").delete();
    const { error } = one
      ? await q.eq("user_id", one.user_id).eq("module_id", one.module_id).eq("course_id", one.course_id)
      : await q.eq("id", id);
    if (error) { toast.error("Не вдалося видалити роботу"); return; }
    toast.success("Роботу видалено");
    setStudents((list) =>
      list
        .map((s) => ({ ...s, practical: s.practical.filter((r) => r.id !== id) }))
        .filter((s) => s.practical.length),
    );
    void load();
    setTick((n) => n + 1);
  };

  if (!students.length && !pending.length) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-4">
      <button className="flex w-full items-center gap-2 text-left font-semibold" onClick={() => setOpen((o) => !o)}>
        <Trophy className="size-5 text-task" />
        <span className="text-task">Результати практичних робіт ({rows.length})</span>
        {pending.length > 0 && (
          <span className="ml-auto shrink-0 rounded-full bg-task px-2 text-xs text-task-foreground">
            {edit ? "на перевірку" : "на оцінювання"}: {pending.length}
          </span>
        )}
      </button>
      {open && (
        <>
          {edit && pending.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-task">Чекають на вашу перевірку</p>
              <ul className="divide-y divide-border text-sm">
                {pending.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{r.student_name}</span>
                      <span className="text-muted-foreground"> — {r.module_title}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button size="sm" onClick={() => setReview(r.id)}>Перевірити</Button>
                      <Button size="sm" variant="ghost" aria-label="Видалити роботу" onClick={() => void removeSubmission(r.id)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="py-2 pr-3 font-normal">Здобувач освіти</th>
                  <th className="py-2 pr-3 text-center font-normal">Практичні</th>
                  <th className="py-2 pr-3 text-center font-normal">Тести</th>
                  <th className="py-2 text-center font-normal">Бал за курс</th>
                </tr>
              </thead>
              <tbody>
                {students.map((s) => (
                  <Fragment key={s.key}>
                    <tr className="cursor-pointer border-t border-border hover:bg-muted/50" onClick={() => setExpanded(expanded === s.key ? null : s.key)}>
                      <td className="py-2 pr-3 font-medium">
                        <ChevronRight className={`mr-1 inline size-4 transition-transform ${expanded === s.key ? "rotate-90" : ""}`} />
                        {s.name}
                      </td>
                      <td className="py-2 pr-3 text-center">{s.p ?? "—"}</td>
                      <td className="py-2 pr-3 text-center">{s.t ?? "—"}</td>
                      <td className="py-2 text-center">
                        <span className="rounded-md bg-task px-2 py-0.5 font-semibold text-task-foreground">{s.total ?? "—"}</span>
                      </td>
                    </tr>
                    {expanded === s.key &&
                      s.practical.map((r) => (
                        <tr key={r.id} className="text-muted-foreground">
                          <td className="py-1 pl-7 pr-3" colSpan={3}>{r.module_title}</td>
                          <td className="py-1 text-center">
                            {r.awaiting ? (
                              <span className="font-semibold text-task">Очікує на оцінювання</span>
                            ) : (
                              <span className="font-semibold text-foreground">{r.score ?? "—"}/12</span>
                            )}
                            {edit && (
                              <Button size="sm" variant="ghost" onClick={() => setReview(r.id)}>
                                Переглянути
                              </Button>
                            )}
                            {edit && (
                              <Button size="sm" variant="ghost" aria-label="Видалити роботу" onClick={() => void removeSubmission(r.id)}>
                                <Trash2 className="size-4 text-destructive" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted-foreground">
              Бал за курс — середнє між практичними й тестами; якщо чогось одного немає, зараховується інше.
            </p>
          </div>
        </>
      )}
      {review && <ReviewDialog id={review} onClose={() => setReview(null)} onSaved={() => {
        void load();
        setTick((n) => n + 1);
        window.dispatchEvent(new Event("practical-results-changed"));
      }} />}
    </div>
  );
}