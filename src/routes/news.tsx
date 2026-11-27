import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Rss, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";
import { useContent } from "@/data/store";
import { publishAnnouncement } from "@/lib/forum.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/news")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Оголошення курсів — Навчальна платформа викладача" },
      {
        name: "description",
        content: "Стрічка оголошень викладача з підпискою на листи для кожного курсу.",
      },
      { property: "og:title", content: "Оголошення курсів — Навчальна платформа викладача" },
      {
        property: "og:description",
        content: "Підпишіться на оголошення свого курсу й отримуйте їх на пошту Gmail.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewsPage,
});

type Ann = {
  id: string;
  course_id: string;
  title: string;
  body: string;
  links: string;
  sent_count: number;
  created_at: string;
};
type Sub = { id: string; course_id: string; email: string; name: string };

const fmt = (s: string) =>
  new Date(s).toLocaleString("uk-UA", { dateStyle: "medium", timeStyle: "short" });

function NewsPage() {
  const { user, isTeacher, loading } = useAuth();
  const { courses } = useContent(false);
  const [items, setItems] = useState<Ann[]>([]);
  const [mySubs, setMySubs] = useState<string[]>([]);
  const [filter, setFilter] = useState("all");
  const title = (id: string) => courses.find((c) => c.id === id)?.title ?? "Курс";

  const loadFeed = useCallback(async () => {
    if (!user) return setItems([]);
    const { data } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false });
    setItems((data as Ann[]) ?? []);
  }, [user]);

  const loadSubs = useCallback(async () => {
    if (!user) return setMySubs([]);
    const { data } = await supabase
      .from("announcement_subscriptions")
      .select("course_id")
      .eq("user_id", user.id);
    setMySubs((data ?? []).map((x) => x.course_id));
  }, [user]);

  useEffect(() => void loadFeed(), [loadFeed]);
  useEffect(() => void loadSubs(), [loadSubs]);

  const signIn = async () => {
    const res = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}/news`,
    });
    if (res.error) toast.error("Не вдалося увійти через Google");
  };

  const toggle = async (courseId: string) => {
    if (!user) return;
    if (mySubs.includes(courseId)) {
      await supabase
        .from("announcement_subscriptions")
        .delete()
        .eq("user_id", user.id)
        .eq("course_id", courseId);
      toast.success("Підписку скасовано");
    } else {
      const { error } = await supabase.from("announcement_subscriptions").insert({
        user_id: user.id,
        course_id: courseId,
        email: (user.email ?? "").toLowerCase(),
        name:
          (user.user_metadata?.["full_name"] as string | undefined) ?? user.email?.split("@")[0] ?? "",
      });
      if (error) toast.error("Не вдалося підписатися");
      else toast.success("Ви підписалися — оголошення надходитимуть на пошту");
    }
    void loadSubs();
    void loadFeed();
  };

  const remove = async (a: Ann) => {
    if (!confirm(`Видалити оголошення «${a.title}» зі стрічки?`)) return;
    await supabase.from("announcements").delete().eq("id", a.id);
    void loadFeed();
  };

  const visible = items.filter((a) => filter === "all" || a.course_id === filter);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10">
      <Link to="/" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
        ← До курсів
      </Link>
      <h1 className="mt-3 flex items-center gap-2 text-3xl font-semibold">
        <Rss className="size-7 text-primary" /> Оголошення курсів
      </h1>
      <p className="mt-2 text-muted-foreground">
        Новини й оголошення викладача. Підпишіться на свій курс — і кожне нове оголошення прийде
        листом на вашу пошту Gmail.
      </p>

      {!loading && !user && (
        <div className="mt-6 rounded-2xl border border-border bg-card p-5">
          <p className="mb-3">Щоб підписатися на оголошення, увійдіть через Google.</p>
          <Button onClick={() => void signIn()}>Увійти через Google</Button>
        </div>
      )}

      {user && (
        <p className="mt-4 text-sm text-muted-foreground">
          Ви увійшли як <b>{user.email}</b>
          {isTeacher && " (викладач)"} ·{" "}
          <button className="underline-offset-4 hover:underline" onClick={() => void supabase.auth.signOut()}>
            Вийти
          </button>
        </p>
      )}

      {user && !isTeacher && (
        <section className="mt-6 rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold">Підписка на оголошення</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Оберіть курси, оголошення яких хочете отримувати на {user.email}.
          </p>
          <div className="space-y-2">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center justify-between gap-3 text-sm">
                <span>{c.title}</span>
                <Switch checked={mySubs.includes(c.id)} onCheckedChange={() => void toggle(c.id)} />
              </label>
            ))}
          </div>
        </section>
      )}

      {isTeacher && (
        <>
          <PublishForm courses={courses} onDone={loadFeed} />
          <Subscribers courses={courses} />
        </>
      )}

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-xl font-semibold">Стрічка</h2>
          <select
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">Усі курси</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
        </div>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Оголошень поки немає.</p>
        ) : (
          <div className="space-y-3">
            {visible.map((a) => (
              <article key={a.id} className="rounded-2xl border border-border bg-card p-5 shadow-soft">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {title(a.course_id)} · {fmt(a.created_at)}
                      {isTeacher && ` · надіслано листів: ${a.sent_count}`}
                    </p>
                    <h3 className="mt-1 font-semibold">{a.title}</h3>
                  </div>
                  {isTeacher && (
                    <Button variant="ghost" size="icon" aria-label="Видалити" onClick={() => void remove(a)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm">{a.body}</p>
                {a.links && (
                  <ul className="mt-2 space-y-1 text-sm">
                    {a.links.split("\n").filter(Boolean).map((l) => (
                      <li key={l}>
                        <a href={l} target="_blank" rel="noreferrer" className="break-all text-primary underline">
                          {l}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

function PublishForm({
  courses,
  onDone,
}: {
  courses: { id: string; title: string }[];
  onDone: () => void;
}) {
  const publish = useServerFn(publishAnnouncement);
  const [course, setCourse] = useState("");
  const [t, setT] = useState("");
  const [body, setBody] = useState("");
  const [links, setLinks] = useState("");
  const [busy, setBusy] = useState(false);
  const courseId = course || courses[0]?.id || "";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ct = courses.find((c) => c.id === courseId)?.title ?? "";
    if (!confirm(`Опублікувати оголошення й надіслати підписникам курсу «${ct}»?`)) return;
    setBusy(true);
    try {
      const r = await publish({ data: { courseId, courseTitle: ct, title: t, body, links } });
      toast.success(`Опубліковано. Надіслано листів: ${r.sent} з ${r.total}`);
      setT("");
      setBody("");
      setLinks("");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не вдалося опублікувати");
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <h2 className="font-semibold">Нове оголошення</h2>
      <Label className="text-sm">Для слухачів курсу</Label>
      <select
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={courseId}
        onChange={(e) => setCourse(e.target.value)}
      >
        {courses.map((c) => (
          <option key={c.id} value={c.id}>
            {c.title}
          </option>
        ))}
      </select>
      <Input placeholder="Заголовок" value={t} onChange={(e) => setT(e.target.value)} maxLength={200} required />
      <Textarea placeholder="Текст оголошення" value={body} onChange={(e) => setBody(e.target.value)} rows={5} required />
      <Textarea
        placeholder="Посилання (необов'язково, кожне з нового рядка)"
        value={links}
        onChange={(e) => setLinks(e.target.value)}
        rows={2}
      />
      <Button type="submit" disabled={busy}>
        {busy ? "Публікую…" : "Опублікувати й надіслати"}
      </Button>
    </form>
  );
}

function Subscribers({ courses }: { courses: { id: string; title: string }[] }) {
  const [subs, setSubs] = useState<Sub[]>([]);
  const [show, setShow] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase
      .from("announcement_subscriptions")
      .select("id, course_id, email, name")
      .order("email");
    setSubs((data as Sub[]) ?? []);
  }, []);
  useEffect(() => {
    if (show) void load();
  }, [show, load]);

  const unsub = async (s: Sub) => {
    if (!confirm(`Відписати ${s.email} від оголошень курсу?`)) return;
    await supabase.from("announcement_subscriptions").delete().eq("id", s.id);
    void load();
  };
  const unsubAll = async (courseId: string, title: string, n: number) => {
    if (!confirm(`Відписати всіх (${n}) від оголошень курсу «${title}»?`)) return;
    await supabase.from("announcement_subscriptions").delete().eq("course_id", courseId);
    void load();
  };

  return (
    <section className="mt-6 rounded-2xl border border-border bg-card p-5">
      <button className="font-semibold underline-offset-4 hover:underline" onClick={() => setShow((v) => !v)}>
        {show ? "▾" : "▸"} Підписники на оголошення
      </button>
      {show &&
        courses.map((c) => {
          const list = subs.filter((s) => s.course_id === c.id);
          return (
            <div key={c.id} className="mt-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">
                  {c.title} ({list.length})
                </h3>
                {list.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => void unsubAll(c.id, c.title, list.length)}>
                    Відписати всіх
                  </Button>
                )}
              </div>
              <ul className="mt-2 divide-y divide-border text-sm">
                {list.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 py-1.5">
                    <span>
                      {s.name} <span className="text-muted-foreground">({s.email})</span>
                    </span>
                    <Button variant="ghost" size="icon" aria-label="Відписати" onClick={() => void unsub(s)}>
                      <Trash2 className="text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
    </section>
  );
}
