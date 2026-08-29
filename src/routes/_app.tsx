import { Outlet, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useCallback } from 'react'

import { Shell } from '#/components/shell/shell'
import { Button } from '#/components/ui/button'
import { SessionRequiredError, requireSession, signOut } from '#/routes/-lib/session'

/**
 * The authenticated shell. Pathless layout route, so /missions is /missions and
 * not /app/missions — ROUTES.md's tree has no /app segment.
 *
 * ssr: false. The gate reads a client-side session, and server-rendering a
 * screen the client is about to reject produces a flash of the wrong state.
 * STACK-AND-RESOURCES wants Start for server functions and the credential
 * boundary, not for SSR of an internal tool with no SEO requirement.
 */
export const Route = createFileRoute('/_app')({
  ssr: false,
  beforeLoad: () => ({ session: requireSession() }),
  component: AppLayout,
  errorComponent: SessionRejected,
})

function AppLayout() {
  const { session } = Route.useRouteContext()
  const navigate = useNavigate()

  const onSignOut = useCallback(() => {
    signOut()
    void navigate({ to: '/login' })
  }, [navigate])

  return (
    <Shell breadcrumb={session.workspace} onSignOut={onSignOut} session={session}>
      <Outlet />
    </Shell>
  )
}

/**
 * Rejected hard, not redirected softly. DAY-ONE-FRONTEND is explicit about
 * this. A soft bounce to /login tells the operator they were logged out; it
 * does not tell them a request was refused, and those are different facts.
 */
function SessionRejected({ error }: { error: Error }) {
  const navigate = useNavigate()
  const isSession = error instanceof SessionRequiredError || error.message === 'SESSION_REQUIRED'

  return (
    <div
      className="app flex h-screen items-center justify-center bg-app-bg text-text"
      data-testid="session-rejected"
    >
      <div className="max-w-[52ch] px-6">
        <span className="font-mono text-[12px] text-gate-block" data-testid="error-code">
          {isSession ? 'SESSION_REQUIRED' : 'SHELL_ERROR'}
        </span>
        <p className="pt-2 font-display text-[15px] font-semibold">
          {isSession ? 'This request was refused.' : 'The shell failed to load.'}
        </p>
        <p className="pt-1 text-sm leading-relaxed text-text-muted">
          {isSession
            ? 'You are not signed in, so nothing was loaded and nothing was sent. Sign in to continue.'
            : error.message}
        </p>
        <div className="pt-4">
          <Button
            data-testid="session-rejected-signin"
            onClick={() => void navigate({ to: '/login' })}
            variant="primary"
          >
            Sign in
          </Button>
        </div>
      </div>
    </div>
  )
}
