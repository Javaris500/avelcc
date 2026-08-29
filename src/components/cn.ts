import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Conventionally this lives at src/lib/utils.ts. It is here because src/lib/
 * is not in this session's mount — src/lib/git/** and src/lib/blast/** belong
 * to session 2. Documented workaround, not a silent relocation.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
