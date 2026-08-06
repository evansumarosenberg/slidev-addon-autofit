import type {
  AlignmentPadding,
  AutofitGapKind,
  AutofitNonDistributedAlignment,
  AutofitVisualGapTargets,
  DistributedAlignment,
  GapCounts,
} from './types'

export const DISTRIBUTED_EMPTY_SPACE_THRESHOLD = 4
export const DISTRIBUTED_OVERFLOW_EPSILON = 0.5
const HALF_GAP_WEIGHT = 0.5

interface DistributedBoundaryInput {
  readonly kind: AutofitGapKind
  readonly target: number
  readonly intrinsicWhitespace: number
}

interface DistributedBoundaryAddition {
  readonly full: number
  readonly half: number
}

export interface DistributedBoundaryCompensation
  extends DistributedBoundaryInput {
  readonly adjustment: number
}

function assertFiniteNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0)
    throw new RangeError(`${label} must be finite and non-negative`)
}

function assertGapCount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${label} must be a non-negative safe integer`)
}

export function calculateTierVisualTargets(
  baseSpacing: number,
  scale: number,
): AutofitVisualGapTargets {
  assertFiniteNonNegative(baseSpacing, 'base spacing')
  if (!Number.isFinite(scale) || scale <= 0)
    throw new RangeError('tier scale must be finite and positive')

  const fullTarget = baseSpacing * scale
  return {
    fullTarget,
    halfTarget: fullTarget * HALF_GAP_WEIGHT,
  }
}

export function calculateAlignmentPadding(
  alignment: AutofitNonDistributedAlignment,
  emptySpace: number,
): AlignmentPadding {
  assertFiniteNonNegative(emptySpace, 'empty space')

  switch (alignment) {
    case 'top':
      return { before: 0, after: emptySpace }
    case 'middle':
      return { before: emptySpace / 2, after: emptySpace / 2 }
    case 'bottom':
      return { before: emptySpace, after: 0 }
  }
}

export function calculateDistributedBoundaryCompensations(
  boundaries: readonly DistributedBoundaryInput[],
  additions: DistributedBoundaryAddition,
): readonly DistributedBoundaryCompensation[] {
  assertFiniteNonNegative(additions.full, 'full distributed addition')
  assertFiniteNonNegative(additions.half, 'half distributed addition')

  return boundaries.map((boundary) => {
    if (!Number.isFinite(boundary.target))
      throw new RangeError('base visual target must be finite')
    if (!Number.isFinite(boundary.intrinsicWhitespace))
      throw new RangeError('intrinsic whitespace must be finite')

    const target = boundary.target
      + (boundary.kind === 'full' ? additions.full : additions.half)
    const adjustment = target - boundary.intrinsicWhitespace
    if (!Number.isFinite(target) || !Number.isFinite(adjustment))
      throw new RangeError('distributed compensation must be finite')

    return {
      kind: boundary.kind,
      target,
      intrinsicWhitespace: boundary.intrinsicWhitespace,
      adjustment,
    }
  })
}

export function calculateDistributedAlignment(
  emptySpace: number,
  gaps: GapCounts,
): DistributedAlignment {
  assertFiniteNonNegative(emptySpace, 'empty space')
  assertGapCount(gaps.full, 'full gap count')
  assertGapCount(gaps.half, 'half gap count')

  if (emptySpace <= DISTRIBUTED_EMPTY_SPACE_THRESHOLD) {
    const padding = calculateAlignmentPadding('middle', emptySpace)
    return {
      effectiveAlignment: 'middle',
      additionalGap: 0,
      fullGapAddition: 0,
      halfGapAddition: 0,
      paddingBefore: padding.before,
      paddingAfter: padding.after,
    }
  }

  const denominator = 2 + gaps.full + HALF_GAP_WEIGHT * gaps.half
  const additionalGap = Math.max(
    0,
    (emptySpace - DISTRIBUTED_OVERFLOW_EPSILON) / denominator,
  )

  return {
    effectiveAlignment: 'distributed',
    additionalGap,
    fullGapAddition: additionalGap,
    halfGapAddition: HALF_GAP_WEIGHT * additionalGap,
    paddingBefore: additionalGap,
    paddingAfter: additionalGap,
  }
}
