import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { builtinNotesText, type ModuleItem } from "@/data/store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  module?: ModuleItem | null;
  onSave: (data: { title: string; url: string; notes: string }) => void;
};

function isValidUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const u = new URL(value.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ModuleDialog({ open, onOpenChange, module, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [loadingNotes, setLoadingNotes] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(module?.title ?? "");
    setUrl(module?.url ?? "");
    setNotes(module?.notes ?? "");

    if (module && module.notes === undefined && module.builtinNotesId) {
      let cancelled = false;
      setLoadingNotes(true);
      builtinNotesText(module.builtinNotesId)
        .then((text) => {
          if (!cancelled) setNotes(text);
        })
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) setLoadingNotes(false);
        });
      return () => {
        cancelled = true;
      };
    }
    return undefined;
  }, [open, module]);

  const urlOk = isValidUrl(url);
  const valid = title.trim().length > 0 && title.trim().length <= 160 && urlOk && !loadingNotes;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[90vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{module ? "Редагувати модуль" : "Новий модуль"}</DialogTitle>
          <DialogDescription>
            Назва теми, посилання на презентацію та нотатки викладача.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="space-y-2">
            <Label htmlFor="m-title">Назва модуля</Label>
            <Input
              id="m-title"
              value={title}
              maxLength={160}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Наприклад: Ефективний пошук інформації"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-url">Посилання на презентацію</Label>
            <Input
              id="m-url"
              value={url}
              maxLength={2000}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…"
            />
            {!urlOk && (
              <p className="text-sm text-destructive">
                Вкажіть коректне посилання, що починається з https://
              </p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="m-notes">
              Нотатки{" "}
              {loadingNotes && (
                <span className="ml-1 inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> завантаження…
                </span>
              )}
            </Label>
            <Textarea
              id="m-notes"
              value={notes}
              rows={12}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                "Слайд 1 — Вступ\n\nТекст нотатки…\n\n———\n\nСлайд 2 — Тема\n\nТекст нотатки…"
              }
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Розділяйте слайди рядком «———». Перший рядок блоку стає заголовком слайда.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onSave({ title: title.trim(), url: url.trim(), notes });
              onOpenChange(false);
            }}
          >
            Зберегти
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
