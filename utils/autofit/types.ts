export type AutofitRequestedAlignment =
  | 'top'
  | 'middle'
  | 'center'
  | 'bottom'
  | 'distributed'

export type AutofitEffectiveAlignment = Exclude<AutofitRequestedAlignment, 'center'>

export type AutofitNonDistributedAlignment = Extract<
  AutofitEffectiveAlignment,
  'top' | 'middle' | 'bottom'
>

export interface AutofitConfig {
  readonly largeTiers: number
  readonly smallTiers: number
  readonly tierIncrement: number
  readonly alignment: AutofitEffectiveAlignment
}

export type AutofitConfigErrorCode =
  | 'configuration-not-object'
  | 'unknown-property'
  | 'invalid-large-tiers'
  | 'invalid-small-tiers'
  | 'invalid-tier-increment'
  | 'invalid-alignment'
  | 'non-positive-smallest-scale'
  | 'non-finite-largest-scale'

export interface AutofitConfigError {
  readonly code: AutofitConfigErrorCode
  readonly property?: string
  readonly value?: unknown
}

export interface NormalizedAutofitConfig {
  readonly config: AutofitConfig
  readonly requestedAlignment: AutofitRequestedAlignment
  readonly valid: boolean
  readonly errors: readonly AutofitConfigError[]
}

export interface TierCandidate {
  readonly index: number
  readonly scale: number
}

export interface TierSearchResult {
  readonly tier: number
  readonly scale: number
  readonly fits: boolean
  readonly overflow: boolean
  readonly measurementCount: number
}

export interface TierSearchMachine {
  readonly candidate: TierCandidate | null
  readonly result: TierSearchResult | null
  record(candidateIndex: number, fits: boolean): void
}

export type AutofitGeometryDeferReason =
  | 'no-measurable-host'
  | 'invalid-host-scale'

export interface AutofitMeasuredCandidate {
  readonly status: 'measured'
  readonly fits: boolean
}

export interface AutofitDeferredCandidate {
  readonly status: 'deferred'
  readonly reason: AutofitGeometryDeferReason
}

export interface AutofitUnsupportedCandidate {
  readonly status: 'unsupported'
  readonly reason: AutofitUnsupportedReason
}

export type AutofitFinalCandidateMeasurement =
  | AutofitMeasuredCandidate
  | AutofitDeferredCandidate
  | AutofitUnsupportedCandidate

export interface AutofitMeasuredIntrinsicCandidate<Payload = unknown> {
  readonly status: 'measured'
  readonly payload: Payload
}

export type AutofitIntrinsicCandidateMeasurement<Payload = unknown> =
  | AutofitMeasuredIntrinsicCandidate<Payload>
  | AutofitDeferredCandidate
  | AutofitUnsupportedCandidate

export type AutofitCandidateReadPhase = 'intrinsic' | 'final'

export interface AutofitMeasurementResult {
  readonly status: 'completed'
  readonly passId: number
  readonly frameId: number
  readonly batchId: number
  readonly candidateMeasurementCount: number
  readonly result: TierSearchResult
}

export interface AutofitDeferredMeasurement {
  readonly status: 'deferred'
  readonly passId: number
  readonly frameId: number
  readonly batchId: number
  readonly candidateMeasurementCount: number
  readonly phase: AutofitCandidateReadPhase
  readonly reason: AutofitGeometryDeferReason
}

export interface AutofitUnsupportedMeasurement {
  readonly status: 'unsupported'
  readonly passId: number
  readonly frameId: number
  readonly batchId: number
  readonly candidateMeasurementCount: number
  readonly phase: AutofitCandidateReadPhase
  readonly reason: AutofitUnsupportedReason
}

export interface AutofitDiscardedMeasurement {
  readonly status: 'discarded'
  readonly passId: number
  readonly candidateMeasurementCount: number
  readonly reason: AutofitDiscardReason
}

export type AutofitMeasurementFinish =
  | AutofitMeasurementResult
  | AutofitDeferredMeasurement
  | AutofitUnsupportedMeasurement
  | AutofitDiscardedMeasurement

export interface AutofitMeasurementJob {
  readonly instanceId: string
  readonly config: AutofitConfig
  /** Internal scheduler seam for one verified configured tier measurement. */
  readonly fixedTier?: number
  finish(result: AutofitMeasurementFinish): void
  /**
   * Restores a retained presentation between non-terminal candidate rounds.
   * Terminal restoration belongs to finish().
   */
  restore?(): void
}

export interface AutofitMeasurementJobHandle {
  readonly passId: number
  readonly active: boolean
  cancel(): void
}

export interface AutofitDiagnosticJob {
  readonly instanceId: string
  readonly passId: number
}

export type AutofitDiscardReason = 'cancelled' | 'superseded'

export interface AutofitDiscardedJob extends AutofitDiagnosticJob {
  readonly reason: AutofitDiscardReason
}

export interface AutofitSchedulerBatchEvent {
  readonly frameId: number
  readonly batchId: number
  readonly jobs: readonly AutofitDiagnosticJob[]
}

