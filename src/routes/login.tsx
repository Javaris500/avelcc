import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'

import { Wordmark } from '#/components/shell/wordmark'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { signIn } from '#/routes/-lib/session'

export const Route = createFileRoute('/login')({
  ssr: false,
  staticData: { device: 'capture' as const },
  component: Login,
})

function Login() {
  const navigate = useNavigate()
  const [operator, setOperator] = useState('')

  return (
    <div className="app flex h-screen items-center justify-center bg-app-bg text-text">
      <form
        className="w-[320px]"
        data-testid="login-form"
        onSubmit={(e) => {
          e.preventDefault()
          if (!operator.trim()) return
          signIn(operator.trim())
          void navigate({ to: '/missions' })
        }}
      >
        <Wordmark />
        <p className="pt-4 pb-1 text-[13px] text-text-muted">Operator</p>
        <Input
          autoFocus
          data-testid="login-operator"
          onChange={(e) => setOperator(e.target.value)}
          placeholder="axis"
          value={operator}
        />
        <div className="pt-3">
          <Button
            className="w-full"
            data-testid="login-submit"
            disabled={!operator.trim()}
            type="submit"
            variant="primary"
          >
            Continue
          </Button>
        </div>
        <p className="pt-4 text-[12px] leading-relaxed text-text-subtle">
          Session stub. No auth provider today — the gate is real, the identity
          source is not.
        </p>
      </form>
    </div>
  )
}
