import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function toViewOnlyUrl(url: string): string | null {
  const id = url.match(/\/presentation\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (id) return `https://docs.google.com/presentation/d/${id}/preview`;
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
  const src = url ? toViewOnlyUrl(url) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[92vh] w-[96vw] max-w-none flex-col gap-3 p-4 sm:p-6">
        <DialogHeader className="pr-8">
          <DialogTitle className="text-base sm:text-lg">{title}</DialogTitle>
        </DialogHeader>
        {src ? (
          <iframe
            src={src}
            title={title}
            className="h-full w-full flex-1 rounded-xl border border-border bg-card"
            allowFullScreen
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Не вдалося відкрити цю презентацію для перегляду.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
