import { createServerFn } from "@tanstack/react-start";

export function extractYoutubeId(url: string): string | null {
  const m = url
    .trim()
    .match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/i);
  return m?.[1] ?? null;
}

export type YoutubeInfo = { videoId: string; title: string; publishedAt: string | null };

export const fetchYoutubeInfo = createServerFn({ method: "POST" })
  .inputValidator((data: { url: string }) => {
    if (!data || typeof data.url !== "string" || data.url.length > 500) {
      throw new Error("Вкажіть посилання на відео YouTube");
    }
    return { url: data.url };
  })
  .handler(async ({ data }): Promise<YoutubeInfo> => {
    const videoId = extractYoutubeId(data.url);
    if (!videoId) throw new Error("Не вдалося розпізнати посилання на YouTube");
    const watch = `https://www.youtube.com/watch?v=${videoId}`;

    let title = "";
    let publishedAt: string | null = null;

    try {
      const r = await fetch(
        `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`,
      );
      if (r.ok) title = ((await r.json()) as { title?: string }).title ?? "";
    } catch {
      /* ignore */
    }

    // 1) Internal player API — works even when the watch page shows a consent wall.
    for (const client of [
      { clientName: "WEB", clientVersion: "2.20240726.00.00" },
      { clientName: "MWEB", clientVersion: "2.20240726.01.00" },
    ]) {
      if (publishedAt && title) break;
      try {
        const r = await fetch("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ context: { client: { ...client, hl: "uk" } }, videoId }),
        });
        if (!r.ok) continue;
        const j = (await r.json()) as {
          videoDetails?: { title?: string };
          microformat?: { playerMicroformatRenderer?: { publishDate?: string; uploadDate?: string } };
        };
        const mf = j.microformat?.playerMicroformatRenderer;
        const raw = mf?.publishDate ?? mf?.uploadDate;
        if (raw && !publishedAt) {
          const d = new Date(raw);
          if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
        }
        if (!title && j.videoDetails?.title) title = j.videoDetails.title;
      } catch {
        /* ignore */
      }
    }

    if (!publishedAt) try {

      const r = await fetch(`${watch}&hl=uk`, {
        headers: {
          "Accept-Language": "uk,en;q=0.8",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          Cookie: "CONSENT=YES+1; SOCS=CAI",
        },
      });
      const html = await r.text();
      const m =
        html.match(/itemprop="(?:uploadDate|datePublished)"\s+content="([^"]+)"/) ??
        html.match(/"publishDate":"([^"]+)"/) ??
        html.match(/"uploadDate":"([^"]+)"/);
      if (m?.[1]) {
        const d = new Date(m[1]);
        if (!Number.isNaN(d.getTime())) publishedAt = d.toISOString();
      }
      if (!title) {
        const t = html.match(/<meta name="title" content="([^"]+)"/);
        if (t?.[1]) title = t[1];
      }
    } catch {
      /* ignore */
    }

    if (!title) throw new Error("Не вдалося отримати дані відео. Перевірте, чи воно публічне.");
    return { videoId, title, publishedAt };
  });
