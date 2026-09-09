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
  const [slideInput, setSlideInput] = useState("1");

  useEffect(() => {
    if (open) {
      setSlide(1);
      setSlideInput("1");
    }
  }, [open, url]);

  useEffect(() => {
    setSlideInput(String(slide));
  }, [slide]);

  const commitSlide = () => {
    const n = Number.parseInt(slideInput, 10);
    if (Number.isFinite(n) && n >= 1) setSlide(n);
    else setSlideInput(String(slide));
  };

  const src = base ? (isSlides ? `${base}#slide=${slide}` : base) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[98vh] w-[99vw] max-w-none flex-col gap-1 p-1.5">
        <DialogHeader className="space-y-0 px-1 pr-8">
          <DialogTitle className="truncate text-xs font-medium text-muted-foreground">
            {title}
          </DialogTitle>
        </DialogHeader>
        {src ? (
          <>
            <iframe
              key={src}
              src={src}
              title={title}
              className="h-full w-full flex-1 rounded-md border border-border bg-card"
              allowFullScreen
            />
            {isSlides && (
              <div className="flex items-center justify-center gap-2 pb-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSlide((n) => Math.max(1, n - 1))}
                  disabled={slide === 1}
                >
                  <ChevronLeft className="size-3.5" />
                  Назад
                </Button>
                <span className="text-xs text-muted-foreground">Слайд</span>
                <input
                  type="number"
                  min={1}
                  value={slideInput}
                  onChange={(e) => setSlideInput(e.target.value)}
                  onBlur={() => commitSlide()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitSlide();
                    }
                  }}
                  aria-label="Номер слайда"
                  className="h-7 w-14 rounded-md border border-border bg-background px-2 text-center text-xs"
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setSlide((n) => n + 1)}
                >
                  Вперед
                  <ChevronRight className="size-3.5" />
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