export interface AutofitSchedulerBatchDiagnostic
  extends AutofitSchedulerBatchEvent {
  readonly intrinsicWritePhaseCount: number
  readonly intrinsicReadPhaseCount: number
  readonly compensatedWritePhaseCount: number
  readonly finalReadPhaseCount: number
}

export interface AutofitCandidateMeasurementDiagnostic extends AutofitDiagnosticJob {
  readonly count: number
}

export interface AutofitSchedulerDiagnosticsSnapshot {
  readonly lastFrameId: number
  readonly lastBatchId: number
  readonly frameCount: number
  readonly batchCount: number
  readonly intrinsicWritePhaseCount: number
  readonly intrinsicReadPhaseCount: number
  readonly compensatedWritePhaseCount: number
  readonly finalReadPhaseCount: number
  readonly discardedJobCount: number
  readonly batches: readonly AutofitSchedulerBatchDiagnostic[]
  readonly candidateMeasurements: readonly AutofitCandidateMeasurementDiagnostic[]
  readonly discardedJobs: readonly AutofitDiscardedJob[]
}

export interface AutofitSchedulerDiagnosticSink {
  recordBatch(batch: AutofitSchedulerBatchEvent): void
  recordCandidateMeasurement(job: AutofitDiagnosticJob): void
  recordDiscardedJob(job: AutofitDiagnosticJob, reason: AutofitDiscardReason): void
}

export interface AutofitSchedulerDiagnostics
  extends AutofitSchedulerDiagnosticSink {
  snapshot(): AutofitSchedulerDiagnosticsSnapshot
  reset(): void
}

export interface GapCounts {
  readonly full: number
  readonly half: number
}

export interface AutofitVisualGapTargets {
  readonly fullTarget: number
  readonly halfTarget: number
}

export interface AlignmentPadding {
  readonly before: number
  readonly after: number
}

export interface DistributedAlignment {
  readonly effectiveAlignment: 'middle' | 'distributed'
  readonly additionalGap: number
  readonly fullGapAddition: number
  readonly halfGapAddition: number
  readonly paddingBefore: number
  readonly paddingAfter: number
}

export type AutofitGapKind = 'full' | 'half'

export type AutofitSemanticUnitKind =
  | 'heading'
  | 'paragraph'
  | 'list-item'
  | 'atomic'
  | 'media'

export interface AutofitSemanticUnit {
  readonly root: Element
  readonly kind: AutofitSemanticUnitKind
  readonly incomingGap: AutofitGapKind | null
  readonly carrier: Element
}

export interface AutofitSemanticBoundary {
  readonly kind: AutofitGapKind
  readonly carrier: Element
  readonly before: Element
}

export const AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE = [
  'root-text',
  'display-contents-root',
  'list-item-missing-leading-content',
  'list-item-noncontiguous-content',
  'visual-rect-missing',
  'visual-target-nonfinite',
  'visual-edge-nonfinite',
  'carrier-adjustment-nonfinite',
  'base-gap-verification',
] as const

/** Reasons produced by ordinary AutoFit measurement and verification. */
export type AutofitMeasurementUnsupportedReason =
  typeof AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE[number]

/**
 * Reasons that can be published by AutoFit. Ordinary measurement continues to
 * use the measurement-only precedence list; coordinated target verification
 * adds its own terminal reason without changing that precedence.
 */
export type AutofitUnsupportedReason =
  | AutofitMeasurementUnsupportedReason
  | 'coordinated-gap-verification'
  | 'coordinated-start-alignment-verification'

export type UnsupportedAutofitOutputReason =
  Extract<AutofitUnsupportedReason, 'root-text' | 'display-contents-root'>

export interface UnsupportedAutofitOutput {
  readonly reason: UnsupportedAutofitOutputReason
  readonly node: Node
}

export interface AutofitUnsupportedOutput {
  readonly reason: AutofitUnsupportedReason
  readonly node: Node
}

export type AutofitVisualFragment =
  | {
      readonly kind: 'text'
      readonly node: Text
    }
  | {
      readonly kind: 'media' | 'atomic-root'
      readonly node: Element
    }

export interface AutofitVisualUnitOwnership {
  readonly unit: AutofitSemanticUnit
  readonly fragments: readonly AutofitVisualFragment[]
}

export interface AutofitVisualBoundaryOwnership {
  readonly kind: AutofitGapKind
  readonly carrier: Element
  readonly preceding: AutofitVisualUnitOwnership
  readonly following: AutofitVisualUnitOwnership
}

export interface AutofitVisualClassification {
  readonly units: readonly AutofitVisualUnitOwnership[]
  readonly boundaries: readonly AutofitVisualBoundaryOwnership[]
  readonly unsupported: readonly AutofitUnsupportedOutput[]
}

export interface AutofitClassification {
  readonly units: readonly AutofitSemanticUnit[]
  readonly boundaries: readonly AutofitSemanticBoundary[]
  readonly marginResetElements: readonly Element[]
  readonly gapCounts: GapCounts
  readonly unsupported: readonly UnsupportedAutofitOutput[]
  /** Contiguous visual ownership used by active compensated fitting. */
  readonly visual: AutofitVisualClassification
}

export type AutofitLineHeight = number | 'normal'

