import { describe, expect, expectTypeOf, it } from 'vitest'

import {
  DISTRIBUTED_EMPTY_SPACE_THRESHOLD,
  DISTRIBUTED_OVERFLOW_EPSILON,
  calculateAlignmentPadding,
  calculateDistributedBoundaryCompensations,
  calculateDistributedAlignment,
  calculateTierVisualTargets,
} from '../../utils/autofit/distribution'
import type {
  AutofitVisualGapTargets,
  GapCounts,
} from '../../utils/autofit/types'

describe('tier gaps', () => {
  it('returns pixel sizes with a shape distinct from semantic boundary counts', () => {
    const base = calculateTierVisualTargets(16, 1)
    expect(base).toEqual({ fullTarget: 16, halfTarget: 8 })
    expectTypeOf(base).toEqualTypeOf<AutofitVisualGapTargets>()
    expectTypeOf(base).not.toEqualTypeOf<GapCounts>()

    const scaled = calculateTierVisualTargets(16, 1.4)
    expect(scaled.fullTarget).toBeCloseTo(22.4)
    expect(scaled.halfTarget).toBeCloseTo(11.2)
  })
})

describe('non-distributed alignment padding', () => {
  it.each([
    ['top', { before: 0, after: 12 }],
    ['middle', { before: 6, after: 6 }],
    ['bottom', { before: 12, after: 0 }],
  ] as const)('computes %s padding', (alignment, expected) => {
    expect(calculateAlignmentPadding(alignment, 12)).toEqual(expected)
  })
})

describe('distributed alignment', () => {
  it('recomputes each distributed target and signed adjustment from cached intrinsic whitespace', () => {
    expect(calculateDistributedBoundaryCompensations([
      {
        kind: 'full',
        target: 16,
        intrinsicWhitespace: 12,
      },
      {
        kind: 'full',
        target: 16,
        intrinsicWhitespace: 28,
      },
      {
        kind: 'half',
        target: 8,
        intrinsicWhitespace: 14,
      },
    ], {
      full: 6,
      half: 3,
    })).toEqual([
      {
        kind: 'full',
        target: 22,
        intrinsicWhitespace: 12,
        adjustment: 10,
      },
      {
        kind: 'full',
        target: 22,
        intrinsicWhitespace: 28,
        adjustment: -6,
      },
      {
        kind: 'half',
        target: 11,
        intrinsicWhitespace: 14,
        adjustment: -3,
      },
    ])
  })

  it('uses middle at the inclusive 4px threshold', () => {
    expect(DISTRIBUTED_EMPTY_SPACE_THRESHOLD).toBe(4)
    expect(calculateDistributedAlignment(4, { full: 3, half: 2 })).toEqual({
      effectiveAlignment: 'middle',
      additionalGap: 0,
      fullGapAddition: 0,
      halfGapAddition: 0,
      paddingBefore: 2,
      paddingAfter: 2,
    })
  })

  it('reserves the 0.5px epsilon and weights half boundaries by one half', () => {
    const emptySpace = 20
    const result = calculateDistributedAlignment(emptySpace, { full: 2, half: 2 })

    expect(DISTRIBUTED_OVERFLOW_EPSILON).toBe(0.5)
    expect(result.effectiveAlignment).toBe('distributed')
    expect(result.additionalGap).toBeCloseTo(3.9)
    expect(result.paddingBefore).toBeCloseTo(3.9)
    expect(result.paddingAfter).toBeCloseTo(3.9)
    expect(result.fullGapAddition).toBeCloseTo(3.9)
    expect(result.halfGapAddition).toBeCloseTo(1.95)

    const distributed =
      result.paddingBefore
      + result.paddingAfter
      + 2 * result.fullGapAddition
      + 2 * result.halfGapAddition
    expect(emptySpace - distributed).toBeCloseTo(0.5)
  })

  it('distributes around a single semantic unit when there are no boundaries', () => {
    const result = calculateDistributedAlignment(10, { full: 0, half: 0 })

    expect(result.effectiveAlignment).toBe('distributed')
    expect(result.additionalGap).toBeCloseTo(4.75)
    expect(result.paddingBefore).toBeCloseTo(4.75)
    expect(result.paddingAfter).toBeCloseTo(4.75)
  })
})
