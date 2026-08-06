import type {
  AutoImageConfig,
  AutoImageConfigError,
  AutoImagePosition,
  NormalizedAutoImageConfig,
} from './types'

const AUTO_IMAGE_PROPERTIES = new Set(['position', 'size'])
const AUTO_IMAGE_POSITIONS = new Set<AutoImagePosition>([
  'left',
  'right',
  'top',
  'bottom',
  'center',
])
const ASCII_WHITESPACE = /^[\t\n\v\f\r ]|[\t\n\v\f\r ]$/
const PERCENTAGE = /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)%$/

export const DEFAULT_AUTO_IMAGE_CONFIG: AutoImageConfig = Object.freeze({
  position: 'center',
  size: 100,
})

function isPlainObject(value: unknown): value is Record<PropertyKey, unknown> {
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

function trimAsciiWhitespace(value: string): string {
  let start = 0
  let end = value.length

  while (start < end && ASCII_WHITESPACE.test(value[start]!))
    start += 1
  while (end > start && ASCII_WHITESPACE.test(value[end - 1]!))
    end -= 1

  return value.slice(start, end)
}

function invalidConfiguration(errors: AutoImageConfigError[]): NormalizedAutoImageConfig {
  return {
    config: DEFAULT_AUTO_IMAGE_CONFIG,
    valid: false,
    errors,
  }
}

function comparePropertyNames(left: PropertyKey, right: PropertyKey): number {
  const leftName = String(left)
  const rightName = String(right)
  if (leftName < rightName)
    return -1
  if (leftName > rightName)
    return 1
  return 0
}

function normalizeSize(
  value: unknown,
  errors: AutoImageConfigError[],
): number | undefined {
  if (typeof value !== 'string') {
    errors.push({ code: 'invalid-size-type', property: 'size', value })
    return undefined
  }

  const trimmed = trimAsciiWhitespace(value)
  if (!PERCENTAGE.test(trimmed)) {
    errors.push({ code: 'invalid-size-syntax', property: 'size', value })
    return undefined
  }

  const parsed = Number.parseFloat(trimmed.slice(0, -1))
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    errors.push({ code: 'invalid-size-range', property: 'size', value })
    return undefined
  }

  return parsed
}

export function normalizeAutoImageConfig(input?: unknown): NormalizedAutoImageConfig {
  if (input === undefined) {
    return {
      config: DEFAULT_AUTO_IMAGE_CONFIG,
      valid: true,
      errors: [],
    }
  }

  if (!isPlainObject(input)) {
    return invalidConfiguration([{
      code: 'configuration-not-object',
      value: input,
    }])
  }

  const errors: AutoImageConfigError[] = []
  const unknownProperties = Reflect.ownKeys(input)
    .filter(property => typeof property !== 'string' || !AUTO_IMAGE_PROPERTIES.has(property))
    .sort(comparePropertyNames)

  for (const property of unknownProperties) {
    errors.push({
      code: 'unknown-property',
      property: String(property),
      value: input[property],
    })
  }

  let position: AutoImagePosition | undefined = DEFAULT_AUTO_IMAGE_CONFIG.position
  if (hasOwn(input, 'position')) {
    const rawPosition = input.position
    if (typeof rawPosition !== 'string') {
      errors.push({ code: 'invalid-position-type', property: 'position', value: rawPosition })
      position = undefined
    }
    else if (!AUTO_IMAGE_POSITIONS.has(rawPosition as AutoImagePosition)) {
      errors.push({ code: 'invalid-position-value', property: 'position', value: rawPosition })
      position = undefined
    }
    else {
      position = rawPosition as AutoImagePosition
    }
  }

  let size: number | undefined = DEFAULT_AUTO_IMAGE_CONFIG.size
  if (hasOwn(input, 'size'))
    size = normalizeSize(input.size, errors)

  if (errors.length > 0)
    return invalidConfiguration(errors)

  return {
    config: {
      position: position!,
      size: size!,
    },
    valid: true,
    errors: [],
  }
}

export function serializeAutoImageDiagnosticValue(
  value: unknown,
  seen = new WeakSet<object>(),
): string {
  if (value === null)
    return 'null'

  if (typeof value === 'number') {
    if (Object.is(value, -0))
      return 'number:-0'
    if (!Number.isFinite(value))
      return `number:${String(value)}`
    return `number:${value}`
  }

  if (typeof value !== 'object')
    return `${typeof value}:${String(value)}`

  if (seen.has(value))
    return '[circular]'

  seen.add(value)
  if (Array.isArray(value))
    return `[${value.map(item => serializeAutoImageDiagnosticValue(item, seen)).join(',')}]`

  const record = value as Record<PropertyKey, unknown>
  const properties = Reflect.ownKeys(record)
    .sort(comparePropertyNames)
    .map(property => `${String(property)}:${serializeAutoImageDiagnosticValue(record[property], seen)}`)
    .join(',')
  return `${Object.prototype.toString.call(value)}{${properties}}`
}

export function createAutoImageConfigurationWarningSignature(
  rawConfiguration: unknown,
  errors: readonly AutoImageConfigError[],
): string {
  const serializedErrors = errors
    .map(error => [
      error.code,
      error.property ?? '',
      serializeAutoImageDiagnosticValue(error.value),
    ].join(':'))
    .join('|')

  return `${serializeAutoImageDiagnosticValue(rawConfiguration)}::${serializedErrors}`
}
