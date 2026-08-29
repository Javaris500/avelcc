import type { HTMLAttributes } from 'react'

import { cn } from '#/components/cn'

/**
 * Content-shaped skeletons, never a spinner. A skeleton that does not have the
 * shape of the thing it is standing in for teaches the reader nothing about
 * what is coming, and the layout jumps when it resolves.
 */
export function Skeleton({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('skeleton', className)}
      data-testid="skeleton"
      {...props}
    />
  )
}

/** One line of text. `w` is a tailwind width class so callers shape it. */
export function SkeletonLine({ className }: { className?: string }) {
  return <Skeleton className={cn('h-[0.9em] w-full', className)} />
}

/** A table or list row: a leading glyph, a wide label, a trailing value. */
export function SkeletonRow({ className }: { className?: string }) {
  return (
    <div
      className={cn('flex items-center gap-3 py-[var(--row-pad,12px)]', className)}
      data-testid="skeleton-row"
    >
      <Skeleton className="size-4 shrink-0" />
      <SkeletonLine className="max-w-[18ch]" />
      <SkeletonLine className="ml-auto max-w-[8ch]" />
    </div>
  )
}

/** N rows, for a list whose length you cannot know yet. */
export function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div data-testid="skeleton-rows">
      {Array.from({ length: count }, (_, i) => (
        <SkeletonRow key={i} />
      ))}
    </div>
  )
}
