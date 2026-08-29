import type { AuthCode } from '#/contract/shared/errors'

/**
 * Sign-in failures, mapped. Exhaustive by construction: a Record keyed on the
 * AuthCode union, so a seventh code fails the build until it has a screen.
 *
 * Kept apart from ERROR_MAP because the two vocabularies never appear on the
 * same surface. Merging them would weaken both exhaustiveness checks.
 *
 * Copy rule for this file specifically: a sign-in error must never tell an
 * attacker which half was wrong. "That email and password do not match" is
 * correct; "no account with that email" is a user enumeration oracle.
 */

export type AuthPresentation = {
  title: string
  body: string
  /** Where focus goes after the error is announced. */
  focus: 'email' | 'password' | 'none'
}

export const AUTH_ERROR_MAP: Record<AuthCode, AuthPresentation> = {
  INVALID_CREDENTIALS: {
    title: 'That email and password do not match.',
    body: 'Check both and try again. If you are not sure of the password, reset it rather than guessing — repeated attempts are rate limited.',
    focus: 'password',
  },
  OAUTH_NOT_CONFIGURED: {
    title: 'GitHub sign-in is not configured on this deployment.',
    body: 'This build has no GitHub OAuth credentials, so the button cannot complete. Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .env and restart. Email and password still work.',
    focus: 'none',
  },
  OAUTH_DENIED: {
    title: 'You cancelled the GitHub sign-in.',
    body: 'Nothing was shared and no account was created. Try again, or use email and password instead.',
    focus: 'none',
  },
  OAUTH_EXCHANGE_FAILED: {
    title: 'GitHub sign-in did not complete.',
    body: 'GitHub returned an authorization that could not be exchanged. This is usually a mismatched callback URL or an expired request. Starting again normally clears it.',
    focus: 'none',
  },
  RATE_LIMITED: {
    title: 'Too many attempts.',
    body: 'Sign-in is paused briefly on this account to slow down guessing. Wait a minute and try again.',
    focus: 'none',
  },
  SESSION_REQUIRED: {
    title: 'This request was refused.',
    body: 'You are not signed in, so nothing was loaded and nothing was sent.',
    focus: 'email',
  },
}

export function presentAuthError(code: AuthCode): AuthPresentation {
  return AUTH_ERROR_MAP[code]
}
