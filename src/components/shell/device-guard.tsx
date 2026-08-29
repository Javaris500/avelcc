import { useMatches } from '@tanstack/react-router'
import { type ReactNode, useEffect, useState } from 'react'

import { Button } from '#/components/ui/button'
import { DEVICE_LABEL, type Device } from '#/routes/-lib/nav'

/**
 * The device boundary. One guard, applied by route metadata.
 *
 * "approving a gated export from mobile is fine. Initiating an irreversible
 * one is not." — DAY-ONE-FRONTEND.md
 *
 * A phone hitting a construction route gets a designed screen that says what
 * it is, why it needs a desktop, and offers a way to send itself the link.
 * Explicitly NOT a redirect and NOT a blank: a redirect loses the operator's
 * intent, and a blank teaches nothing.
 */

const DESKTOP_MIN = 1024

function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${DESKTOP_MIN - 1}px)`)
    const sync = () => setNarrow(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return narrow
}

/** The deepest route that declares a device wins. */
function useRouteDevice(): Device | undefined {
  const matches = useMatches()
  for (let i = matches.length - 1; i >= 0; i--) {
    const device = (matches[i]?.staticData as { device?: Device } | undefined)?.device
    if (device) return device
  }
  return undefined
}

export function DeviceGuard({ children }: { children: ReactNode }) {
  const device = useRouteDevice()
  const narrow = useIsNarrow()

  if (device !== 'construction' || !narrow) return <>{children}</>

  return <DesktopRequired />
}

function DesktopRequired() {
  const [sent, setSent] = useState(false)
  const href = typeof location === 'undefined' ? '' : location.href

  return (
    <div className="flex flex-col items-start gap-3 px-6 py-14" data-testid="desktop-required">
      <span className="font-mono text-[12px] text-gate-stale">DESKTOP REQUIRED</span>
      <p className="font-display text-[15px] font-semibold text-text">
        This screen builds something. It needs a desktop.
      </p>
      <p className="max-w-[52ch] text-sm leading-relaxed text-text-muted">
        {DEVICE_LABEL.construction}. Assembling a roster or starting a delivery means
        seeing three panels and a file list at once, and getting it wrong here is
        expensive. Reviewing and approving still works on a phone.
      </p>
      <div className="flex flex-wrap gap-2 pt-2">
        <Button
          data-testid="desktop-required-copy"
          onClick={() => {
            void navigator.clipboard?.writeText(href).then(() => setSent(true))
          }}
          variant="primary"
        >
          {sent ? 'Link copied' : 'Copy this link'}
        </Button>
        <Button
          data-testid="desktop-required-email"
          onClick={() => {
            location.href = `mailto:?subject=Open on desktop&body=${encodeURIComponent(href)}`
          }}
          variant="secondary"
        >
          Email it to myself
        </Button>
      </div>
      <p className="pt-1 font-mono text-[11px] break-all text-text-subtle" data-testid="desktop-required-url">
        {href}
      </p>
    </div>
  )
}
