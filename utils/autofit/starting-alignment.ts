import {
  convertAutofitRectToLocal,
  measureAutofitLocalCoordinateSpace,
  AUTOFIT_FIT_TOLERANCE,
} from './geometry'
import type {
  AutofitClassification,
  AutofitDeferredLocalCoordinateSpace,
  AutofitGeometryReads,
  AutofitGeometryRect,
  AutofitLocalCoordinateSpace,
  AutofitUnsupportedReason,
  AutofitVisualReads,
  AutofitVisualUnitOwnership,
} from './types'

export interface AutofitMeasuredStartingLineAnchor {
  readonly status: 'measured'
  readonly anchor: number
  readonly ownership: AutofitVisualUnitOwnership
}

export interface AutofitUnsupportedStartingLineAnchor {
  readonly status: 'unsupported'
  readonly reason: AutofitUnsupportedReason
  readonly node: Node
}

export type AutofitStartingLineAnchorMeasurement =
  | AutofitMeasuredStartingLineAnchor
  | AutofitDeferredLocalCoordinateSpace
  | AutofitUnsupportedStartingLineAnchor

export interface AutofitStartingLineAnchorMeasurementOptions {
  readonly viewport: Element
  readonly classification: AutofitClassification
  readonly geometryReads?: AutofitGeometryReads
  readonly visualReads?: AutofitVisualReads
}

/**
 * Numeric viewport state expressed against the bridge-owned pair host. The
 * origin is already in rendered CSS pixels, so the pair-host scale guards the
 * shared coordinate space but does not rescale the origin a second time.
 */
export interface AutofitRenderedCoordinateSpace {
  readonly viewportBlockOrigin: number
  readonly viewportBlockScale: number
  readonly viewportBlockSize: number
  readonly pairHostBlockScale: number
}

export interface AutofitMeasuredRenderedCoordinateSpace {
  readonly status: 'measured'
  readonly coordinate: AutofitRenderedCoordinateSpace
}

export type AutofitRenderedCoordinateSpaceMeasurement =
  | AutofitMeasuredRenderedCoordinateSpace
  | AutofitDeferredLocalCoordinateSpace

export interface AutofitRenderedCoordinateSpaceMeasurementOptions {
  readonly viewport: Element
  readonly pairHost: Element
  readonly geometryReads?: AutofitGeometryReads
}

export interface AutofitRenderedStartingAnchor
  extends AutofitRenderedCoordinateSpace {
  readonly localAnchor: number
}

export interface AutofitSourceAnchorSnapshot
  extends AutofitRenderedStartingAnchor {}

export interface AutofitMeasuredSourceAnchorSnapshot {
  readonly status: 'measured'
  readonly snapshot: AutofitSourceAnchorSnapshot
}

export type AutofitSourceAnchorSnapshotMeasurement =
  | AutofitMeasuredSourceAnchorSnapshot
  | AutofitDeferredLocalCoordinateSpace
  | AutofitUnsupportedStartingLineAnchor

export interface AutofitSourceAnchorSnapshotMeasurementOptions
  extends AutofitStartingLineAnchorMeasurementOptions {
  readonly pairHost: Element
}

export interface AutofitMeasuredStartingAlignmentCoordinates {
  readonly status: 'measured'
  readonly sourceRenderedAnchor: number
  readonly targetRenderedAnchor: number
  readonly renderedDelta: number
  readonly targetLocalDelta: number
}

export type AutofitStartingAlignmentCoordinatesMeasurement =
  | AutofitMeasuredStartingAlignmentCoordinates
  | AutofitDeferredLocalCoordinateSpace

export interface AutofitStartingAlignmentCoordinatesOptions {
  readonly source: AutofitSourceAnchorSnapshot
  readonly currentSource: AutofitRenderedCoordinateSpace
  readonly target: AutofitRenderedStartingAnchor
}

type RenderedCoordinateSpaceRead =
  | {
      readonly status: 'measured'
      readonly coordinate: AutofitRenderedCoordinateSpace
      readonly viewportSpace: AutofitLocalCoordinateSpace
    }
  | AutofitDeferredLocalCoordinateSpace

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

type AnchorEdgeSelection =
  | { readonly status: 'measured'; readonly edge: number }
  | {
      readonly status: 'unsupported'
      readonly reason: 'visual-rect-missing' | 'visual-edge-nonfinite'
    }

function selectLocalEdge(
  rectangle: AutofitGeometryRect,
  space: AutofitLocalCoordinateSpace,
): number | null | 'non-finite' {
  if (
    !Number.isFinite(rectangle.top)
    || !Number.isFinite(rectangle.bottom)
    || !Number.isFinite(rectangle.height)
  ) {
    return 'non-finite'
  }
  if (rectangle.bottom <= rectangle.top || rectangle.height <= 0)
    return null

  const local = convertAutofitRectToLocal(rectangle, space)
  return Number.isFinite(local.top) && Number.isFinite(local.bottom)
    ? local.top
    : 'non-finite'
}

