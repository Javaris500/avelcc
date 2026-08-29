/**
 * The sidebar model, transcribed from ROUTES.md's tree.
 *
 * `built: false` items render dimmed and unfocusable with no href. A nav item
 * that links to a route which does not exist is "looks finished but isn't"
 * shipping inside the product — the exact thing CLAUDE.md opens with. Showing
 * the real information architecture is useful; pretending it is navigable is
 * not.
 *
 * `device` mirrors the route metadata. It is duplicated here only for the
 * sidebar glyph; the route's own staticData stays authoritative.
 */

export type Device = 'capture' | 'construction' | 'approve'

export type NavItem = {
  label: string
  to?: string
  device: Device
  built: boolean
}

export type NavGroup = {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: 'Work',
    items: [
      { label: 'Missions', to: '/missions', device: 'capture', built: true },
      { label: 'Clients', device: 'construction', built: false },
      { label: 'Intake', device: 'capture', built: false },
    ],
  },
  {
    label: 'Library',
    items: [
      { label: 'Agent templates', device: 'construction', built: false },
      { label: 'Skills', device: 'construction', built: false },
      { label: 'Sources', device: 'construction', built: false },
      { label: 'Presets', device: 'construction', built: false },
      { label: 'Playbooks', device: 'construction', built: false },
    ],
  },
  {
    label: 'System',
    items: [
      { label: 'Activity', device: 'capture', built: false },
      { label: 'Repositories', device: 'construction', built: false },
      { label: 'Connections', device: 'construction', built: false },
    ],
  },
]

export const DEVICE_GLYPH: Record<Device, string> = {
  capture: '▢',
  construction: '▣',
  approve: '✓',
}

export const DEVICE_LABEL: Record<Device, string> = {
  capture: 'Works on a phone',
  construction: 'Desktop only',
  approve: 'Read and approve',
}
