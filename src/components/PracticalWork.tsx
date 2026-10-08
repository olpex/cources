import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Hammer, Loader2, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { useAuth } from "@/hooks/useAuth";
import { submitPractical } from "@/lib/practical.functions";

type Own = { id: string; ai_score: number | null; teacher_score: number | null; feedback: string | null; created_at: string; status: string };

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

function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read"));
    r.readAsDataURL(file);
  });
}

function PracticalDialog({ courseId, moduleId, title, task, onClose }: { courseId: string; moduleId: string; title: string; task: string; onClose: () => void }) {
  const { user, loading } = useAuth();
  const submit = useServerFn(submitPractical);
  const [answer, setAnswer] = useState("");
  const [links, setLinks] = useState("");
  const [image, setImage] = useState<string | null>(null);
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

  const onFile = async (f: File | undefined) => {
    if (!f) return setImage(null);
    if (!f.type.startsWith("image/")) return toast.error("Можна додати лише зображення (фото чи скріншот)");
    if (f.size > 4 * 1024 * 1024) return toast.error("Зображення до 4 МБ");
    setImage(await readImage(f));
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await submit({ data: { courseId, moduleId, answer, links, image } });
      toast.success(r.score ? `Оцінка: ${r.score} з 12` : "Роботу збережено");
      setAnswer("");
      setLinks("");
      setImage(null);
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
        <div className="whitespace-pre-line rounded-xl bg-secondary p-4 text-sm">{task}</div>

        {last && (
          <div className="rounded-xl border border-border p-4 text-sm">
            <p className="font-semibold">
              Ваша остання оцінка: {score !== null ? `${score} з 12` : "очікує перевірки"}
            </p>
            {last.feedback && <p className="mt-2 whitespace-pre-line text-muted-foreground">{last.feedback}</p>}
            <p className="mt-2 text-xs text-muted-foreground">Можна надіслати роботу повторно — зараховується остання.</p>
          </div>
        )}

        {loading ? null : !user ? (
          <div className="space-y-3 text-sm">
            <p>Щоб здати роботу, увійдіть через Google.</p>
            <Button
              onClick={() =>
                lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin })
              }
            >
              Увійти через Google
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <Textarea
              rows={8}
              placeholder="Ваша відповідь (можна вставити текст із Word чи PDF)"
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
            />
            <Input
              placeholder="Посилання на вашу роботу (необов'язково)"
              value={links}
              onChange={(e) => setLinks(e.target.value)}
            />
            <div className="text-sm">
              <label className="mb-1 block text-muted-foreground">Фото чи скріншот (необов'язково, до 4 МБ)</label>
              <Input type="file" accept="image/*" onChange={(e) => void onFile(e.target.files?.[0])} />
            </div>
            <p className="text-xs text-muted-foreground">
              Робота перевіряється автоматично. Вміст за посиланнями перевірка не бачить, тож головне пишіть у відповіді.
            </p>
            <Button onClick={() => void send()} disabled={busy}>
              {busy && <Loader2 className="size-4 animate-spin" />}
              {busy ? "Перевіряємо…" : "Надіслати на перевірку"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type Score = { id: string; module_id: string; module_title: string; student_name: string; score: number | null; created_at: string };

export function PracticalResults({ courseId, edit }: { courseId: string; edit: boolean }) {
  const [rows, setRows] = useState<Score[]>([]);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc("practical_scores", { _course_id: courseId });
    setRows((data as Score[]) ?? []);
  }, [courseId]);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60000);
    return () => window.clearInterval(t);
  }, [load]);

  if (!rows.length) return null;

  const setScore = async (id: string) => {
    const v = window.prompt("Нова оцінка (1–12):");
    const n = Number(v);
    if (!v || !Number.isInteger(n) || n < 1 || n > 12) return;
    const { error } = await supabase.from("practical_submissions").update({ teacher_score: n, status: "graded" }).eq("id", id);
    if (error) toast.error("Не вдалося змінити оцінку");
    else void load();
  };

  return (
    <div className="mb-6 rounded-2xl border border-border bg-card p-4">
      <button className="flex w-full items-center gap-2 text-left font-semibold" onClick={() => setOpen((o) => !o)}>
        <Trophy className="size-5 text-primary" />
        Результати практичних робіт ({rows.length})
      </button>
      {open && (
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
                    <Button size="sm" variant="ghost" onClick={() => void setScore(r.id)}>
                      Змінити
                    </Button>
                  )}
                </span>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
