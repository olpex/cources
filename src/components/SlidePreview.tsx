import { useEffect, useRef, useState } from "react";

/** Build an Office/OneDrive embed URL pointing at a specific slide index. */
export function slideEmbedUrl(url: string, index: number): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    u.searchParams.set("em", "2");
    u.searchParams.set("action", "embedview");
    u.searchParams.set("wdAr", "1.7777777777777777");
    u.searchParams.set("wdSlideIndex", String(index));
    return u.toString();
  } catch {
    return null;
  }
}

type Props = { url: string; index: number; title: string };

/** Lazy-mounted 16:9 preview of a single presentation slide. */
export function SlidePreview({ url, index, title }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const src = slideEmbedUrl(url, index);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      },
      { rootMargin: "600px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  return (
    <div
      ref={ref}
      className="sticky top-4 aspect-video w-full overflow-hidden rounded-xl border border-paper-border bg-muted"
    >
      {visible && src ? (
        <iframe
          src={src}
          title={`Слайд ${index}: ${title}`}
          className="size-full"
          loading="lazy"
          allowFullScreen
        />
      ) : (
        <div className="flex size-full items-center justify-center text-xs text-paper-muted">
          {src ? "Завантаження слайда…" : "Немає посилання на презентацію"}
        </div>
      )}
    </div>
  );
}
