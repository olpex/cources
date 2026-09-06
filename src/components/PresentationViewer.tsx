import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function toViewOnlyUrl(url: string): string | null {
  const id = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (id)
    return `https://docs.google.com/presentation/d/${id}/embed?start=false&loop=false&rm=minimal`;
  const docId = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (docId) return `https://docs.google.com/document/d/${docId}/preview`;
  return null;
}

export function PresentationViewer({
  title,
  url,
  open,
  onOpenChange,
}: {
  title: string;
  url: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const base = url ? toViewOnlyUrl(url) : null;
  const isSlides = !!base?.includes("/presentation/");
  const [slide, setSlide] = useState(1);

  useEffect(() => {
    if (open) setSlide(1);
  }, [open, url]);

  const src = base ? (isSlides ? `${base}#slide=${slide}` : base) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
        </DialogHeader>
        {src ? (
          <>
            <iframe
              key={src}
              src={src}
              title={title}
              className="h-full w-full flex-1 rounded-xl border border-border bg-card"
              allowFullScreen
            />
            {isSlides && (
              <div className="flex items-center justify-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSlide((n) => Math.max(1, n - 1))}
                  disabled={slide === 1}
                >
                  <ChevronLeft className="size-4" />
                  Назад
                </Button>
                <span className="min-w-16 text-center text-sm text-muted-foreground">
                  Слайд {slide}
                </span>
                <Button variant="outline" size="sm" onClick={() => setSlide((n) => n + 1)}>
                  Вперед
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Не вдалося відкрити цю презентацію для перегляду.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
