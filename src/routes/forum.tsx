import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { useContent } from "@/data/store";
import { notifyNewThread, notifyReply, sendBroadcast } from "@/lib/forum.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/forum")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Форум курсів — Навчальна платформа викладача" },
      {
        name: "description",
        content:
          "Запитання, відгуки й пропозиції студентів та організаційні оголошення викладача з відповідями на пошту.",
      },
      { property: "og:title", content: "Форум курсів — Навчальна платформа викладача" },
      {
        property: "og:description",
        content: "Поставте запитання викладачу та отримайте відповідь на сайті й на пошту.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ForumPage,
});

const CATEGORIES: Record<string, string> = {
  organizational: "Організаційне питання",
  topic: "Питання за темою",
  feedback: "Відгук",
  suggestion: "Пропозиція",
};

type Thread = {
  id: string;
  author_id: string;
  author_name: string;
  course_id: string | null;
  category: string;
  title: string;
  body: string;
  is_private: boolean;
  created_at: string;
};
type Reply = {
  id: string;
  thread_id: string;
  author_id: string;
  author_name: string;
  is_teacher: boolean;
  body: string;
  created_at: string;
};

const fmt = (s: string) =>
  new Date(s).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" });

function ForumPage() {
  const { user, isTeacher, loading } = useAuth();
  const { courses } = useContent(false);
  const courseTitle = useCallback(
    (id: string | null) => (id ? courses.find((c) => c.id === id)?.title ?? "Курс" : "Загальне"),
    [courses],
  );

  const [threads, setThreads] = useState<Thread[]>([]);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [subs, setSubs] = useState<string[]>([]);
  const [filterCourse, setFilterCourse] = useState("all");
  const [filterCat, setFilterCat] = useState("all");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const [t, r, s] = await Promise.all([
      supabase.from("forum_threads").select("*").order("created_at", { ascending: false }),
      supabase.from("forum_replies").select("*").order("created_at"),
      supabase.from("course_subscriptions").select("course_id").eq("user_id", user.id),
    ]);
    setThreads((t.data as Thread[]) ?? []);
    setReplies((r.data as Reply[]) ?? []);
    setSubs((s.data ?? []).map((x) => x.course_id));
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const signIn = async () => {
    setError(null);
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/forum`,
    });
    if (res.error) setError("Не вдалося увійти через Google");
  };

  const displayName =
    (user?.user_metadata?.["full_name"] as string | undefined) ?? user?.email?.split("@")[0] ?? "";

  const toggleSub = async (courseId: string) => {
    if (!user) return;
    if (subs.includes(courseId)) {
      await supabase
        .from("course_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("course_id", courseId);
    } else {
      await supabase.from("course_subscriptions").insert({
        user_id: user.id,
        course_id: courseId,
        email: user.email ?? "",
        name: displayName,
      });
    }
    void load();
  };

  const visible = useMemo(
    () =>
      threads.filter(
        (t) =>
          (filterCourse === "all" || (t.course_id ?? "general") === filterCourse) &&
          (filterCat === "all" || t.category === filterCat),
      ),
    [threads, filterCourse, filterCat],
  );

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← До курсів
      </Link>
      <h1 className="mt-3 text-3xl font-semibold">Форум курсів</h1>
      <p className="mt-2 text-muted-foreground">
        Ставте запитання, залишайте відгуки й пропозиції. Відповідь викладача надійде і сюди, і на
        вашу пошту. Вхід — лише через обліковий запис Google.
      </p>

      {loading ? null : !user ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6">
          <p className="mb-4">Щоб переглядати й писати на форумі, увійдіть через Google.</p>
          <Button onClick={() => void signIn()}>Увійти через Google</Button>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      ) : (
        <>
          <p className="mt-4 text-sm text-muted-foreground">
            Ви увійшли як <b>{user.email}</b>
            {isTeacher && " (викладач)"} ·{" "}
            <button
              className="underline-offset-4 hover:underline"
              onClick={() => void supabase.auth.signOut()}
            >
              Вийти
            </button>
          </p>

          {!isTeacher && (
            <section className="mt-6 rounded-2xl border border-border bg-card p-5">
              <h2 className="font-semibold">Підписка на оголошення курсів</h2>
              <p className="text-sm text-muted-foreground">
                Отримуйте організаційні повідомлення викладача на {user.email}.
              </p>
              <div className="mt-3 space-y-2">
                {courses.map((c) => (
                  <label key={c.id} className="flex items-center gap-3 text-sm">
                    <Switch
                      checked={subs.includes(c.id)}
                      onCheckedChange={() => void toggleSub(c.id)}
                    />
                    {c.title}
                  </label>
                ))}
              </div>
            </section>
          )}

          {isTeacher && <BroadcastForm courses={courses.map((c) => ({ id: c.id, title: c.title }))} />}

          <NewThreadForm
            courses={courses.map((c) => ({ id: c.id, title: c.title }))}
            userId={user.id}
            name={displayName}
            onCreated={load}
          />

          <div className="mt-8 flex flex-wrap gap-3">
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterCourse}
              onChange={(e) => setFilterCourse(e.target.value)}
            >
              <option value="all">Усі курси</option>
              <option value="general">Загальне</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <select
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="all">Усі категорії</option>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <ul className="mt-4 space-y-3">
            {visible.length === 0 && (
              <li className="text-sm text-muted-foreground">Тут поки немає звернень.</li>
            )}
            {visible.map((t) => {
              const rs = replies.filter((r) => r.thread_id === t.id);
              const answered = rs.some((r) => r.is_teacher);
              return (
                <li key={t.id} className="rounded-2xl border border-border bg-card p-5">
                  <button className="w-full text-left" onClick={() => setOpen(open === t.id ? null : t.id)}>
                    <div className="flex flex-wrap gap-2 text-xs">
                      <span className="rounded-full bg-secondary px-2 py-0.5">{courseTitle(t.course_id)}</span>
                      <span className="rounded-full bg-secondary px-2 py-0.5">{CATEGORIES[t.category] ?? t.category}</span>
                      {t.is_private && (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">Приватне</span>
                      )}
                      {answered && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">Є відповідь викладача</span>
                      )}
                    </div>
                    <h3 className="mt-2 font-semibold">{t.title}</h3>
                    <p className="text-xs text-muted-foreground">
                      {t.author_name} · {fmt(t.created_at)} · відповідей: {rs.length}
                    </p>
                  </button>
                  {open === t.id && (
                    <ThreadView
                      thread={t}
                      replies={rs}
                      userId={user.id}
                      name={displayName}
                      canDelete={isTeacher || t.author_id === user.id}
                      onChange={load}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </main>
  );
}

function NewThreadForm({
  courses,
  userId,
  name,
  onCreated,
}: {
  courses: { id: string; title: string }[];
  userId: string;
  name: string;
  onCreated: () => void;
}) {
  const notify = useServerFn(notifyNewThread);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [course, setCourse] = useState("general");
  const [cat, setCat] = useState("organizational");
  const [priv, setPriv] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from("forum_threads")
      .insert({
        author_id: userId,
        author_name: name,
        course_id: course === "general" ? null : course,
        category: cat,
        title: title.trim(),
        body: body.trim(),
        is_private: priv,
      })
      .select("id")
      .single();
    if (error || !data) {
      setMsg("Не вдалося опублікувати звернення");
    } else {
      setTitle("");
      setBody("");
      setMsg("Звернення опубліковано. Відповідь надійде і на вашу пошту.");
      onCreated();
      notify({ data: { threadId: data.id } }).catch(() => {});
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">Нове звернення</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={course}
          onChange={(e) => setCourse(e.target.value)}
        >
          <option value="general">Загальне (без курсу)</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
      </div>
      <Input placeholder="Тема" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />
      <Textarea placeholder="Ваше запитання, відгук чи пропозиція" value={body} onChange={(e) => setBody(e.target.value)} required rows={4} maxLength={5000} />
      <label className="flex items-center gap-3 text-sm">
        <Switch checked={priv} onCheckedChange={setPriv} />
        Приватне — бачитимемо лише я і викладач
      </label>
      <Button type="submit" disabled={busy}>Опублікувати</Button>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </form>
  );
}

function ThreadView({
  thread,
  replies,
  userId,
  name,
  canDelete,
  onChange,
}: {
  thread: Thread;
  replies: Reply[];
  userId: string;
  name: string;
  canDelete: boolean;
  onChange: () => void;
}) {
  const notify = useServerFn(notifyReply);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    const { data } = await supabase
      .from("forum_replies")
      .insert({ thread_id: thread.id, author_id: userId, author_name: name, body: text.trim() })
      .select("id")
      .single();
    setText("");
    setBusy(false);
    onChange();
    if (data) notify({ data: { replyId: data.id } }).catch(() => {});
  };

  const remove = async () => {
    if (!confirm("Видалити це звернення?")) return;
    await supabase.from("forum_threads").delete().eq("id", thread.id);
    onChange();
  };

  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="whitespace-pre-wrap">{thread.body}</p>
      <ul className="mt-4 space-y-3">
        {replies.map((r) => (
          <li
            key={r.id}
            className={`rounded-xl p-3 ${r.is_teacher ? "bg-primary/10" : "bg-secondary"}`}
          >
            <p className="text-xs text-muted-foreground">
              <b>{r.is_teacher ? "Викладач" : r.author_name}</b> · {fmt(r.created_at)}
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm">{r.body}</p>
          </li>
        ))}
      </ul>
      <form onSubmit={send} className="mt-3 space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Ваша відповідь" rows={3} maxLength={5000} />
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={busy}>Відповісти</Button>
          {canDelete && (
            <Button type="button" size="sm" variant="outline" onClick={() => void remove()}>
              Видалити звернення
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

function BroadcastForm({ courses }: { courses: { id: string; title: string }[] }) {
  const send = useServerFn(sendBroadcast);
  const [course, setCourse] = useState(courses[0]?.id ?? "");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!course) return;
    void supabase
      .from("course_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", course)
      .then(({ count: c }) => setCount(c ?? 0));
  }, [course]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("Надіслати лист усім підписникам курсу?")) return;
    setBusy(true);
    setMsg(null);
    try {
      const title = courses.find((c) => c.id === course)?.title ?? "";
      const r = await send({ data: { courseId: course, courseTitle: title, subject, body } });
      setMsg(`Надіслано листів: ${r.sent} з ${r.total}`);
      setSubject("");
      setBody("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Не вдалося надіслати");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <h2 className="font-semibold">Розсилка оголошення підписникам курсу</h2>
      <Label className="text-sm">Курс</Label>
      <select
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={course}
        onChange={(e) => setCourse(e.target.value)}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      {count !== null && <p className="text-xs text-muted-foreground">Підписників: {count}</p>}
      <Input placeholder="Тема листа" value={subject} onChange={(e) => setSubject(e.target.value)} required />
      <Textarea placeholder="Текст оголошення" value={body} onChange={(e) => setBody(e.target.value)} required rows={5} />
      <Button type="submit" disabled={busy}>{busy ? "Надсилаю…" : "Надіслати з olppara@gmail.com"}</Button>
      {msg && <p className="text-sm">{msg}</p>}
    </form>
  );
}
