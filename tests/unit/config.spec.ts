import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTOFIT_CONFIG,
  normalizeAlignment,
  normalizeAutofitConfig,
} from '../../utils/autofit/config'

describe('normalizeAutofitConfig', () => {
  it('uses the approved four/four defaults for omitted and empty input', () => {
    for (const input of [undefined, {}]) {
      const result = normalizeAutofitConfig(input)

      expect(result).toEqual({
        config: DEFAULT_AUTOFIT_CONFIG,
        requestedAlignment: 'distributed',
        valid: true,
        errors: [],
      })
      expect(result.config).toEqual({
        largeTiers: 4,
        smallTiers: 4,
        tierIncrement: 10,
        alignment: 'distributed',
      })
    }
  })

  it('fills missing properties from their individual defaults', () => {
    expect(normalizeAutofitConfig({ largeTiers: 2 })).toMatchObject({
      config: {
        largeTiers: 2,
        smallTiers: 4,
        tierIncrement: 10,
        alignment: 'distributed',
      },
      requestedAlignment: 'distributed',
      valid: true,
    })
  })

  it('normalizes center to the canonical middle alignment', () => {
    expect(normalizeAlignment('center')).toBe('middle')
    expect(normalizeAutofitConfig({ alignment: 'center' })).toMatchObject({
      config: { alignment: 'middle' },
      requestedAlignment: 'center',
      valid: true,
    })

    for (const alignment of ['top', 'middle', 'bottom', 'distributed'] as const)
      expect(normalizeAlignment(alignment)).toBe(alignment)
  })

  it.each([
    ['largeTiers', 'invalid-large-tiers'],
    ['smallTiers', 'invalid-small-tiers'],
  ] as const)('rejects invalid %s values instead of clamping them', (property, code) => {
    const invalidValues = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]

    for (const value of invalidValues) {
      const result = normalizeAutofitConfig({ [property]: value })

      expect(result.valid).toBe(false)
      expect(result.config).toEqual(DEFAULT_AUTOFIT_CONFIG)
      expect(result.errors).toContainEqual(expect.objectContaining({ code, property }))
    }
  })

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, '10%'])(
    'rejects a non-positive, non-finite, or non-numeric increment: %s',
    (tierIncrement) => {
      const result = normalizeAutofitConfig({ tierIncrement })

      expect(result.valid).toBe(false)
      expect(result.config).toEqual(DEFAULT_AUTOFIT_CONFIG)
      expect(result.errors).toContainEqual(expect.objectContaining({
        code: 'invalid-tier-increment',
        property: 'tierIncrement',
      }))
    },
  )

  it('rejects a smallest scale that is zero or negative', () => {
    const result = normalizeAutofitConfig({
      largeTiers: 2,
      smallTiers: 1,
      tierIncrement: 100,
      alignment: 'top',
    })

    expect(result.valid).toBe(false)
    expect(result.config).toEqual(DEFAULT_AUTOFIT_CONFIG)
    expect(result.requestedAlignment).toBe('distributed')
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'non-positive-smallest-scale',
    }))
  })

  it('rejects a non-finite largest scale', () => {
    const result = normalizeAutofitConfig({
      largeTiers: 2,
      smallTiers: 0,
      tierIncrement: Number.MAX_VALUE,
    })

    expect(result.valid).toBe(false)
    expect(result.config).toEqual(DEFAULT_AUTOFIT_CONFIG)
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'non-finite-largest-scale',
    }))
  })

  it('accepts Number.MAX_SAFE_INTEGER tier counts when cross-field scales remain valid', () => {
    const result = normalizeAutofitConfig({
      largeTiers: Number.MAX_SAFE_INTEGER,
      smallTiers: Number.MAX_SAFE_INTEGER,
      tierIncrement: Number.EPSILON,
      alignment: 'bottom',
    })

    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.config.largeTiers).toBe(Number.MAX_SAFE_INTEGER)
    expect(result.config.smallTiers).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('rejects unknown keys and falls back as a complete configuration', () => {
    const result = normalizeAutofitConfig({
      largeTiers: 1,
      smallTiers: 1,
      tierIncrement: 20,
      alignment: 'top',
      emergencyScale: 0.5,
    })

    expect(result.valid).toBe(false)
    expect(result.config).toEqual(DEFAULT_AUTOFIT_CONFIG)
    expect(result.requestedAlignment).toBe('distributed')
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'unknown-property',
      property: 'emergencyScale',
    }))
  })

  it.each([null, [], 'autofit', 4])('rejects non-object configuration input: %s', (input) => {
    const result = normalizeAutofitConfig(input)

    expect(result.valid).toBe(false)
    expect(result.config).toEqual(DEFAULT_AUTOFIT_CONFIG)
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'configuration-not-object',
    }))
  })

  it('rejects unsupported alignment values', () => {
    const result = normalizeAutofitConfig({ alignment: 'left' })

    expect(result.valid).toBe(false)
    expect(result.config).toEqual(DEFAULT_AUTOFIT_CONFIG)
    expect(result.errors).toContainEqual(expect.objectContaining({
      code: 'invalid-alignment',
      property: 'alignment',
    }))
  })
})
