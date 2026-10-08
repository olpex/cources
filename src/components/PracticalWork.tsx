import { Fragment, useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FileText, Hammer, Loader2, Trophy, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { gradePractical, submitPractical, type PracticalFile } from "@/lib/practical.functions";

const BUCKET = "practical-files";
const MAX_FILES = 5;
const MAX_SIZE = 50 * 1024 * 1024;
const ACCEPT = "image/*,audio/*,video/*,.doc,.docx,.xls,.xlsx,.accdb,.mdb";

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

export function PracticalButton(props: { courseId: string; moduleId: string; title: string; task: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Hammer className="size-4" />
        Практична робота
      </Button>
      {open && <PracticalDialog {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

function PracticalDialog({ courseId, moduleId, title, task, onClose }: { courseId: string; moduleId: string; title: string; task: string; onClose: () => void }) {
  const { user, loading } = useAuth();
  const submit = useServerFn(submitPractical);
  const [answer, setAnswer] = useState("");
  const [links, setLinks] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Own | null>(null);

  const loadOwn = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("practical_submissions")
      .select("id, ai_score, teacher_score, feedback, created_at, status")
      .eq("user_id", user.id)
      .eq("course_id", courseId)
      .eq("module_id", moduleId)
      .order("created_at", { ascending: false })
      .limit(1);
    setLast((data?.[0] as Own) ?? null);
  }, [user, courseId, moduleId]);

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
    setBusy(true);
    try {
      const uploaded: PracticalFile[] = [];
      for (const f of files) {
        const safe = f.name.replace(/[^\w.\-]+/g, "_").slice(-80);
        const path = `${user.id}/${courseId}/${moduleId}/${Date.now()}-${safe}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type || undefined });
        if (error) throw new Error(`Не вдалося завантажити «${f.name}»`);
        uploaded.push({ path, name: f.name, type: f.type, size: f.size });
      }
      const r = await submit({ data: { courseId, moduleId, answer, links, files: uploaded } });
      toast.success(r.score ? `Оцінка: ${r.score} з 12` : "Роботу надіслано викладачу на перевірку");
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
          <DialogTitle>Практична робота — {title}</DialogTitle>
        </DialogHeader>
        <div className="whitespace-pre-line rounded-xl bg-secondary p-4 text-sm">
          <Linkified text={task} />
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
            <Textarea rows={6} placeholder="Ваша відповідь або коментар (необов'язково)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
            <Textarea
              rows={2}
              placeholder="Загальнодоступні посилання на чат, Suno, відео тощо — кожне з нового рядка"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
            <div className="text-sm">
              <label className="mb-1 block text-muted-foreground">
                Файли: скріншоти, Word, Excel, Access, аудіо, відео (до {MAX_FILES} файлів, кожен до 50 МБ)
              </label>
              <Input type="file" multiple accept={ACCEPT} onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
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
              Текст, скріншоти, Word і Excel перевіряються автоматично. Якщо є посилання, аудіо, відео чи Access — роботу оцінить викладач. Посилання мають бути відкриті для всіх.
            </p>
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

export function PracticalResults({ courseId, edit }: { courseId: string; edit: boolean }) {
  const [rows, setRows] = useState<Score[]>([]);
  const [pending, setPending] = useState<Score[]>([]);
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("practical_scores", { _course_id: courseId });
    setRows((data as Score[]) ?? []);
    if (edit) {
      const { data: p } = await supabase
        .from("practical_submissions")
        .select("id, module_id, module_title, student_name, created_at")
        .eq("course_id", courseId)
        .in("status", ["manual", "error", "pending"])
        .order("created_at", { ascending: false });
      setPending(((p ?? []) as Omit<Score, "score">[]).map((r) => ({ ...r, score: null })));
    }
  }, [courseId, edit]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!rows.length && !pending.length) return null;

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-4">
      <button className="flex w-full items-center gap-2 text-left font-semibold" onClick={() => setOpen((o) => !o)}>
        <Trophy className="size-5 text-primary" />
        Результати практичних робіт ({rows.length})
        {edit && pending.length > 0 && (
          <span className="ml-auto rounded-full bg-destructive px-2 text-xs text-destructive-foreground">
            на перевірку: {pending.length}
          </span>
        )}
      </button>
      {open && (
        <>
          {edit && pending.length > 0 && (
            <div className="mt-3">
              <p className="text-sm font-semibold text-destructive">Чекають на вашу перевірку</p>
              <ul className="divide-y divide-border text-sm">
                {pending.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      <span className="font-medium">{r.student_name}</span>
                      <span className="text-muted-foreground"> — {r.module_title}</span>
                    </span>
                    <Button size="sm" onClick={() => setReview(r.id)}>Перевірити</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <ul className="mt-3 divide-y divide-border text-sm">
            {rows
              .slice()
              .sort((a, b) => a.student_name.localeCompare(b.student_name, "uk"))
              .map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{r.student_name}</span>
                    <span className="text-muted-foreground"> — {r.module_title}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="font-semibold">{r.score ?? "—"}/12</span>
                    {edit && (
                      <Button size="sm" variant="ghost" onClick={() => setReview(r.id)}>
                        Переглянути
                      </Button>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </>
      )}
      {review && <ReviewDialog id={review} onClose={() => setReview(null)} onSaved={() => void load()} />}
    </div>
  );
}