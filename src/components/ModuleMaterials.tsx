import { useState } from "react";
import { ChevronDown, ExternalLink, Paperclip, Plus, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uid, type MaterialItem } from "@/data/store";

function sourceLabel(url: string) {
  if (/drive\.google|docs\.google/i.test(url)) return "Google Диск";
  if (/onedrive|1drv\.ms|sharepoint/i.test(url)) return "OneDrive";
  if (/gemini\.google|g\.co\/gemini/i.test(url)) return "Gemini";
  if (/claude\.(ai|site)/i.test(url)) return "Claude";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function ModuleMaterials({
  materials,
  edit,
  onChange,
}: {
  materials: MaterialItem[];
  edit: boolean;
  onChange: (next: MaterialItem[]) => void;
}) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!edit && materials.length === 0) return null;

  const add = () => {
    const u = url.trim();
    try {
      const parsed = new URL(u);
      if (!/^https?:$/.test(parsed.protocol)) throw new Error();
    } catch {
      setError("Вкажіть коректне посилання (https://…)");
      return;
    }
    const t = title.trim() || sourceLabel(u) || u;
    onChange([...materials, { id: uid(), title: t.slice(0, 200), url: u }]);
    setTitle("");
    setUrl("");
    setError(null);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          <Paperclip className="size-4" />
          Додаткові матеріали{materials.length ? ` (${materials.length})` : ""}
          <ChevronDown className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-2">
        {materials.length === 0 ? (
          <p className="px-2 py-1.5 text-sm text-muted-foreground">Матеріалів ще немає.</p>
        ) : (
          <ul className="max-h-72 space-y-0.5 overflow-y-auto">
            {materials.map((mat) => (
              <li key={mat.id} className="flex items-center gap-1">
                <a
                  href={mat.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={mat.title}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
                >
                  <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{mat.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {sourceLabel(mat.url)}
                  </span>
                </a>
                {edit && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7 shrink-0"
                    aria-label="Видалити матеріал"
                    onClick={() => onChange(materials.filter((x) => x.id !== mat.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {edit && (
          <div className="mt-2 space-y-1.5 border-t border-border pt-2">
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Тема матеріалу"
              className="h-8 text-sm"
            />
            <div className="flex gap-1.5">
              <Input
                value={url}
                maxLength={2000}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="https://…"
                className="h-8 text-sm"
              />
              <Button size="sm" className="h-8" onClick={add}>
                <Plus className="size-4" />
              </Button>
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
