import { cn } from '@/lib/utils';

/** Official YouTube brand glyph: white play triangle on a red rounded rectangle. */
export function YoutubeIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4', className)}>
      <path
        fill="#FF0000"
        d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19C0 8.07 0 12 0 12s0 3.93.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14C24 15.93 24 12 24 12s0-3.93-.5-5.81z"
      />
      <path fill="#FFFFFF" d="M9.55 15.57V8.43L15.82 12l-6.27 3.57z" />
    </svg>
  );
}
