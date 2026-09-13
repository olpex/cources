/** Pure parsing helpers for Google Docs API responses (tabs → modules → slides). */

export type NoteBlock = {
  type: "p" | "li" | "h";
  text: string;
  /** indentation / list nesting level */
  level?: number;
};

export type ParsedSlide = {
  title: string;
  blocks: NoteBlock[];
};

export type ParsedModule = {
  tabId: string;
  title: string;
  url: string;
  /** PDF/Google Doc summary ("Конспект") — first link after the notes */
  summaryUrl?: string;
  /** Google Form test ("Тест") — second link after the notes */
  testUrl?: string;
  slides: ParsedSlide[];
};

export type ParsedDoc = {
  docId: string;
  title: string;
  modules: ParsedModule[];
};

/** Extract the document id from any Google Docs URL or a raw id. */
export function extractDocId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  const match = value.match(/\/document\/d\/([a-zA-Z0-9_-]{20,})/);
  if (match?.[1]) return match[1];
  if (/^[a-zA-Z0-9_-]{20,}$/.test(value)) return value;
  return null;
}

type GDocElement = {
  textRun?: { content?: string; textStyle?: { link?: { url?: string } } };
};

type GDocParagraph = {
  elements?: GDocElement[];
  paragraphStyle?: { namedStyleType?: string; indentStart?: { magnitude?: number } };
  bullet?: { nestingLevel?: number };
};

type GDocStructuralElement = {
  paragraph?: GDocParagraph;
  table?: { tableRows?: { tableCells?: { content?: GDocStructuralElement[] }[] }[] };
};

type GDocTab = {
  tabProperties?: { tabId?: string; title?: string };
  documentTab?: { body?: { content?: GDocStructuralElement[] } };
  childTabs?: GDocTab[];
};

export type GDocResponse = {
  documentId?: string;
  title?: string;
  tabs?: GDocTab[];
};

function paragraphText(p: GDocParagraph): string {
  return (p.elements ?? [])
    .map((e) => e.textRun?.content ?? "")
    .join("")
    .replace(/\u000b/g, " ")
    .trim();
}

function paragraphLink(p: GDocParagraph): string | null {
  for (const e of p.elements ?? []) {
    const url = e.textRun?.textStyle?.link?.url;
    if (url) return url;
  }
  const text = paragraphText(p);
  const bare = text.match(/https?:\/\/\S+/);
  return bare ? bare[0] : null;
}

function paragraphLinks(p: GDocParagraph): string[] {
  const urls = new Set<string>();
  for (const e of p.elements ?? []) {
    const url = e.textRun?.textStyle?.link?.url;
    if (url) urls.add(url);
  }
  const text = paragraphText(p);
  const bare = text.match(/https?:\/\/\S+/g);
  if (bare) bare.forEach((u) => urls.add(u));
  return Array.from(urls);
}

function extractTrailingLinks(
  paragraphs: GDocParagraph[],
  mainUrl: string,
): { summaryUrl?: string | undefined; testUrl?: string | undefined } {
  const links: string[] = [];
  for (let i = paragraphs.length - 1; i >= 0; i--) {
    const p = paragraphs[i];
    if (!p) continue;
    const text = paragraphText(p);
    const urls = paragraphLinks(p).filter((u) => u !== mainUrl);
    if (urls.length) {
      for (const u of urls.reverse()) links.unshift(u);
      continue;
    }
    if (!text) continue;
    if (text.split(/\s+/).length > 4) break;
  }
  const tail = links.slice(-2);
  const testUrl = tail.find(isFormLink) ?? (tail.length > 1 ? tail[1] : undefined);
  const summaryUrl = tail.find((l) => l !== testUrl);
  return { summaryUrl, testUrl };
}

function flatten(content: GDocStructuralElement[]): GDocParagraph[] {
  const out: GDocParagraph[] = [];
  for (const el of content) {
    if (el.paragraph) out.push(el.paragraph);
    if (el.table) {
      for (const row of el.table.tableRows ?? []) {
        for (const cell of row.tableCells ?? []) {
          out.push(...flatten(cell.content ?? []));
        }
      }
    }
  }
  return out;
}

function isHeading(style: string | undefined) {
  return !!style && style.startsWith("HEADING_");
}

function headingLevel(style: string | undefined) {
  const n = Number(style?.replace("HEADING_", ""));
  return Number.isFinite(n) ? n : 2;
}

function isFormLink(url: string) {
  return /forms\.gle|docs\.google\.com\/forms/i.test(url);
}

function parseTab(tab: GDocTab, parentTitle?: string): ParsedModule {
  const paragraphs = flatten(tab.documentTab?.body?.content ?? []);
  const slides: ParsedSlide[] = [];
  let url = "";
  let current: ParsedSlide | null = null;
  let seenHeading = false;

  for (const p of paragraphs) {
    const text = paragraphText(p);
    const style = p.paragraphStyle?.namedStyleType;
    const link = paragraphLink(p);

    if (!seenHeading && !url && link) {
      url = link;
      continue;
    }
    if (!text) continue;

    if (isHeading(style)) {
      const level = headingLevel(style);
      if (level <= 2 || !current) {
        seenHeading = true;
        current = { title: text, blocks: [] };
        slides.push(current);
        continue;
      }
      current.blocks.push({ type: "h", text, level });
      continue;
    }

    if (!current) {
      current = { title: "Вступ", blocks: [] };
      slides.push(current);
    }

    const nesting = p.bullet?.nestingLevel;
    const indentPt = p.paragraphStyle?.indentStart?.magnitude ?? 0;
    if (nesting !== undefined) {
      current.blocks.push({ type: "li", text, level: nesting });
    } else {
      const level = indentPt >= 18 ? Math.min(3, Math.round(indentPt / 18)) : 0;
      current.blocks.push({ type: "p", text, level });
    }
  }

  const { summaryUrl, testUrl } = extractTrailingLinks(paragraphs, url);

  const title = tab.tabProperties?.title?.trim() || "Без назви";
  return {
    tabId: tab.tabProperties?.tabId ?? title,
    title: parentTitle ? `${parentTitle} — ${title}` : title,
    url,
    ...(summaryUrl ? { summaryUrl } : {}),
    ...(testUrl ? { testUrl } : {}),
    slides: slides.filter((s) => s.blocks.length > 0 || s.title),
  };
}

export function parseGoogleDoc(doc: GDocResponse, docId: string): ParsedDoc {
  const modules: ParsedModule[] = [];
  const walk = (tabs: GDocTab[], parent?: string) => {
    for (const tab of tabs) {
      const parsed = parseTab(tab, parent);
      modules.push(parsed);
      if (tab.childTabs?.length) {
        walk(tab.childTabs, tab.tabProperties?.title?.trim() || undefined);
      }
    }
  };
  walk(doc.tabs ?? []);
  return { docId: doc.documentId ?? docId, title: doc.title ?? "Курс", modules };
}
