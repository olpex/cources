import { cn } from '@/lib/utils';

/** Official multicolor Gmail glyph (the "M" envelope). */
export function GmailIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn('size-4', className)}
    >
      <path
        fill="#4285F4"
        d="M1.636 20.315h3.818V9.955L0 6.451v12.227c0 .904.732 1.637 1.636 1.637z"
      />
      <path
        fill="#34A853"
        d="M18.545 20.315h3.818c.904 0 1.636-.733 1.636-1.637V6.45l-5.454 3.505z"
      />
      <path
        fill="#FBBC04"
        d="M18.545 4.092v5.863L24 6.45V4.91c0-2.023-2.309-3.178-3.927-1.963z"
      />
      <path
        fill="#EA4335"
        d="M5.455 9.955V4.092L12 9.046l6.545-4.954v5.863L12 14.909z"
      />
      <path
        fill="#C5221F"
        d="M0 4.91v1.541l5.455 3.505V4.092L3.927 2.947C2.309 1.733 0 2.888 0 4.91z"
      />
    </svg>
  );
}