export interface AutofitComputedTypographyStyle {
  readonly fontSize: string
  readonly lineHeight: string
}

export interface AutofitTypographyBaselineEntry {
  readonly element: Element
  readonly fontSize: number
  readonly lineHeight: AutofitLineHeight
}

export interface AutofitTypographyAdapterOptions {
  readComputedStyle(element: Element): AutofitComputedTypographyStyle
}

export interface AutofitTypographyAdapter {
  prepareNeutralCapture(): void
  inspectNeutral(): readonly AutofitTypographyBaselineEntry[]
  captureNeutral(): readonly AutofitTypographyBaselineEntry[]
  /** A retained presentation may supply its captured neutral typography. */
  applyTier(scale: number, baseline?: readonly AutofitTypographyBaselineEntry[]): void
  cleanup(): void
}

export interface AutofitSpacingAdapter {
  prepareIntrinsic(): void
  applyAdjustments(adjustments: readonly number[]): void
  cleanup(): void
}

export interface AutofitGeometryRect {
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
  readonly width: number
  readonly height: number
}

export interface AutofitLocalCoordinateSpace {
  readonly status: 'measured'
  readonly host: Element
  readonly viewportRect: AutofitGeometryRect
  readonly viewportInlineSize: number
  readonly viewportBlockSize: number
  readonly inlineScale: number
  readonly blockScale: number
}

export interface AutofitDeferredLocalCoordinateSpace {
  readonly status: 'deferred'
  readonly reason: AutofitGeometryDeferReason
}

export type AutofitLocalCoordinateSpaceMeasurement =
  | AutofitLocalCoordinateSpace
  | AutofitDeferredLocalCoordinateSpace

export interface AutofitVisualReads {
  readTextRects(node: Text): readonly AutofitGeometryRect[]
  readElementRect(node: Element): AutofitGeometryRect | null
}

export interface AutofitVisualUnitMeasurement {
  readonly ownership: AutofitVisualUnitOwnership
  readonly leading: number
  readonly trailing: number
}

export interface AutofitVisualBoundaryMeasurement {
  readonly kind: AutofitGapKind
  readonly carrier: Element
  readonly preceding: AutofitVisualUnitMeasurement
  readonly following: AutofitVisualUnitMeasurement
  readonly intrinsicWhitespace: number
  readonly target: number
  readonly adjustment: number
}

export interface AutofitMeasuredVisualBoundaries {
  readonly status: 'measured'
  readonly units: readonly AutofitVisualUnitMeasurement[]
  readonly boundaries: readonly AutofitVisualBoundaryMeasurement[]
}

export interface AutofitUnsupportedVisualBoundaries {
  readonly status: 'unsupported'
  readonly reason: AutofitUnsupportedReason
  readonly node: Node
}

export type AutofitVisualBoundaryMeasurementResult =
  | AutofitMeasuredVisualBoundaries
  | AutofitDeferredLocalCoordinateSpace
  | AutofitUnsupportedVisualBoundaries

export interface AutofitVisualBoundaryMeasurementOptions {
  readonly viewport: Element
  readonly classification: AutofitClassification
  readonly targets: AutofitVisualGapTargets
  readonly geometryReads?: AutofitGeometryReads
  readonly visualReads?: AutofitVisualReads
}

export interface AutofitComputedBoxStyle {
  readonly width: string
  readonly height: string
  readonly display: string
  readonly position: string
  readonly transform: string
  readonly translate: string
  readonly rotate: string
  readonly scale: string
  readonly marginTop: string
  readonly marginRight: string
  readonly marginBottom: string
  readonly marginLeft: string
}

export interface AutofitScrollExtent {
  readonly inlineSize: number
  readonly blockSize: number
}

export interface AutofitGeometryReads {
  readComputedStyle(element: Element): AutofitComputedBoxStyle
  readBoundingRect(element: Element): AutofitGeometryRect
  readClientRectCount(element: Element): number
  readScrollExtent(element: Element): AutofitScrollExtent
}

export interface AutofitContentBounds {
  readonly minInline: number
  readonly maxInline: number
  readonly minBlock: number
  readonly maxBlock: number
}

export interface AutofitMeasuredGeometry {
  readonly status: 'measured'
  readonly host: Element
  readonly viewportInlineSize: number
  readonly viewportBlockSize: number
  readonly inlineScale: number
  readonly blockScale: number
  readonly bounds: AutofitContentBounds
  readonly contentInlineExtent: number
  readonly contentBlockExtent: number
  readonly emptySpace: number
  readonly fits: boolean
}

export interface AutofitEmptyGeometry {
  readonly status: 'empty'
}

export interface AutofitDeferredGeometry {
  readonly status: 'deferred'
  readonly reason: AutofitGeometryDeferReason
}

export type AutofitGeometryMeasurement =
  | AutofitMeasuredGeometry
  | AutofitEmptyGeometry
  | AutofitDeferredGeometry

export interface AutofitGeometryMeasurementOptions {
  readonly viewport: Element
  readonly flow: Element
  readonly classification: AutofitClassification
  readonly semanticallyEmpty?: boolean
  readonly reads?: AutofitGeometryReads
}
