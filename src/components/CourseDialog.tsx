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
  onSave: (data: { title: string; subtitle: string; description: string }) => void;
};

export function CourseDialog({ open, onOpenChange, course, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setTitle(course?.title ?? "");
    setSubtitle(course?.subtitle ?? "");
    setDescription(course?.description ?? "");
  }, [open, course]);

  const valid = title.trim().length > 0 && title.trim().length <= 120;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
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
