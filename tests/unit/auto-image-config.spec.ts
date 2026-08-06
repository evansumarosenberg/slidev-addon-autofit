import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTO_IMAGE_CONFIG,
  createAutoImageConfigurationWarningSignature,
  normalizeAutoImageConfig,
  serializeAutoImageDiagnosticValue,
} from '../../utils/auto-image/config'

describe('normalizeAutoImageConfig', () => {
  it('uses complete defaults for omitted and empty input', () => {
    for (const input of [undefined, {}]) {
      expect(normalizeAutoImageConfig(input)).toEqual({
        config: DEFAULT_AUTO_IMAGE_CONFIG,
        valid: true,
        errors: [],
      })
    }

    expect(DEFAULT_AUTO_IMAGE_CONFIG).toEqual({ position: 'center', size: 100 })
  })

  it.each([
    ['left', 'left'],
    ['right', 'right'],
    ['top', 'top'],
    ['bottom', 'bottom'],
    ['center', 'center'],
  ] as const)('accepts the exact %s position', (position, normalizedPosition) => {
    expect(normalizeAutoImageConfig({ position })).toMatchObject({
      config: { position: normalizedPosition, size: 100 },
      valid: true,
      errors: [],
    })
  })

  it('fills omitted properties independently', () => {
    expect(normalizeAutoImageConfig({ position: 'right' })).toMatchObject({
      config: { position: 'right', size: 100 },
      valid: true,
    })
    expect(normalizeAutoImageConfig({ size: '40%' })).toMatchObject({
      config: { position: 'center', size: 40 },
      valid: true,
    })
  })

  it.each([
    '\t\n\v\f\r 0% ',
    ' \t00%\r\n',
    '\v.5%\f',
    '\r5.0%\t',
    ' 100.000% ',
  ])('trims accepted surrounding ASCII whitespace in %j', (size) => {
    expect(normalizeAutoImageConfig({ size })).toMatchObject({
      config: { size: Number.parseFloat(size.replace(/[\t\n\v\f\r ]/g, '').replace('%', '')) },
      valid: true,
      errors: [],
    })
  })

  it.each([
    ['0%', 0],
    ['00%', 0],
    ['.5%', 0.5],
    ['000.500%', 0.5],
    ['5.0%', 5],
    ['100%', 100],
    ['100.000%', 100],
  ] as const)('accepts the approved percentage grammar %j', (size, value) => {
    expect(normalizeAutoImageConfig({ size })).toMatchObject({
      config: { size: value },
      valid: true,
      errors: [],
    })
  })

  it.each(['\u00a040%\u00a0', '\u200340%\u2003'])(
    'rejects non-ASCII whitespace instead of using Unicode trim: %j',
    (size) => {
      expect(normalizeAutoImageConfig({ size })).toMatchObject({
        valid: false,
        config: DEFAULT_AUTO_IMAGE_CONFIG,
        errors: [{ code: 'invalid-size-syntax', property: 'size', value: size }],
      })
    },
  )

  it.each([
    ['position', null, 'invalid-position-type'],
    ['position', 1, 'invalid-position-type'],
    ['position', ' RIGHT', 'invalid-position-value'],
    ['position', 'RIGHT', 'invalid-position-value'],
    ['position', 'middle', 'invalid-position-value'],
    ['size', null, 'invalid-size-type'],
    ['size', 40, 'invalid-size-type'],
    ['size', '40', 'invalid-size-syntax'],
    ['size', '5.%', 'invalid-size-syntax'],
    ['size', '+5%', 'invalid-size-syntax'],
    ['size', '-1%', 'invalid-size-syntax'],
    ['size', '1e1%', 'invalid-size-syntax'],
    ['size', '40px', 'invalid-size-syntax'],
    ['size', '100.1%', 'invalid-size-range'],
    ['size', '101%', 'invalid-size-range'],
  ] as const)('rejects invalid %s value %j with %s', (property, value, code) => {
    const result = normalizeAutoImageConfig({ [property]: value })

    expect(result).toMatchObject({
      valid: false,
      config: DEFAULT_AUTO_IMAGE_CONFIG,
      errors: [{ code, property, value }],
    })
  })

  it.each([null, [], 'image', 4, new Date()])(
    'rejects non-plain image configuration %j with only configuration-not-object',
    (input) => {
      const result = normalizeAutoImageConfig(input)

      expect(result).toEqual({
        valid: false,
        config: DEFAULT_AUTO_IMAGE_CONFIG,
        errors: [{ code: 'configuration-not-object', value: input }],
      })
    },
  )

  it('reports unknown string and symbol properties first in stable property order', () => {
    const alpha = Symbol('alpha')
    const zeta = Symbol('zeta')
    const input = Object.create(null) as Record<PropertyKey, unknown>
    input.zeta = true
    input[alpha] = 'alpha'
    input.alpha = false
    input[zeta] = 'zeta'
    input.position = 'right'
    input.size = '40%'

    const result = normalizeAutoImageConfig(input)

    expect(result.valid).toBe(false)
    expect(result.config).toEqual(DEFAULT_AUTO_IMAGE_CONFIG)
    expect(result.errors.map(error => error.property)).toEqual([
      'Symbol(alpha)',
      'Symbol(zeta)',
      'alpha',
      'zeta',
    ])
    expect(result.errors.map(error => error.code)).toEqual([
      'unknown-property',
      'unknown-property',
      'unknown-property',
      'unknown-property',
    ])
  })

  it('uses closed error ordering and applies no valid partial configuration', () => {
    const input = {
      position: 4,
      size: '100.1%',
      extra: 'not supported',
    }

    expect(normalizeAutoImageConfig(input)).toEqual({
      valid: false,
      config: DEFAULT_AUTO_IMAGE_CONFIG,
      errors: [
        { code: 'unknown-property', property: 'extra', value: 'not supported' },
        { code: 'invalid-position-type', property: 'position', value: 4 },
        { code: 'invalid-size-range', property: 'size', value: '100.1%' },
      ],
    })
  })

  it('serializes diagnostic values deterministically, including symbols and cycles', () => {
    const first = Object.create(null) as Record<PropertyKey, unknown>
    const marker = Symbol('marker')
    const nested: Record<string, unknown> = { z: Number.POSITIVE_INFINITY, a: -0 }
    first.z = [Number.NaN, nested]
    first.a = nested
    first[marker] = 'symbol value'
    nested.self = nested

    const second = Object.create(null) as Record<PropertyKey, unknown>
    second[marker] = 'symbol value'
    second.a = nested
    second.z = [Number.NaN, nested]

    const firstValue = serializeAutoImageDiagnosticValue(first)
    const secondValue = serializeAutoImageDiagnosticValue(second)

    expect(firstValue).toBe(secondValue)
    expect(firstValue).toContain('Symbol(marker):string:symbol value')
    expect(firstValue).toContain('number:NaN')
    expect(firstValue).toContain('number:Infinity')
    expect(firstValue).toContain('number:-0')
    expect(firstValue).toContain('[circular]')
    expect(() => serializeAutoImageDiagnosticValue(first)).not.toThrow()
  })

  it('keeps negative zero distinct from ordinary zero in diagnostic signatures', () => {
    expect(serializeAutoImageDiagnosticValue(-0)).toBe('number:-0')
    expect(serializeAutoImageDiagnosticValue(0)).toBe('number:0')

    const errors = [{ code: 'configuration-not-object' as const, value: -0 }]
    expect(createAutoImageConfigurationWarningSignature(-0, errors))
      .toBe('number:-0::configuration-not-object::number:-0')
    expect(createAutoImageConfigurationWarningSignature(0, errors))
      .toBe('number:0::configuration-not-object::number:-0')
  })

  it('includes the normalized ordered errors in a stable warning signature', () => {
    const inputA = { size: '100.1%', position: 'left', extra: ['x'] }
    const inputB = { extra: ['x'], position: 'left', size: '100.1%' }
    const errors = normalizeAutoImageConfig(inputA).errors

    expect(createAutoImageConfigurationWarningSignature(inputA, errors))
      .toBe(createAutoImageConfigurationWarningSignature(inputB, errors))
  })
})
