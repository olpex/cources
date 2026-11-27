import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import type { EmailOtpType } from "@supabase/supabase-js";
import {
  requestRegistrationCode,
  verifyRegistrationCode,
  getRegistrationState,
  resumeSession,
} from "@/lib/registration.functions";
import { CONTACT_EMAIL } from "@/lib/registration-rules";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Mail, ShieldCheck, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export type RegistrationCourse = { id: string; title: string; active?: boolean | undefined };

type Step = "email" | "code" | "done";

type Refusal = { ok: false; reason: string; message: string };

/**
 * Blocks the whole site until a visitor proves an email address for one course.
 * The teacher is recognised by address, so no course is asked from him.
 */
export function RegistrationGate({
  courses,
  loading,
  onReady,
}: {
  courses: RegistrationCourse[];
  loading: boolean;
  onReady: (courseId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [courseId, setCourseId] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [checking, setChecking] = useState(true);

  /**
   * The parent passes an inline arrow, so `onReady` is a new function on every
   * render. Keeping it in a ref stops the bootstrap effect from re-running and
   * reopening the gate right after a successful registration.
   */
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const doneRef = useRef(false);

  const checkState = useServerFn(getRegistrationState);
  const askCode = useServerFn(requestRegistrationCode);
  const checkCode = useServerFn(verifyRegistrationCode);
  const resume = useServerFn(resumeSession);

  /** A real Supabase session is required by the rest of the site. */
  const openSession = useCallback(
    async (tokenHash: string, otpType: string) => {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: otpType as EmailOtpType,
      });
      if (error) throw error;
    },
    [],
  );

  useEffect(() => {
    if (doneRef.current) return;
    let alive = true;
    void (async () => {
      try {
        const state = await checkState({});
        if (!alive || doneRef.current) return;
        if (state.known) {
          // Known device: refresh the session silently, never ask for a code again.
          const fresh = await resume({});
          if (fresh.ok) {
            await openSession(fresh.tokenHash, fresh.otpType);
            if (alive) onReadyRef.current(fresh.courseId ?? null);
            return;
          }
          // The binding exists but the session cannot be minted: do not trap the
          // visitor behind the gate, just ask for a code again.
          setOpen(true);
          return;
        }
        setOpen(true);
      } catch {
        if (alive) setOpen(true);
      } finally {
        if (alive) setChecking(false);
      }
    })();
    return () => {
      alive = false;
    };
    // Runs once per mount on purpose: `onReady` is intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkState, resume, openSession]);

  const activeCourses = courses.filter((c) => c.active !== false);
  const chosen = courses.find((c) => c.id === courseId);

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefusal(null);
    if (!email.trim()) return setRefusal({ ok: false, reason: "invalid-email", message: "Вкажіть електронну пошту." });
    if (!fullName.trim()) return setRefusal({ ok: false, reason: "invalid-email", message: "Вкажіть прізвище та ім'я." });
    if (!courseId) return setRefusal({ ok: false, reason: "invalid-email", message: "Оберіть курс." });

    setBusy(true);
    try {
      const result = await askCode({ data: { email, fullName, courseId } });
      if (!result.ok) {
        setRefusal(result as Refusal);
        return;
      }
      setStep("code");
      toast.success("Код надіслано на пошту");
    } catch {
      setRefusal({
        ok: false,
        reason: "mail-failed",
        message: `Не вдалося надіслати код. Спробуйте пізніше або напишіть на ${CONTACT_EMAIL}.`,
      });
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setRefusal(null);
    setBusy(true);
    try {
      const result = await checkCode({ data: { email, code } });
      if (!result.ok) {
        setRefusal(result as Refusal);
        return;
      }
      await openSession(result.tokenHash, result.otpType);
      doneRef.current = true;
      setStep("done");
      setOpen(false);
      onReadyRef.current(courseId || null);
      toast.success("Вітаємо на курсі");
    } catch (e) {
      setRefusal({
        ok: false,
        reason: "invalid-code",
        message:
          e instanceof Error && e.message
            ? `Не вдалося відкрити сесію: ${e.message}. Спробуйте ще раз або напишіть на ${CONTACT_EMAIL}.`
            : `Не вдалося відкрити сесію. Спробуйте ще раз або напишіть на ${CONTACT_EMAIL}.`,
      });
    } finally {
      setBusy(false);
    }
  };

  if (checking || (open && loading && activeCourses.length === 0)) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        className="max-w-lg [&>button]:hidden"
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {step === "code" ? <ShieldCheck className="size-5 text-primary" /> : <Mail className="size-5 text-primary" />}
            {step === "code" ? "Введіть код із листа" : "Реєстрація на курс"}
          </DialogTitle>
          <DialogDescription>
            {step === "code" ? (
              <>
                Код надіслано на <span className="font-medium text-foreground">{email}</span>. Він діє
                15 хвилин і підходить лише для цього пристрою.
              </>
            ) : (
              <>
                Вкажіть прізвище та ім'я, пошту й оберіть курс. Код надходить один раз — далі цей
                пристрій запам'ятовується.
              </>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === "email" && (
          <form onSubmit={submitEmail} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-name">Прізвище та ім'я</Label>
              <Input
                id="reg-name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Шевченко Тарас"
                autoComplete="name"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">Електронна пошта</Label>
              <Input
                id="reg-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="student@example.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-course">Курс</Label>
              <Select value={courseId} onValueChange={setCourseId}>
                <SelectTrigger id="reg-course">
                  <SelectValue placeholder="Оберіть курс" />
                </SelectTrigger>
                <SelectContent>
                  {activeCourses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {refusal && (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>{refusal.message}</p>
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
                {busy ? "Надсилаємо…" : "Отримати код на пошту"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step === "code" && (
          <form onSubmit={submitCode} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reg-code">Код із шести цифр</Label>
              <Input
                id="reg-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="000000"
                inputMode="numeric"
                autoComplete="one-time-code"
                className="text-center text-2xl tracking-[0.5em]"
                maxLength={6}
                required
              />
            </div>

            {refusal && (
              <div className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
                <p>{refusal.message}</p>
              </div>
            )}

            <DialogFooter className="flex-col gap-2 sm:flex-col">
              <Button type="submit" disabled={busy || code.length !== 6} className="w-full">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                {busy ? "Перевіряємо…" : "Підтвердити"}
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setStep("email");
                  setCode("");
                  setRefusal(null);
                }}
              >
                Змінити пошту або курс
              </Button>
            </DialogFooter>
          </form>
        )}

        {chosen && step === "email" && (
          <p className="text-xs text-muted-foreground">
            Обраний курс: <span className="font-medium text-foreground">{chosen.title}</span>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
