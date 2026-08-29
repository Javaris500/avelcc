/** A labelled rule. aria-hidden because it is decoration, not structure. */
export function OrDivider() {
  return (
    <div aria-hidden="true" className="flex items-center gap-3 py-1" data-testid="login-divider">
      <span className="h-px flex-1 bg-[var(--elevation-border-rest)]" />
      <span className="font-mono text-micro tracking-wider text-text-subtle uppercase">or</span>
      <span className="h-px flex-1 bg-[var(--elevation-border-rest)]" />
    </div>
  )
}
