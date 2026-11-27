import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listCourseStudents,
  revokeStudent,
  blockStudent,
  unblockStudent,
  revokeAllStudents,
  type StudentRow,
} from "@/lib/registration.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Loader2, ShieldBan, ShieldCheck, UserMinus, Users } from "lucide-react";
import { toast } from "sonner";

type Pending =
  | { kind: "revoke"; row: StudentRow }
  | { kind: "block"; row: StudentRow }
  | { kind: "revokeAll"; count: number }
  | null;

const STATUS_LABEL: Record<string, string> = {
  active: "навчається",
  revoked: "завершено",
  blocked: "заблоковано",
};

/** Teacher-only panel: who is on the course and how to end or ban them. */
export function CourseStudents({ courseId }: { courseId: string }) {
  const [rows, setRows] = useState<StudentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending>(null);
  const [open, setOpen] = useState(false);

  const load = useServerFn(listCourseStudents);
  const revoke = useServerFn(revokeStudent);
  const block = useServerFn(blockStudent);
  const unblock = useServerFn(unblockStudent);
  const revokeAll = useServerFn(revokeAllStudents);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await load({ data: { courseId } });
      setRows(list);
    } catch {
      toast.error("Не вдалося завантажити список студентів");
    } finally {
      setLoading(false);
    }
  }, [load, courseId]);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(message);
      await refresh();
    } catch {
      toast.error("Не вдалося виконати дію");
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const active = rows.filter((r) => r.status === "active");

  return (
    <section className="mb-4 rounded-2xl border border-border bg-card px-5 py-4 shadow-soft">
      <button
        type="button"
        className="flex w-full items-center gap-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
          <Users className="size-5 text-primary" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">Слухачі курсу</span>
          <span className="block text-sm text-muted-foreground">
            Хто зареєстрований, коли завершити навчання й кого заблокувати назавжди.
          </span>
        </span>
        <span className="shrink-0 text-sm text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="mt-4">
          {loading ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Завантажуємо…
            </div>
          ) : rows.length === 0 ? (
            <p className="py-4 text-sm text-muted-foreground">
              На цей курс ще ніхто не зареєструвався.
            </p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-muted-foreground">
                  Усього: {rows.length} · активних: {active.length}
                </p>
                {active.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setPending({ kind: "revokeAll", count: active.length })}
                  >
                    <UserMinus className="size-4" />
                    Завершити курс для всіх
                  </Button>
                )}
              </div>

              <ul className="divide-y divide-border">
                {rows.map((row) => (
                  <li key={row.id} className="flex flex-wrap items-center gap-2 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {row.full_name || "Без імені"}
                        <span className="ml-2 font-normal text-muted-foreground">{row.email}</span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(row.created_at).toLocaleDateString("uk-UA")}
                        {row.ended_at && ` · завершено ${new Date(row.ended_at).toLocaleDateString("uk-UA")}`}
                      </p>
                    </div>
                    <Badge variant={row.status === "active" ? "secondary" : "outline"}>
                      {STATUS_LABEL[row.status] ?? row.status}
                    </Badge>
                    {row.status === "active" && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => setPending({ kind: "revoke", row })}
                        >
                          <UserMinus className="size-4" />
                          Завершити
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          className="text-destructive hover:text-destructive"
                          onClick={() => setPending({ kind: "block", row })}
                        >
                          <ShieldBan className="size-4" />
                          Заблокувати
                        </Button>
                      </>
                    )}
                    {row.status === "blocked" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() => void run(() => unblock({ data: { email: row.email } }), "Блокування знято")}
                      >
                        <ShieldCheck className="size-4" />
                        Зняти блокування
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      <AlertDialog open={!!pending} onOpenChange={(v) => !v && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending?.kind === "block"
                ? "Заблокувати назавжди?"
                : pending?.kind === "revokeAll"
                  ? "Завершити курс для всіх?"
                  : "Завершити навчання?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pending?.kind === "block" ? (
                <>
                  Пошта <span className="font-medium">{pending.row.email}</span> буде заблокована
                  назавжди — на всіх курсах і пристроях. Студент більше не зможе зареєструватися.
                </>
              ) : pending?.kind === "revokeAll" ? (
                <>
                  Навчання завершиться для {pending.count} слухачів. Повернутися на цей курс вони вже
                  не зможуть — лише на інший.
                </>
              ) : (
                <>
                  <span className="font-medium">{pending?.row.full_name || pending?.row.email}</span>{" "}
                  завершить навчання на цьому курсі. Повторно зареєструватися на нього вже не вийде.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Скасувати</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={() => {
                if (!pending) return;
                if (pending.kind === "revoke") {
                  void run(() => revoke({ data: { id: pending.row.id } }), "Навчання завершено");
                } else if (pending.kind === "block") {
                  void run(() => block({ data: { id: pending.row.id } }), "Пошту заблоковано назавжди");
                } else {
                  void run(() => revokeAll({ data: { courseId } }), "Курс завершено для всіх");
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Підтвердити
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
