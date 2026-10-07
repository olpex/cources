import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Loader2, Plus, Trash2, Youtube } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { fetchYoutubeInfo } from "@/lib/youtube.functions";
import { uid, type VideoItem } from "@/data/store";

function sortVideos(list: VideoItem[]) {
  return [...list].sort((a, b) => {
    const ta = a.publishedAt ? Date.parse(a.publishedAt) : Infinity;
    const tb = b.publishedAt ? Date.parse(b.publishedAt) : Infinity;
    return ta - tb;
  });
}

function fmt(d?: string | null) {
  if (!d) return "дата невідома";
  return new Date(d).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" });
}

type Props = {
  videos: VideoItem[];
  edit: boolean;
  onChange: (videos: VideoItem[]) => void;
};

export function CourseVideos({ videos, edit, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const getInfo = useServerFn(fetchYoutubeInfo);
  const [found, setFound] = useState<Record<string, string>>({});
  const tried = useRef(new Set<string>());

  // Fill in missing publish dates for videos added earlier.
  useEffect(() => {
    const missing = videos.filter((v) => !v.publishedAt && !tried.current.has(v.videoId));
    if (missing.length === 0) return;
    missing.forEach((v) => tried.current.add(v.videoId));
    void (async () => {
      const got: Record<string, string> = {};
      for (const v of missing) {
        try {
          const info = await getInfo({ data: { url: v.url } });
          if (info.publishedAt) got[v.videoId] = info.publishedAt;
        } catch {
          /* ignore */
        }
      }
      if (Object.keys(got).length === 0) return;
      setFound((f) => ({ ...f, ...got }));
      if (edit) {
        onChange(videos.map((v) => { const p = got[v.videoId]; return p ? { ...v, publishedAt: p } : v; }));
      }
    })();
  }, [videos, edit, getInfo, onChange]);

  const list = sortVideos(
    videos.map((v) => { const p = found[v.videoId]; return !v.publishedAt && p ? { ...v, publishedAt: p } : v; }),
  );

  if (!edit && list.length === 0) return null;

  const add = async () => {
    setError(null);
    setBusy(true);
    try {
      const info = await getInfo({ data: { url } });
      if (videos.some((v) => v.videoId === info.videoId)) {
        setError("Це відео вже є у списку");
        return;
      }
      onChange(
        sortVideos([
          ...videos,
          {
            id: uid(),
            videoId: info.videoId,
            url: `https://www.youtube.com/watch?v=${info.videoId}`,
            title: info.title,
            ...(info.publishedAt ? { publishedAt: info.publishedAt } : {}),
          },
        ]),
      );
      setUrl("");
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося додати відео");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-2xl border border-border bg-card shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <Youtube className="size-5 text-primary" />
          </span>
          <span>
            <span className="block font-semibold">Записи занять на YouTube</span>
            <span className="block text-sm text-muted-foreground">
              {list.length} {list.length === 1 ? "відео" : "відео"} · у порядку публікації
            </span>
          </span>
        </span>
        <ChevronDown className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="border-t border-border px-3 py-2">
          {list.length === 0 && (
            <p className="px-2 py-3 text-sm text-muted-foreground">Відео ще не додано.</p>
          )}
          <ul className="max-h-96 overflow-y-auto">
            {list.map((v, i) => (
              <li key={v.id} className="flex items-center gap-2">
                <a
                  href={v.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-1 items-baseline gap-3 rounded-lg px-2 py-2.5 hover:bg-secondary"
                >
                  <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="w-24 shrink-0 text-sm tabular-nums text-muted-foreground">
                    {fmt(v.publishedAt)}
                  </span>
                  <span className="text-sm font-medium">{v.title}</span>
                </a>
                {edit && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Видалити відео"
                    onClick={() => onChange(videos.filter((x) => x.id !== v.id))}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {edit && (
        <div className="border-t border-border px-5 py-3">
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && url.trim() && !busy && void add()}
              placeholder="Посилання на відео YouTube"
              maxLength={500}
            />
            <Button onClick={() => void add()} disabled={!url.trim() || busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Додати
            </Button>
          </div>
          {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
