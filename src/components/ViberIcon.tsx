import { cn } from '@/lib/utils';

/** Official Viber brand glyph (Simple Icons), filled with the Viber purple. */
export function ViberIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="#7360F2"
      aria-hidden="true"
      className={cn('size-4', className)}
    >
      <path d="' + path + '" />
    </svg>
  );
}
