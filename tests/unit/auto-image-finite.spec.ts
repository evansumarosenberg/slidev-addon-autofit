import { describe, expect, it } from 'vitest'
import { areFiniteAutoImageValues } from '../../utils/auto-image/finite'

describe('areFiniteAutoImageValues', () => {
  it('rejects every non-finite managed CSS value', () => {
    expect(areFiniteAutoImageValues([0, -1, 1.5])).toBe(true)
    expect(areFiniteAutoImageValues([Number.NaN])).toBe(false)
    expect(areFiniteAutoImageValues([Number.POSITIVE_INFINITY])).toBe(false)
    expect(areFiniteAutoImageValues([Number.NEGATIVE_INFINITY])).toBe(false)
  })
})
