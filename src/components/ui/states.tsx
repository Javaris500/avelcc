import type { ReactNode } from 'react'

import { Button } from '#/components/ui/button'
import { cn } from '#/components/cn'

/**
 * Empty is a designed screen, not a blank. ROUTES.md on the mission list:
 * "this is the screen a new operator sees before anything exists. Design it as
 * onboarding, not as a blank table."
 */
export function EmptyState({
  title,
  body,
  action,
  className,
}: {
  title: string
  body: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-start gap-2 px-6 py-14', className)}
      data-testid="empty-state"
    >
      <p className="font-display text-[15px] font-semibold text-text">{title}</p>
      <p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">{body}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  )
}

/**
 * Deliberately prop-driven and contract-free. The error map lands in step 6 and
 * supplies `code`, `title` and `body`; this component never parses a message
 * and never imports a domain type.
 */
export function ErrorState({
  code,
  title,
  body,
  retry,
  className,
}: {
  code: string
  title: string
  body: string
  retry?: () => void
  className?: string
}) {
  return (
    <div
      className={cn('flex flex-col items-start gap-2 px-6 py-14', className)}
      data-testid="error-state"
    >
      <span
        className="font-mono text-[12px] text-gate-block"
        data-testid="error-code"
      >
        {code}
      </span>
      <p className="font-display text-[15px] font-semibold text-text">{title}</p>
      <p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">{body}</p>
      {retry ? (
        <div className="pt-2">
          <Button data-testid="error-retry" onClick={retry} variant="secondary">
            Try again
          </Button>
        </div>
      ) : null}
    </div>
  )
}
