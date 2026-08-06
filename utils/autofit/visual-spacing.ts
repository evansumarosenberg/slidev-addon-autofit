import {
  convertAutofitRectToLocal,
  measureAutofitLocalCoordinateSpace,
} from './geometry'
import { AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE } from './types'
import type {
  AutofitGeometryRect,
  AutofitLocalCoordinateSpace,
  AutofitUnsupportedOutput,
  AutofitVisualBoundaryMeasurement,
  AutofitVisualBoundaryMeasurementOptions,
  AutofitVisualBoundaryMeasurementResult,
  AutofitVisualGapTargets,
  AutofitVisualReads,
  AutofitVisualUnitMeasurement,
  AutofitVisualUnitOwnership,
} from './types'

export const AUTOFIT_VISUAL_GAP_TOLERANCE = 0.5
const HALF_GAP_WEIGHT = 0.5

function copyRect(source: DOMRect): AutofitGeometryRect {
  return {
    left: source.left,
    right: source.right,
    top: source.top,
    bottom: source.bottom,
    width: source.width,
    height: source.height,
  }
}

const DEFAULT_VISUAL_READS: AutofitVisualReads = {
  readTextRects: (node) => {
    const range = node.ownerDocument.createRange()
    range.selectNodeContents(node)
    return Array.from(range.getClientRects(), copyRect)
  },
  readElementRect: (node) => {
    if (node.getClientRects().length === 0)
      return null
    return copyRect(node.getBoundingClientRect())
  },
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value))
    throw new RangeError(`${label} must be finite`)
}

export function calculateAutofitVisualGapTargets(
  baseSpacing: number,
  scale: number,
): AutofitVisualGapTargets {
  if (!Number.isFinite(baseSpacing) || baseSpacing < 0)
    throw new RangeError('base spacing must be finite and non-negative')
  if (!Number.isFinite(scale) || scale <= 0)
    throw new RangeError('tier scale must be finite and positive')

  const fullTarget = baseSpacing * scale
  return {
    fullTarget,
    halfTarget: fullTarget * HALF_GAP_WEIGHT,
  }
}

export function calculateAutofitCarrierAdjustment(
  target: number,
  intrinsicWhitespace: number,
): number {
  assertFinite(target, 'visual target')
  assertFinite(intrinsicWhitespace, 'intrinsic whitespace')

  const adjustment = target - intrinsicWhitespace
  assertFinite(adjustment, 'carrier adjustment')
  return adjustment
}

export function verifyAutofitVisualGaps(
  expected: readonly Pick<AutofitVisualBoundaryMeasurement, 'target'>[],
  realizedWhitespace: readonly number[],
): boolean {
  if (expected.length !== realizedWhitespace.length)
    return false

  return expected.every(({ target }, index) => {
    const realized = realizedWhitespace[index]
    return Number.isFinite(target)
      && Number.isFinite(realized)
      && Math.abs(realized - target) <= AUTOFIT_VISUAL_GAP_TOLERANCE
  })
}

function compareUnsupported(
  left: AutofitUnsupportedOutput,
  right: AutofitUnsupportedOutput,
): number {
  if (left.node === right.node) {
    return AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE.indexOf(left.reason)
      - AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE.indexOf(right.reason)
  }

  const position = left.node.compareDocumentPosition(right.node)
  if (position & 4 /* Node.DOCUMENT_POSITION_FOLLOWING */)
    return -1
  if (position & 2 /* Node.DOCUMENT_POSITION_PRECEDING */)
    return 1
  return 0
}

export function selectFirstAutofitUnsupported(
  unsupported: readonly AutofitUnsupportedOutput[],
): AutofitUnsupportedOutput | null {
  if (unsupported.length === 0)
    return null

  return [...unsupported].sort(compareUnsupported)[0]
}

type UnitRectSelection =
  | {
      readonly status: 'measured'
      readonly rectangles: readonly AutofitGeometryRect[]
    }
  | {
      readonly status: 'unsupported'
      readonly reason: 'visual-rect-missing' | 'visual-edge-nonfinite'
    }

function selectUnitRectangles(
  ownership: AutofitVisualUnitOwnership,
  reads: AutofitVisualReads,
  space: AutofitLocalCoordinateSpace,
): UnitRectSelection {
  const rawRectangles: AutofitGeometryRect[] = []
  for (const fragment of ownership.fragments) {
    if (fragment.kind === 'text') {
      rawRectangles.push(...reads.readTextRects(fragment.node))
      continue
    }

    const rectangle = reads.readElementRect(fragment.node)
    if (rectangle)
      rawRectangles.push(rectangle)
  }

  if (rawRectangles.length === 0)
    return { status: 'unsupported', reason: 'visual-rect-missing' }

  const rectangles: AutofitGeometryRect[] = []
  for (const rectangle of rawRectangles) {
    if (
      !Number.isFinite(rectangle.top)
      || !Number.isFinite(rectangle.bottom)
      || !Number.isFinite(rectangle.height)
    ) {
      return { status: 'unsupported', reason: 'visual-edge-nonfinite' }
    }

    if (rectangle.bottom <= rectangle.top || rectangle.height <= 0)
      continue

    const local = convertAutofitRectToLocal(rectangle, space)
    if (!Number.isFinite(local.top) || !Number.isFinite(local.bottom))
      return { status: 'unsupported', reason: 'visual-edge-nonfinite' }
    rectangles.push(local)
  }

  if (rectangles.length === 0)
    return { status: 'unsupported', reason: 'visual-rect-missing' }

  return { status: 'measured', rectangles }
}

