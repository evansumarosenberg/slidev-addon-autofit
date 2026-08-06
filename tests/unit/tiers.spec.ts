import { describe, expect, it } from 'vitest'

import { DEFAULT_AUTOFIT_CONFIG } from '../../utils/autofit/config'
import {
  createFixedTierSearch,
  createTierSearch,
  getTierScale,
  maximumCandidateMeasurements,
} from '../../utils/autofit/tiers'
import type { AutofitConfig, TierSearchResult } from '../../utils/autofit/types'

function driveSearch(
  config: AutofitConfig,
  fits: (tier: number) => boolean,
): { candidates: number[], result: TierSearchResult } {
  const search = createTierSearch(config)
  const candidates: number[] = []

  while (search.candidate) {
    const candidate = search.candidate
    candidates.push(candidate.index)
    search.record(candidate.index, fits(candidate.index))
  }

  if (!search.result)
    throw new Error('tier search did not produce a result')

  return { candidates, result: search.result }
}

describe('getTierScale', () => {
  it('generates the authoritative default scales from 60% through 140%', () => {
    const scales = Array.from(
      { length: 9 },
      (_, offset) => getTierScale(offset - 4, DEFAULT_AUTOFIT_CONFIG),
    )

    expect(scales).toEqual([0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2, 1.3, 1.4])
  })

  it('rejects unsafe or out-of-range indices', () => {
    expect(() => getTierScale(1.5, DEFAULT_AUTOFIT_CONFIG)).toThrow(RangeError)
    expect(() => getTierScale(5, DEFAULT_AUTOFIT_CONFIG)).toThrow(RangeError)
  })
})

describe('base-first tier search', () => {
  it('measures tier zero first and finds the largest fitting larger tier', () => {
    const { candidates, result } = driveSearch(DEFAULT_AUTOFIT_CONFIG, tier => tier <= 3)

    expect(candidates).toEqual([0, 2, 3, 4])
    expect(result).toEqual({
      tier: 3,
      scale: 1.3,
      fits: true,
      overflow: false,
      measurementCount: 4,
    })
  })

  it('searches only the smaller side when base overflows', () => {
    const { candidates, result } = driveSearch(DEFAULT_AUTOFIT_CONFIG, tier => tier <= -2)

    expect(candidates).toEqual([0, -3, -2, -1])
    expect(result.tier).toBe(-2)
    expect(result.scale).toBe(0.8)
    expect(result.overflow).toBe(false)
  })

  it('handles a zero-sized larger side', () => {
    const config = { ...DEFAULT_AUTOFIT_CONFIG, largeTiers: 0 }
    const { candidates, result } = driveSearch(config, () => true)

    expect(candidates).toEqual([0])
    expect(result.tier).toBe(0)
    expect(result.overflow).toBe(false)
  })

  it('handles a zero-sized smaller side and reports base overflow', () => {
    const config = { ...DEFAULT_AUTOFIT_CONFIG, smallTiers: 0 }
    const { candidates, result } = driveSearch(config, () => false)

    expect(candidates).toEqual([0])
    expect(result).toMatchObject({ tier: 0, scale: 1, fits: false, overflow: true })
  })

  it('selects the smallest configured tier when no tier fits', () => {
    const { candidates, result } = driveSearch(DEFAULT_AUTOFIT_CONFIG, () => false)

    expect(candidates).toEqual([0, -3, -4])
    expect(result).toMatchObject({ tier: -4, scale: 0.6, fits: false, overflow: true })
  })

  it('stays within the logarithmic default candidate bound', () => {
    const predicates = [
      (tier: number) => tier <= 4,
      (tier: number) => tier <= 3,
      (tier: number) => tier <= 0,
      (tier: number) => tier <= -1,
      (tier: number) => tier <= -4,
      () => false,
    ]

    for (const fits of predicates) {
      const { candidates } = driveSearch(DEFAULT_AUTOFIT_CONFIG, fits)
      expect(candidates.length).toBeLessThanOrEqual(4)
    }
    expect(maximumCandidateMeasurements(4)).toBe(4)
  })

  it('uses safe logarithmic midpoint arithmetic lazily at Number.MAX_SAFE_INTEGER', () => {
    const max = Number.MAX_SAFE_INTEGER
    const config: AutofitConfig = {
      largeTiers: max,
      smallTiers: max,
      tierIncrement: Number.EPSILON,
      alignment: 'distributed',
    }

    const largeTarget = max - 17
    const large = driveSearch(config, tier => tier <= largeTarget)
    expect(large.result.tier).toBe(largeTarget)
    expect(large.candidates.length).toBeLessThanOrEqual(maximumCandidateMeasurements(max))

    const smallTarget = -17
    const small = driveSearch(config, tier => tier <= smallTarget)
    expect(small.result.tier).toBe(smallTarget)
    expect(small.candidates.length).toBeLessThanOrEqual(maximumCandidateMeasurements(max))

    for (const tier of [...large.candidates, ...small.candidates])
      expect(Number.isSafeInteger(tier)).toBe(true)

    expect(maximumCandidateMeasurements(max)).toBe(54)
  })

  it('rejects a result recorded for a stale candidate', () => {
    const search = createTierSearch(DEFAULT_AUTOFIT_CONFIG)
    expect(() => search.record(1, true)).toThrow(/candidate/i)
  })
})

describe('fixed-tier search', () => {
  it('measures only the selected configured candidate and completes from that measurement', () => {
    const search = createFixedTierSearch(DEFAULT_AUTOFIT_CONFIG, -2)

    expect(search.candidate).toEqual({ index: -2, scale: 0.8 })
    search.record(-2, false)

    expect(search.candidate).toBeNull()
    expect(search.result).toEqual({
      tier: -2,
      scale: 0.8,
      fits: false,
      overflow: true,
      measurementCount: 1,
    })
  })

  it('rejects fixed candidates outside the configured tier range', () => {
    expect(() => createFixedTierSearch(DEFAULT_AUTOFIT_CONFIG, -5)).toThrow(RangeError)
    expect(() => createFixedTierSearch(DEFAULT_AUTOFIT_CONFIG, 5)).toThrow(RangeError)
  })
})
