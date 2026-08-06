import type {
  AutofitConfig,
  AutofitConfigError,
  AutofitEffectiveAlignment,
  AutofitRequestedAlignment,
  NormalizedAutofitConfig,
} from './types'

const AUTOFIT_PROPERTIES = new Set([
  'largeTiers',
  'smallTiers',
  'tierIncrement',
  'alignment',
])

const ACCEPTED_ALIGNMENTS = new Set<AutofitRequestedAlignment>([
  'top',
  'middle',
  'center',
  'bottom',
  'distributed',
])

export const NEUTRAL_TIER_PERCENT = 100

export const DEFAULT_AUTOFIT_CONFIG: AutofitConfig = Object.freeze({
  largeTiers: 4,
  smallTiers: 4,
  tierIncrement: 10,
  alignment: 'distributed',
})

function isConfigurationObject(value: unknown): value is Record<PropertyKey, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function hasOwn(
  value: Record<PropertyKey, unknown>,
  property: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, property)
}

function isTierCount(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
}

function isTierIncrement(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value > 0
}

function isAlignment(value: unknown): value is AutofitRequestedAlignment {
  return typeof value === 'string'
    && ACCEPTED_ALIGNMENTS.has(value as AutofitRequestedAlignment)
}

function invalidConfiguration(errors: AutofitConfigError[]): NormalizedAutofitConfig {
  return {
    config: DEFAULT_AUTOFIT_CONFIG,
    requestedAlignment: 'distributed',
    valid: false,
    errors,
  }
}

export function normalizeAlignment(
  alignment: AutofitRequestedAlignment,
): AutofitEffectiveAlignment {
  return alignment === 'center' ? 'middle' : alignment
}

export function normalizeAutofitConfig(input?: unknown): NormalizedAutofitConfig {
  if (input === undefined) {
    return {
      config: DEFAULT_AUTOFIT_CONFIG,
      requestedAlignment: 'distributed',
      valid: true,
      errors: [],
    }
  }

  if (!isConfigurationObject(input)) {
    return invalidConfiguration([{
      code: 'configuration-not-object',
      value: input,
    }])
  }

  const errors: AutofitConfigError[] = []

  for (const property of Reflect.ownKeys(input)) {
    if (typeof property !== 'string' || !AUTOFIT_PROPERTIES.has(property)) {
      errors.push({
        code: 'unknown-property',
        property: String(property),
        value: input[property],
      })
    }
  }

  const largeTiers = hasOwn(input, 'largeTiers')
    ? input.largeTiers
    : DEFAULT_AUTOFIT_CONFIG.largeTiers
  const smallTiers = hasOwn(input, 'smallTiers')
    ? input.smallTiers
    : DEFAULT_AUTOFIT_CONFIG.smallTiers
  const tierIncrement = hasOwn(input, 'tierIncrement')
    ? input.tierIncrement
    : DEFAULT_AUTOFIT_CONFIG.tierIncrement
  const alignment = hasOwn(input, 'alignment')
    ? input.alignment
    : DEFAULT_AUTOFIT_CONFIG.alignment

  if (!isTierCount(largeTiers)) {
    errors.push({
      code: 'invalid-large-tiers',
      property: 'largeTiers',
      value: largeTiers,
    })
  }

  if (!isTierCount(smallTiers)) {
    errors.push({
      code: 'invalid-small-tiers',
      property: 'smallTiers',
      value: smallTiers,
    })
  }

  if (!isTierIncrement(tierIncrement)) {
    errors.push({
      code: 'invalid-tier-increment',
      property: 'tierIncrement',
      value: tierIncrement,
    })
  }

  if (!isAlignment(alignment)) {
    errors.push({
      code: 'invalid-alignment',
      property: 'alignment',
      value: alignment,
    })
  }

  if (isTierCount(smallTiers) && isTierIncrement(tierIncrement)) {
    const smallestPercentage = NEUTRAL_TIER_PERCENT - smallTiers * tierIncrement
    if (!(smallestPercentage > 0)) {
      errors.push({
        code: 'non-positive-smallest-scale',
        property: 'smallTiers',
        value: smallestPercentage,
      })
    }
  }

  if (isTierCount(largeTiers) && isTierIncrement(tierIncrement)) {
    const largestPercentage = NEUTRAL_TIER_PERCENT + largeTiers * tierIncrement
    if (!Number.isFinite(largestPercentage)) {
      errors.push({
        code: 'non-finite-largest-scale',
        property: 'largeTiers',
        value: largestPercentage,
      })
    }
  }

  if (errors.length > 0)
    return invalidConfiguration(errors)

  const requestedAlignment = alignment as AutofitRequestedAlignment

  return {
    config: {
      largeTiers: largeTiers as number,
      smallTiers: smallTiers as number,
      tierIncrement: tierIncrement as number,
      alignment: normalizeAlignment(requestedAlignment),
    },
    requestedAlignment,
    valid: true,
    errors: [],
  }
}
