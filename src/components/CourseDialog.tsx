import { useEffect, useState } from "react";
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
import type { CourseItem } from "@/data/store";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: CourseItem | null;
  onSave: (data: { title: string; subtitle: string; description: string; viberUrl: string; knowledgeBaseUrl: string; expectationsUrl: string; expectationsVisible: boolean }) => void;
};

export function CourseDialog({ open, onOpenChange, course, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [viberUrl, setViberUrl] = useState("");
  const [knowledgeBaseUrl, setKnowledgeBaseUrl] = useState("");
  const [expectationsUrl, setExpectationsUrl] = useState("");
  const [expectationsVisible, setExpectationsVisible] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(course?.title ?? "");
    setSubtitle(course?.subtitle ?? "");
    setDescription(course?.description ?? "");
    setViberUrl(course?.viberUrl ?? "");
    setKnowledgeBaseUrl(course?.knowledgeBaseUrl ?? "");
    setExpectationsUrl(course?.expectationsUrl ?? "");
    setExpectationsVisible(course?.expectationsVisible ?? false);
  }, [open, course]);

  const validLink = (value: string) => {
    if (!value.trim()) return true;
    try {
      const url = new URL(value.trim());
      return url.protocol === "https:";
    } catch {
      return false;
    }
  };
  const valid = title.trim().length > 0 && title.trim().length <= 120 && validLink(viberUrl) && validLink(knowledgeBaseUrl) && validLink(expectationsUrl);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{course ? "Редагувати курс" : "Новий курс"}</DialogTitle>
          <DialogDescription>
            Назва курсу відображається як окремий розділ на лендінгу.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="c-title">Назва курсу</Label>
            <Input
              id="c-title"
              value={title}
              maxLength={120}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Наприклад: Штучний інтелект"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-sub">Підзаголовок</Label>
            <Input
              id="c-sub"
              value={subtitle}
              maxLength={160}
              onChange={(e) => setSubtitle(e.target.value)}
              placeholder="Коротке уточнення теми"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-desc">Опис</Label>
            <Textarea
              id="c-desc"
              value={description}
              maxLength={600}
              rows={4}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Про що цей курс"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-viber">Посилання на Viber-спільноту курсу</Label>
            <Input id="c-viber" type="url" value={viberUrl} onChange={(e) => setViberUrl(e.target.value)} placeholder="https://invite.viber.com/…" aria-invalid={!validLink(viberUrl)} />
            {!validLink(viberUrl) && <p className="text-sm text-destructive">Введіть повне посилання, що починається з https://</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-knowledge">Посилання на Viber-базу знань курсу</Label>
            <Input id="c-knowledge" type="url" value={knowledgeBaseUrl} onChange={(e) => setKnowledgeBaseUrl(e.target.value)} placeholder="https://invite.viber.com/…" aria-invalid={!validLink(knowledgeBaseUrl)} />
            {!validLink(knowledgeBaseUrl) && <p className="text-sm text-destructive">Введіть повне посилання, що починається з https://</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="c-expect">PDF «Синхронізація очікувань» (посилання з Google Диску)</Label>
            <Input id="c-expect" type="url" value={expectationsUrl} onChange={(e) => setExpectationsUrl(e.target.value)} placeholder="https://drive.google.com/file/d/…" aria-invalid={!validLink(expectationsUrl)} />
            {!validLink(expectationsUrl) && <p className="text-sm text-destructive">Введіть повне посилання, що починається з https://</p>}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={expectationsVisible} onChange={(e) => setExpectationsVisible(e.target.checked)} className="size-4 accent-primary" />
              Показувати кнопку студентам
            </label>
            <p className="text-xs text-muted-foreground">Відкрийте доступ до файлу «Усі, хто має посилання».</p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Скасувати
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              onSave({
                title: title.trim(),
                subtitle: subtitle.trim(),
                description: description.trim(),
                viberUrl: viberUrl.trim(),
                knowledgeBaseUrl: knowledgeBaseUrl.trim(),
                expectationsUrl: expectationsUrl.trim(),
                expectationsVisible,
              });
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