function measureUnit(
  ownership: AutofitVisualUnitOwnership,
  reads: AutofitVisualReads,
  space: AutofitLocalCoordinateSpace,
):
  | { readonly status: 'measured'; readonly unit: AutofitVisualUnitMeasurement }
  | {
      readonly status: 'unsupported'
      readonly reason: 'visual-rect-missing' | 'visual-edge-nonfinite'
    } {
  const selection = selectUnitRectangles(ownership, reads, space)
  if (selection.status === 'unsupported')
    return selection

  const leading = Math.min(...selection.rectangles.map(rectangle => rectangle.top))
  const trailing = Math.max(...selection.rectangles.map(rectangle => rectangle.bottom))
  if (!Number.isFinite(leading) || !Number.isFinite(trailing))
    return { status: 'unsupported', reason: 'visual-edge-nonfinite' }

  return {
    status: 'measured',
    unit: { ownership, leading, trailing },
  }
}

export function measureAutofitVisualBoundaries(
  options: AutofitVisualBoundaryMeasurementOptions,
): AutofitVisualBoundaryMeasurementResult {
  const classificationFailure = selectFirstAutofitUnsupported(
    options.classification.visual.unsupported,
  )
  if (classificationFailure) {
    return {
      status: 'unsupported',
      reason: classificationFailure.reason,
      node: classificationFailure.node,
    }
  }

  const space = measureAutofitLocalCoordinateSpace(
    options.viewport,
    options.geometryReads,
  )
  if (space.status === 'deferred')
    return space

  const reads = options.visualReads ?? DEFAULT_VISUAL_READS
  const unitOutcomes = options.classification.visual.units.map(ownership => ({
    ownership,
    outcome: measureUnit(ownership, reads, space),
  }))

  const missingUnit = unitOutcomes.find(
    ({ outcome }) => outcome.status === 'unsupported'
      && outcome.reason === 'visual-rect-missing',
  )
  if (missingUnit) {
    return {
      status: 'unsupported',
      reason: 'visual-rect-missing',
      node: missingUnit.ownership.unit.root,
    }
  }

  const boundaryTargets = options.classification.visual.boundaries.map(
    (ownership) => {
      const target = ownership.kind === 'full'
        ? options.targets.fullTarget
        : options.targets.halfTarget
      return { ownership, target }
    },
  )
  const invalidTarget = boundaryTargets.find(
    ({ target }) => !Number.isFinite(target),
  )
  if (invalidTarget) {
    return {
      status: 'unsupported',
      reason: 'visual-target-nonfinite',
      node: invalidTarget.ownership.carrier,
    }
  }

  const invalidUnitEdge = unitOutcomes.find(
    ({ outcome }) => outcome.status === 'unsupported'
      && outcome.reason === 'visual-edge-nonfinite',
  )
  if (invalidUnitEdge) {
    return {
      status: 'unsupported',
      reason: 'visual-edge-nonfinite',
      node: invalidUnitEdge.ownership.unit.root,
    }
  }

  const units = unitOutcomes.map(({ outcome }) => {
    if (outcome.status !== 'measured')
      throw new TypeError('autofit visual unit outcome was not resolved')
    return outcome.unit
  })
  const boundaryInputs = boundaryTargets.map(({ ownership, target }, index) => {
    const preceding = units[index]
    const following = units[index + 1]
    const intrinsicWhitespace = following && preceding
      ? following.leading - preceding.trailing
      : Number.NaN
    return {
      ownership,
      preceding,
      following,
      target,
      intrinsicWhitespace,
    }
  })

  const invalidBoundaryEdge = boundaryInputs.find((boundary) => {
    return !boundary.preceding
      || !boundary.following
      || !Number.isFinite(boundary.preceding.trailing)
      || !Number.isFinite(boundary.following.leading)
      || !Number.isFinite(boundary.intrinsicWhitespace)
  })
  if (invalidBoundaryEdge) {
    return {
      status: 'unsupported',
      reason: 'visual-edge-nonfinite',
      node: invalidBoundaryEdge.ownership.carrier,
    }
  }

  const adjustedBoundaries = boundaryInputs.map(boundary => ({
    ...boundary,
    adjustment: boundary.target - boundary.intrinsicWhitespace,
  }))
  const invalidAdjustment = adjustedBoundaries.find(
    ({ adjustment }) => !Number.isFinite(adjustment),
  )
  if (invalidAdjustment) {
    return {
      status: 'unsupported',
      reason: 'carrier-adjustment-nonfinite',
      node: invalidAdjustment.ownership.carrier,
    }
  }

  const boundaries: AutofitVisualBoundaryMeasurement[] = []
  for (const boundary of adjustedBoundaries) {
    const {
      ownership,
      preceding,
      following,
      target,
      intrinsicWhitespace,
      adjustment,
    } = boundary
    if (!preceding || !following)
      throw new TypeError('autofit visual boundary anchors were not resolved')

    boundaries.push({
      kind: ownership.kind,
      carrier: ownership.carrier,
      preceding,
      following,
      intrinsicWhitespace,
      target,
      adjustment,
    })
  }

  return {
    status: 'measured',
    units,
    boundaries,
  }
}
