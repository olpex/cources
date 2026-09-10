import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** Read-only (PDF-like) preview URL for a Google Doc / Drive file. */
export function toReadOnlyDocUrl(url: string): string {
  const docId = url.match(/\/document\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (docId) return `https://docs.google.com/document/d/${docId}/preview`;
  const fileId = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (fileId) return `https://drive.google.com/file/d/${fileId}/preview`;
  const openId = url.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
  if (openId) return `https://drive.google.com/file/d/${openId}/preview`;
  return url;
}

/** Fill-in (embedded) URL for a Google Form. */
export function toFormFillUrl(url: string): string {
  const clean = url.replace(/\/edit(\?.*)?$/, "/viewform");
  return clean.includes("?") ? `${clean}&embedded=true` : `${clean}?embedded=true`;
}

export function DocViewer({
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[98vh] w-[99vw] max-w-none flex-col gap-1 p-1.5">
        <DialogHeader className="space-y-0 px-1 pr-8">
          <DialogTitle className="truncate text-xs font-medium text-muted-foreground">
            {title}
          </DialogTitle>
        </DialogHeader>
        {url ? (
          <iframe
            key={url}
            src={url}
            title={title}
            className="h-full w-full flex-1 rounded-md border border-border bg-card"
            allowFullScreen
          />
        ) : (
          <p className="text-sm text-muted-foreground">Не вдалося відкрити документ.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}
