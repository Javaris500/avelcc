import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

import { cn } from '#/components/cn'

const field = [
  'w-full rounded-xs bg-app-recessed px-2.5',
  'border border-[var(--elevation-border-rest)]',
  'text-sm text-text placeholder:text-text-subtle',
  'disabled:opacity-[var(--opacity-disabled)]',
].join(' ')

export type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  'data-testid': string
}

export function Input({ className, ...props }: InputProps) {
  return <input className={cn(field, 'h-9', className)} {...props} />
}

export type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  'data-testid': string
}

export function Select({ className, ...props }: SelectProps) {
  return <select className={cn(field, 'h-9', className)} {...props} />
}

/**
 * Density is set on the container, never the row — the patch defines
 * --row-pad there so a table can switch between reading and scanning without
 * every row deciding for itself.
 */
export function Density({
  mode,
  className,
  children,
}: {
  mode: 'comfortable' | 'compact'
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={cn(`density-${mode}`, className)}
      data-density={mode}
      data-testid={`density-${mode}`}
    >
      {children}
    </div>
  )
}
