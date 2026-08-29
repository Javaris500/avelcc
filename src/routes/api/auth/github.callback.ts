import { createFileRoute } from '@tanstack/react-router'

import {
  OPERATOR_COOKIE,
  SESSION_COOKIE,
  STATE_COOKIE,
  cookie,
  exchangeCode,
  readCookie,
  readOAuthConfig,
  statesMatch,
} from '#/routes/-lib/oauth'

function back(code: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/login?error=${code}`,
      // Burn the state cookie on every exit path, success or failure.
      'Set-Cookie': cookie(STATE_COOKIE, '', { httpOnly: true, maxAge: 0 }),
    },
  })
}

export const Route = createFileRoute('/api/auth/github/callback')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const config = readOAuthConfig()
        if (!config) return back('OAUTH_NOT_CONFIGURED')

        const url = new URL(request.url)
        if (url.searchParams.get('error')) return back('OAUTH_DENIED')

        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const expected = readCookie(request.headers.get('cookie'), STATE_COOKIE)

        // The state check is the whole CSRF defence. A missing cookie is a
        // failure, not a reason to skip the check.
        if (!code || !statesMatch(state ?? undefined, expected)) {
          return back('OAUTH_EXCHANGE_FAILED')
        }

        const redirectUri = new URL('/api/auth/github/callback', request.url).toString()
        const profile = await exchangeCode(config, code, redirectUri)
        if (!profile) return back('OAUTH_EXCHANGE_FAILED')

        const headers = new Headers({ Location: '/missions' })
        headers.append('Set-Cookie', cookie(STATE_COOKIE, '', { httpOnly: true, maxAge: 0 }))
        // Trusted by a server, unreadable by script.
        headers.append('Set-Cookie', cookie(SESSION_COOKIE, profile.login, { httpOnly: true }))
        // Display only, so the client shell can render a name. Never trusted:
        // the client gate is UI, the server remains authoritative.
        headers.append('Set-Cookie', cookie(OPERATOR_COOKIE, profile.login))
        return new Response(null, { status: 302, headers })
      },
    },
  },
})
