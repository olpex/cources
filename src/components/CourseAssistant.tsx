import { useEffect, useRef, useState } from "react";
import { Bot, Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { askAssistant, getAssistantCourses, type AssistantCourse } from "@/lib/course-assistant";

type Message = { role: "student" | "assistant"; text: string; sources?: string[]; error?: boolean };

export function CourseAssistant({ courseKey, courseTitle }: { courseKey: string; courseTitle: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(courseKey);
  const [courses, setCourses] = useState<AssistantCourse[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [listError, setListError] = useState("");
  const [retry, setRetry] = useState(0);
  const activeRequest = useRef<AbortController | null>(null);
  const stream = useRef<HTMLDivElement | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoadingCourses(true);
    setListError("");
    getAssistantCourses(controller.signal).then(setCourses).catch((error: unknown) => {
      if (!controller.signal.aborted) setListError(error instanceof Error ? error.message : "Не вдалося отримати список курсів.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoadingCourses(false);
    });
    return () => controller.abort();
  }, [open, retry]);

  useEffect(() => {
    if (open && stream.current) stream.current.scrollTop = stream.current.scrollHeight;
  }, [messages, waiting, open]);

  function switchCourse(key: string) {
    if (key === selected) return;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setSelected(key);
    setMessages([]);
    setQuestion("");
    setWaiting(false);
  }

  async function sendQuestion() {
    const text = question.trim();
    if (!text || waiting) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setMessages((previous) => [...previous, { role: "student", text }]);
    setQuestion("");
    setWaiting(true);
    try {
      const result = await askAssistant(selected, text, controller.signal);
      if (!controller.signal.aborted) setMessages((previous) => [...previous, { role: "assistant", text: result.answer, sources: result.sources }]);
    } catch (error) {
      if (!controller.signal.aborted) setMessages((previous) => [...previous, {
        role: "assistant", error: true,
        text: error instanceof Error ? error.message : "Не вдалося отримати відповідь. Спробуйте ще раз.",
      }]);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setWaiting(false);
        input.current?.focus();
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => { switchCourse(courseKey); setOpen(true); }}>
        <span aria-hidden="true">🤖</span> Запитайте асистента
      </Button>
      <DialogContent className="flex h-dvh max-h-dvh w-full max-w-none flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-[min(740px,90dvh)] sm:max-w-2xl sm:rounded-lg">
        <DialogHeader className="shrink-0 border-b border-border px-5 pt-5 pb-4 text-left">
          <DialogTitle className="flex items-center gap-2 pr-7"><Bot className="size-5 text-primary" /> Помічник викладача</DialogTitle>
          <DialogDescription>Лише за конспектами вибраного курсу.</DialogDescription>
          <div className="pt-2">
            <Select value={selected} onValueChange={switchCourse} disabled={loadingCourses}>
              <SelectTrigger aria-label="Курс помічника" className="w-full min-w-0 bg-card">
                <SelectValue placeholder={courseTitle} />
              </SelectTrigger>
              <SelectContent>
                {courses.some((course) => course.key === selected) ? null : <SelectItem value={selected}>{courseTitle}</SelectItem>}
                {courses.map((course) => <SelectItem key={course.key} value={course.key}>{course.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </DialogHeader>
        <div ref={stream} role="log" aria-label="Діалог із помічником" aria-live="polite" className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
          {listError && <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <p>{listError}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => setRetry((value) => value + 1)}>Спробувати ще раз</Button>
          </div>}
          {messages.map((message, index) => <div key={index} className={message.role === "student" ? "ml-auto max-w-[90%]" : "mr-auto max-w-[95%]"}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{message.role === "student" ? "Ви" : "Асистент"}</p>
            <div className={`whitespace-pre-wrap break-words rounded-lg px-4 py-3 text-sm leading-relaxed ${message.error ? "border border-destructive/30 bg-destructive/5 text-destructive" : message.role === "student" ? "bg-primary text-primary-foreground" : "border border-border bg-card text-card-foreground"}`}>
              {message.text}
            </div>
            {Boolean(message.sources?.length) && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Джерела відповіді">
              {message.sources?.map((source, sourceIndex) => <span key={sourceIndex} className="max-w-full break-words rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">{source}</span>)}
            </div>}
          </div>)}
          {waiting && <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 motion-safe:animate-spin" /> Асистент набирає відповідь…
          </div>}
        </div>
        <form className="flex shrink-0 items-end gap-2 border-t border-border bg-card px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]" onSubmit={(event) => { event.preventDefault(); void sendQuestion(); }}>
          <Textarea ref={input} value={question} onChange={(event) => setQuestion(event.target.value)}
            aria-label="Ваше запитання" placeholder="Ваше запитання…" rows={2}
            className="max-h-32 min-h-16 resize-none"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault(); void sendQuestion();
              }
            }} />
          <Button type="submit" size="icon" aria-label="Надіслати запитання" title="Надіслати запитання" disabled={!question.trim() || waiting} className="mb-1 shrink-0">
            <Send className="size-4" />
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}