function selectTextAnchor(
  ownership: AutofitVisualUnitOwnership,
  reads: AutofitVisualReads,
  space: AutofitLocalCoordinateSpace,
): AnchorEdgeSelection {
  const edges: number[] = []
  for (const fragment of ownership.fragments) {
    if (fragment.kind !== 'text')
      continue

    for (const rectangle of reads.readTextRects(fragment.node)) {
      const edge = selectLocalEdge(rectangle, space)
      if (edge === 'non-finite')
        return { status: 'unsupported', reason: 'visual-edge-nonfinite' }
      if (edge !== null)
        edges.push(edge)
    }
  }

  if (edges.length === 0)
    return { status: 'unsupported', reason: 'visual-rect-missing' }

  const edge = Math.min(...edges)
  return Number.isFinite(edge)
    ? { status: 'measured', edge }
    : { status: 'unsupported', reason: 'visual-edge-nonfinite' }
}

function selectVisualEdge(
  ownership: AutofitVisualUnitOwnership,
  reads: AutofitVisualReads,
  space: AutofitLocalCoordinateSpace,
): AnchorEdgeSelection {
  for (const fragment of ownership.fragments) {
    if (fragment.kind === 'text')
      continue

    const rectangle = reads.readElementRect(fragment.node)
    if (!rectangle)
      continue

    const edge = selectLocalEdge(rectangle, space)
    if (edge === 'non-finite')
      return { status: 'unsupported', reason: 'visual-edge-nonfinite' }
    if (edge !== null)
      return { status: 'measured', edge }
  }

  return { status: 'unsupported', reason: 'visual-rect-missing' }
}

function measureStartingAnchorInSpace(
  classification: AutofitClassification,
  reads: AutofitVisualReads,
  space: AutofitLocalCoordinateSpace,
  fallbackNode: Node,
): AutofitMeasuredStartingLineAnchor | AutofitUnsupportedStartingLineAnchor {
  const classificationFailure = classification.visual.unsupported[0]
  if (classificationFailure) {
    return {
      status: 'unsupported',
      reason: classificationFailure.reason,
      node: classificationFailure.node,
    }
  }

  const ownership = classification.visual.units[0]
  if (!ownership) {
    return {
      status: 'unsupported',
      reason: 'visual-rect-missing',
      node: fallbackNode,
    }
  }

  const hasText = ownership.fragments.some(fragment => fragment.kind === 'text')
  const selection = hasText
    ? selectTextAnchor(ownership, reads, space)
    : selectVisualEdge(ownership, reads, space)
  if (selection.status === 'unsupported') {
    return {
      status: 'unsupported',
      reason: selection.reason,
      node: ownership.unit.root,
    }
  }

  return {
    status: 'measured',
    anchor: selection.edge,
    ownership,
  }
}

export function measureAutofitStartingLineAnchor(
  options: AutofitStartingLineAnchorMeasurementOptions,
): AutofitStartingLineAnchorMeasurement {
  const space = measureAutofitLocalCoordinateSpace(
    options.viewport,
    options.geometryReads,
  )
  if (space.status === 'deferred')
    return space

  return measureStartingAnchorInSpace(
    options.classification,
    options.visualReads ?? DEFAULT_VISUAL_READS,
    space,
    options.viewport,
  )
}

export function measureAutofitRenderedCoordinateSpace(
  options: AutofitRenderedCoordinateSpaceMeasurementOptions,
): AutofitRenderedCoordinateSpaceMeasurement {
  const measurement = readAutofitRenderedCoordinateSpace(options)
  if (measurement.status === 'deferred')
    return measurement

  return {
    status: 'measured',
    coordinate: measurement.coordinate,
  }
}

function readAutofitRenderedCoordinateSpace(
  options: AutofitRenderedCoordinateSpaceMeasurementOptions,
): RenderedCoordinateSpaceRead {
  const viewportSpace = measureAutofitLocalCoordinateSpace(
    options.viewport,
    options.geometryReads,
  )
  if (viewportSpace.status === 'deferred')
    return viewportSpace

  const pairHostSpace = measureAutofitLocalCoordinateSpace(
    options.pairHost,
    options.geometryReads,
  )
  if (pairHostSpace.status === 'deferred')
    return pairHostSpace

  const viewportBlockOrigin = viewportSpace.viewportRect.top
    - pairHostSpace.viewportRect.top
  const coordinate = {
    viewportBlockOrigin,
    viewportBlockScale: viewportSpace.blockScale,
    viewportBlockSize: viewportSpace.viewportBlockSize,
    pairHostBlockScale: pairHostSpace.blockScale,
  }
  if (!isValidCoordinate(coordinate, false))
    return { status: 'deferred', reason: 'invalid-host-scale' }

  return { status: 'measured', coordinate, viewportSpace }
}

