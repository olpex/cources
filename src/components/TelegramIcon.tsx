import { cn } from '@/lib/utils';

/** Official Telegram brand glyph (Simple Icons), filled with Telegram blue. */
export function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('size-4', className)}>
      <circle cx="12" cy="12" r="12" fill="#26A5E4" />
      <path
        fill="#FFFFFF"
        d="M5.43 11.87c3.5-1.52 5.83-2.53 7-3.02 3.33-1.39 4.02-1.63 4.47-1.64.1 0 .32.02.47.14.12.1.15.23.17.33.02.09.04.3.02.47-.18 1.9-.96 6.5-1.36 8.63-.17.9-.5 1.2-.82 1.23-.7.06-1.23-.46-1.9-.9-1.06-.7-1.65-1.13-2.68-1.8-1.19-.79-.42-1.22.26-1.93.18-.18 3.25-2.98 3.31-3.23.01-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.1.02-1.79 1.14-5.06 3.35-.48.33-.91.49-1.3.48-.43-.01-1.25-.24-1.86-.44-.75-.24-1.35-.37-1.3-.79.03-.22.33-.44.89-.66z"
      />
    </svg>
  );
}
