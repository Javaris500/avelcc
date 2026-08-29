import { describe, expect, it } from 'vitest'

import { ERROR_MAP, blocksDelivery, presentError } from '#/contract/errors/error-map'
import { ERROR_CODES, VIOLATION_CODES, isOverridable } from '#/contract/shared/errors'

describe('error map', () => {
  it('covers every code in the union, with none left over', () => {
    expect(Object.keys(ERROR_MAP).sort()).toEqual([...ERROR_CODES].sort())
  })

  it('carries the twelve codes BLAST-RADIUS declares', () => {
    expect(ERROR_CODES).toHaveLength(12)
  })

  it('keeps the six violation codes as a separate union', () => {
    expect(VIOLATION_CODES).toHaveLength(6)
    for (const v of VIOLATION_CODES) {
      expect(ERROR_CODES).not.toContain(v as unknown as (typeof ERROR_CODES)[number])
    }
  })

  it('writes copy for a person, not a log', () => {
    for (const code of ERROR_CODES) {
      const p = presentError(code)
      expect(p.title.length).toBeGreaterThan(15)
      expect(p.body.length).toBeGreaterThan(40)
      // No code names leaking into operator-facing prose.
      expect(p.title).not.toMatch(/[A-Z]{4,}_[A-Z]/)
    }
  })

  it('never offers an override for a violation or a determinism failure', () => {
    expect(isOverridable('BLAST_RADIUS_VIOLATION')).toBe(false)
    expect(isOverridable('DETERMINISM_VIOLATION')).toBe(false)
    expect(blocksDelivery('BLAST_RADIUS_VIOLATION')).toBe(true)
    expect(blocksDelivery('DETERMINISM_VIOLATION')).toBe(true)
  })

  it('marks a determinism failure loud, because it is not a user error', () => {
    expect(presentError('DETERMINISM_VIOLATION').severity).toBe('loud')
  })

  it('treats an empty repository as a state, not a failure', () => {
    expect(presentError('EMPTY_REPOSITORY').severity).toBe('recoverable')
    expect(blocksDelivery('EMPTY_REPOSITORY')).toBe(false)
  })
})
