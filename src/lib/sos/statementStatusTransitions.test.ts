import { describe, expect, it } from 'vitest'
import {
  STATEMENT_TRANSITIONS,
  assertStatementTransition,
  canTransitionStatementStatus,
  InvalidStatementTransitionError,
} from './statementStatusTransitions'

describe('statementStatusTransitions', () => {
  it('allows the documented operator edges', () => {
    expect(canTransitionStatementStatus('draft', 'label_approved')).toBe(true)
    expect(canTransitionStatementStatus('draft', 'cancelled')).toBe(true)
    expect(canTransitionStatementStatus('label_approved', 'artist_notified')).toBe(true)
    expect(canTransitionStatementStatus('label_approved', 'viewed')).toBe(true)
    expect(canTransitionStatementStatus('label_approved', 'invoiced')).toBe(true)
    expect(canTransitionStatementStatus('artist_notified', 'viewed')).toBe(true)
    expect(canTransitionStatementStatus('artist_notified', 'invoiced')).toBe(true)
    expect(canTransitionStatementStatus('viewed', 'invoiced')).toBe(true)
    expect(canTransitionStatementStatus('viewed', 'paid')).toBe(true)
    expect(canTransitionStatementStatus('invoiced', 'paid')).toBe(true)
    expect(canTransitionStatementStatus('acknowledged', 'paid')).toBe(true)
  })

  it('treats same-status as a no-op', () => {
    expect(canTransitionStatementStatus('paid', 'paid')).toBe(true)
    expect(canTransitionStatementStatus('draft', 'draft')).toBe(true)
  })

  it('rejects illegal jumps and reverse moves', () => {
    expect(canTransitionStatementStatus('draft', 'artist_notified')).toBe(false)
    expect(canTransitionStatementStatus('draft', 'invoiced')).toBe(false)
    expect(canTransitionStatementStatus('draft', 'paid')).toBe(false)
    expect(canTransitionStatementStatus('label_approved', 'paid')).toBe(false)
    expect(canTransitionStatementStatus('paid', 'invoiced')).toBe(false)
    expect(canTransitionStatementStatus('cancelled', 'draft')).toBe(false)
    expect(canTransitionStatementStatus('superseded', 'label_approved')).toBe(false)
  })

  it('allows superseding an invoiced original so corrections stay valid', () => {
    expect(canTransitionStatementStatus('invoiced', 'superseded')).toBe(true)
    expect(canTransitionStatementStatus('acknowledged', 'superseded')).toBe(true)
    expect(canTransitionStatementStatus('paid', 'superseded')).toBe(false)
  })

  it('throws InvalidStatementTransitionError on illegal edges', () => {
    expect(() => assertStatementTransition('draft', 'paid')).toThrow(InvalidStatementTransitionError)
    expect(() => assertStatementTransition('draft', 'label_approved')).not.toThrow()
  })

  it('lists a terminal empty set for paid, superseded, and cancelled', () => {
    expect(STATEMENT_TRANSITIONS.paid).toEqual([])
    expect(STATEMENT_TRANSITIONS.superseded).toEqual([])
    expect(STATEMENT_TRANSITIONS.cancelled).toEqual([])
  })
})
