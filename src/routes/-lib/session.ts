/**
 * The session gate. Directories prefixed with "-" are ignored by the route
 * generator, so this sits inside src/routes/ without becoming a route.
 *
 * SCOPE: DAY-ONE-FRONTEND allows "no auth provider integration beyond the
 * session gate. Auth.js can wait a day." So the MECHANISM is real — the gate
 * rejects, and the rejection is a designed screen — while the identity source
 * is a cookie stub. Replacing readSession() is the whole migration.
 */

export type Session = {
  operator: string
  workspace: string
}

export class SessionRequiredError extends Error {
  constructor() {
    super('SESSION_REQUIRED')
    this.name = 'SessionRequiredError'
  }
}

const COOKIE = 'avel_session'

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  for (const part of document.cookie.split('; ')) {
    const [k, ...rest] = part.split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function readSession(): Session | null {
  const raw = readCookie(COOKIE)
  if (!raw) return null
  return { operator: raw, workspace: 'Meridian Law' }
}

export function signIn(operator: string): void {
  document.cookie = `${COOKIE}=${encodeURIComponent(operator)}; path=/; SameSite=Lax`
}

export function signOut(): void {
  document.cookie = `${COOKIE}=; path=/; Max-Age=0; SameSite=Lax`
}

/**
 * Rejected hard, not redirected softly. A soft redirect to /login loses the
 * fact that something was refused; the operator sees a login form and assumes
 * they were simply logged out.
 */
export function requireSession(): Session {
  const session = readSession()
  if (!session) throw new SessionRequiredError()
  return session
}
