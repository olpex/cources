import { useState } from "react";
import { Loader2, Download } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
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
import { importGoogleDoc } from "@/lib/gdocs.functions";
import type { ParsedDoc } from "@/lib/gdocs-parse";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** existing course to refresh; empty for a brand-new course */
  courseId?: string | undefined;
  defaultUrl?: string | undefined;
  onImported: (doc: ParsedDoc, url: string, courseId?: string) => void;
};

export function ImportDocDialog({ open, onOpenChange, courseId, defaultUrl, onImported }: Props) {
  const runImport = useServerFn(importGoogleDoc);
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setLoading(true);
    setError(null);
    try {
      const doc = await runImport({ data: { url } });
      onImported(doc, url, courseId);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не вдалося імпортувати документ");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setError(null);
        if (o) setUrl(defaultUrl ?? "");
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {courseId ? "Оновити курс із Google Документа" : "Додати курс із Google Документа"}
          </DialogTitle>
          <DialogDescription>
            Кожна вкладка документа стає модулем: посилання зверху вкладки — кнопка «Показати
            презентацію», а заголовки другого рівня — назви слайдів у нотатках.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="doc-url">Посилання на Google Документ</Label>
          <Input
            id="doc-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://docs.google.com/document/d/…"
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button onClick={submit} disabled={loading || !url.trim()}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
            {courseId ? "Оновити" : "Імпортувати"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