export function measureAutofitStartingAlignmentSourceSnapshot(
  options: AutofitSourceAnchorSnapshotMeasurementOptions,
): AutofitSourceAnchorSnapshotMeasurement {
  const coordinate = readAutofitRenderedCoordinateSpace(options)
  if (coordinate.status === 'deferred')
    return coordinate
  if (!isValidCoordinate(coordinate.coordinate, true))
    return { status: 'deferred', reason: 'invalid-host-scale' }

  const anchor = measureStartingAnchorInSpace(
    options.classification,
    options.visualReads ?? DEFAULT_VISUAL_READS,
    coordinate.viewportSpace,
    options.viewport,
  )
  if (anchor.status !== 'measured')
    return anchor

  return {
    status: 'measured',
    snapshot: {
      localAnchor: anchor.anchor,
      ...coordinate.coordinate,
    },
  }
}

function isFinitePositive(value: number): boolean {
  return Number.isFinite(value) && value > 0
}

function isValidCoordinate(
  coordinate: AutofitRenderedCoordinateSpace,
  requirePositiveBlockSize: boolean,
): boolean {
  return Number.isFinite(coordinate.viewportBlockOrigin)
    && isFinitePositive(coordinate.viewportBlockScale)
    && Number.isFinite(coordinate.viewportBlockSize)
    && (requirePositiveBlockSize
      ? coordinate.viewportBlockSize > 0
      : coordinate.viewportBlockSize >= 0)
    && isFinitePositive(coordinate.pairHostBlockScale)
}

function isWithinVisualTolerance(left: number, right: number): boolean {
  return Math.abs(left - right) <= AUTOFIT_FIT_TOLERANCE
}

/**
 * Confirms that the captured source coordinate space is still usable. Session,
 * epoch, and participant identity guards intentionally remain at the bridge
 * boundary, where they can be checked without entering this numeric payload.
 */
export function isAutofitSourceAnchorSnapshotCompatible(
  snapshot: AutofitSourceAnchorSnapshot,
  current: AutofitRenderedCoordinateSpace,
): boolean {
  return Number.isFinite(snapshot.localAnchor)
    && isValidCoordinate(snapshot, true)
    && isValidCoordinate(current, true)
    && isWithinVisualTolerance(
      snapshot.viewportBlockOrigin,
      current.viewportBlockOrigin,
    )
    && isWithinVisualTolerance(
      snapshot.viewportBlockScale,
      current.viewportBlockScale,
    )
    && isWithinVisualTolerance(
      snapshot.viewportBlockSize,
      current.viewportBlockSize,
    )
    && isWithinVisualTolerance(
      snapshot.pairHostBlockScale,
      current.pairHostBlockScale,
    )
}

/** Converts a local starting anchor into the pair-relative rendered block axis. */
export function calculateAutofitPairRelativeRenderedAnchor(
  anchor: AutofitRenderedStartingAnchor,
): number {
  return anchor.viewportBlockOrigin
    + anchor.localAnchor * anchor.viewportBlockScale
}

export function resolveAutofitStartingAlignmentCoordinates(
  options: AutofitStartingAlignmentCoordinatesOptions,
): AutofitStartingAlignmentCoordinatesMeasurement {
  const { source, currentSource, target } = options
  if (
    !isAutofitSourceAnchorSnapshotCompatible(source, currentSource)
    || !Number.isFinite(target.localAnchor)
    || !isValidCoordinate(target, false)
    || !isWithinVisualTolerance(
      currentSource.pairHostBlockScale,
      target.pairHostBlockScale,
    )
  ) {
    return { status: 'deferred', reason: 'invalid-host-scale' }
  }

  const sourceRenderedAnchor = calculateAutofitPairRelativeRenderedAnchor({
    localAnchor: source.localAnchor,
    ...currentSource,
  })
  const targetRenderedAnchor = calculateAutofitPairRelativeRenderedAnchor(target)
  const renderedDelta = sourceRenderedAnchor - targetRenderedAnchor
  const targetLocalDelta = renderedDelta / target.viewportBlockScale
  if (
    !Number.isFinite(sourceRenderedAnchor)
    || !Number.isFinite(targetRenderedAnchor)
    || !Number.isFinite(renderedDelta)
    || !Number.isFinite(targetLocalDelta)
  ) {
    return { status: 'deferred', reason: 'invalid-host-scale' }
  }

  return {
    status: 'measured',
    sourceRenderedAnchor,
    targetRenderedAnchor,
    renderedDelta,
    targetLocalDelta,
  }
}
