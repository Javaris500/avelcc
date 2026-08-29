import { randomBytes } from 'node:crypto'

/**
 * GitHub OAuth, server side only.
 *
 * No @auth/core. One provider needs one redirect and one fetch, and
 * STACK-AND-RESOURCES puts Auth.js in week two — adding the dependency on
 * speculation is not justified. Adding .env completes this flow with no code
 * change.
 *
 * The client secret is read here and nowhere else. It never reaches a
 * component, a loader, or the bundle, and it is never logged. STACK calls this
 * "the one-way door — free today, expensive after the first client repo is
 * connected."
 */

export const STATE_COOKIE = 'avel_oauth_state'
/** Trusted by a server. httpOnly, so the client cannot forge it. */
export const SESSION_COOKIE = 'avel_session'
/** Display only, readable by the client for the UI gate. Never trusted. */
export const OPERATOR_COOKIE = 'avel_operator'

export type OAuthConfig = {
  clientId: string
  clientSecret: string
}

/**
 * Returns null when the deployment has no credentials. Callers render
 * OAUTH_NOT_CONFIGURED rather than throwing — an unconfigured build is a
 * known state, not a crash.
 */
export function readOAuthConfig(): OAuthConfig | null {
  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function newState(): string {
  return randomBytes(32).toString('base64url')
}

export function authorizeUrl(
  clientId: string,
  state: string,
  redirectUri: string,
): string {
  const url = new URL('https://github.com/login/oauth/authorize')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('state', state)
  url.searchParams.set('scope', 'read:user user:email')
  url.searchParams.set('allow_signup', 'false')
  return url.toString()
}

/** Constant-time-ish compare so a mismatch does not leak position. */
export function statesMatch(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split('; ')) {
    const eq = part.indexOf('=')
    if (eq > 0 && part.slice(0, eq) === name) return decodeURIComponent(part.slice(eq + 1))
  }
  return undefined
}

export function cookie(
  name: string,
  value: string,
  opts: { httpOnly?: boolean; maxAge?: number } = {},
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'SameSite=Lax',
    `Max-Age=${opts.maxAge ?? 60 * 60 * 8}`,
  ]
  if (opts.httpOnly) parts.push('HttpOnly')
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export async function exchangeCode(
  config: OAuthConfig,
  code: string,
  redirectUri: string,
): Promise<{ login: string } | null> {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  })
  if (!res.ok) return null
  const token = (await res.json()) as { access_token?: string }
  if (!token.access_token) return null

  const user = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      Accept: 'application/vnd.github+json',
    },
  })
  if (!user.ok) return null
  const profile = (await user.json()) as { login?: string }
  return profile.login ? { login: profile.login } : null
}
