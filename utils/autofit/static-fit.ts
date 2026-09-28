import {
  calculateAlignmentPadding,
  calculateDistributedBoundaryCompensations,
  calculateDistributedAlignment,
} from './distribution'
import { getTierScale } from './tiers'
import {
  AutofitGeneratedStyleOwner,
  AutofitTransitionStyleOwner,
} from './generated-styles'
import {
  AUTOFIT_FIT_TOLERANCE,
  measureAutofitGeometry,
} from './geometry'
import { createAutofitSpacingAdapter } from './spacing'
import { createAutofitTypographyAdapter } from './typography'
import {
  calculateAutofitCarrierAdjustment,
  calculateAutofitVisualGapTargets,
  measureAutofitVisualBoundaries,
  verifyAutofitVisualGaps,
} from './visual-spacing'
import {
  calculateAutofitPairRelativeRenderedAnchor,
  measureAutofitRenderedCoordinateSpace,
  measureAutofitStartingAlignmentSourceSnapshot,
  resolveAutofitStartingAlignmentCoordinates,
} from './starting-alignment'
import type {
  AlignmentPadding,
  AutofitClassification,
  AutofitConfig,
  AutofitEffectiveAlignment,
  AutofitFinalCandidateMeasurement,
  AutofitIntrinsicCandidateMeasurement,
  AutofitMeasuredGeometry,
  AutofitMeasuredVisualBoundaries,
  AutofitGeometryMeasurement,
  AutofitVisualGapTargets,
  AutofitSpacingAdapter,
  AutofitTypographyAdapter,
  AutofitTypographyBaselineEntry,
  AutofitMeasurementUnsupportedReason,
  AutofitUnsupportedReason,
  GapCounts,
  TierCandidate,
  TierSearchResult,
} from './types'
import type {
  AutofitRenderedCoordinateSpace,
  AutofitRenderedCoordinateSpaceMeasurement,
  AutofitSourceAnchorSnapshot,
  AutofitSourceAnchorSnapshotMeasurement,
} from './starting-alignment'

const BASE_SPACING_PROPERTY = '--slidev-autofit-base-spacing'
const CSS_PIXEL_VALUE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))px$/i
const CSS_PRECISION = 1e9
const TEST_HOOK_GLOBAL_KEY = '__slidevAutofitTestHooks'

type AutofitCoordinatedTargetSynchronizationCheckpoint =
  | 'after-gap-mutation'
  | 'after-target-anchor'
  | 'after-alignment-mutation'
  | 'after-final-reads'

interface AutofitTestHooks {
  afterNeutralProbeRestore?(viewport: HTMLElement): void
  afterIntrinsicCandidateWrite?(viewport: HTMLElement): void
  beforeDistributionCommitBarrier?(viewport: HTMLElement): void
  forceDistributedVerificationFailure?(viewport: HTMLElement): boolean
  forceNeutralProbeFailure?(viewport: HTMLElement): boolean
  forceRestoredBaseVerificationFailure?(viewport: HTMLElement): boolean
  /** Narrow test-only seam for coordinator cached-result rejection coverage. */
  forceCachedTierNonFit?(viewport: HTMLElement, tier: number): boolean
  forceCoordinatedTargetOverflow?(viewport: HTMLElement): boolean
  forceCoordinatedGapVerificationFailure?(viewport: HTMLElement): boolean
  forceCoordinatedStartAlignmentVerificationFailure?(viewport: HTMLElement): boolean
  forceCoordinatedCandidateAnchorUnsupportedReason?(
    viewport: HTMLElement,
  ): AutofitMeasurementUnsupportedReason | null
  /** Test-only observation at the active transient common-tier capture point. */
  afterCoordinatedCandidateAnchorCaptured?(
    viewport: HTMLElement,
    snapshot: AutofitSourceAnchorSnapshot,
  ): void
  /** DEV/test-only control for a source coordinate read between capture and use. */
  overrideCoordinatedCurrentSourceCoordinate?(
    viewport: HTMLElement,
    coordinate: AutofitRenderedCoordinateSpace,
  ): AutofitRenderedCoordinateSpace
  forceCoordinatedVisualUnsupportedReason?(
    viewport: HTMLElement,
  ): AutofitMeasurementUnsupportedReason | null
  /** Test-only observation of a private coordinated target terminal. */
  afterCoordinatedGapPlanApplied?(
    viewport: HTMLElement,
    plan: AutofitCoordinatedGapPlan,
    application: AutofitCoordinatedTargetApplication,
    localResult: AutofitStaticFitResult,
  ): void
  /** Test-only observation of the complete private target alignment operation. */
  afterCoordinatedStartingAlignmentApplied?(
    viewport: HTMLElement,
    details: {
      readonly sourceRenderedAnchor: number
      readonly targetRenderedAnchor: number
      readonly targetLocalDelta: number
      readonly targetBlockScale: number
      readonly paddingShift: number
      readonly residualBlockOffset: number
      readonly finalAnchorError: number | null
      readonly application: AutofitCoordinatedTargetApplication
    },
  ): void
  /** DEV/test-only synchronous lifecycle seam inside target synchronization. */
  afterCoordinatedTargetSynchronizationCheckpoint?(
    viewport: HTMLElement,
    checkpoint: AutofitCoordinatedTargetSynchronizationCheckpoint,
  ): void
}

export interface AutofitClassificationSignature {
  readonly displayMathElements?: readonly Element[]
  readonly units: readonly {
    readonly kind: string
    readonly root: Element
  }[]
  readonly boundaries: readonly {
    readonly kind: string
    readonly carrier: Element
  }[]
}

export interface AutofitBoundaryPresentation {
  readonly kind: 'full' | 'half'
  readonly carrier: Element
  readonly target: number
  readonly adjustment: number
}

export interface AutofitStaticFitResult {
  readonly tier: number
  readonly scale: number
  readonly overflow: boolean
  readonly effectiveAlignment: AutofitEffectiveAlignment
  readonly gapCounts: GapCounts
  readonly presentation: AutofitStaticPresentation
}

export type AutofitCoordinatedGapTargetProvenance = 'observed' | 'derived'

/**
 * Private `auto-column` transfer data. Targets are absolute verified visual
 * whitespace values; carrier adjustments remain local to the target session.
 */
export interface AutofitCoordinatedGapPlan {
  readonly targets: AutofitVisualGapTargets
  readonly provenance: {
    readonly full: AutofitCoordinatedGapTargetProvenance
    readonly half: AutofitCoordinatedGapTargetProvenance
  }
}

/** A private target-only failure union; ordinary AutoFit remains measurement-only. */
export type AutofitCoordinatedTargetFailureReason =
  | AutofitMeasurementUnsupportedReason
  | 'coordinated-gap-verification'
  | 'coordinated-start-alignment-verification'

export interface AutofitCoordinatedTargetOverflowCauses {
  readonly coordinatedGap: boolean
  readonly coordinatedStartAlignment: boolean
}

export type AutofitCoordinatedTargetVisualVerification =
  | {
      readonly status: 'measured'
      readonly realizedWhitespace: readonly number[]
    }
  | {
      readonly status: 'deferred'
    }
  | {
      readonly status: 'unsupported'
      readonly reason: AutofitMeasurementUnsupportedReason
    }

export type AutofitCoordinatedTargetApplication =
  | {
      readonly status: 'synchronized-fit'
      readonly plan: AutofitCoordinatedGapPlan
      readonly result: AutofitStaticFitResult
    }
  | {
      readonly status: 'synchronized-overflow'
      readonly plan: AutofitCoordinatedGapPlan
      readonly result: AutofitStaticFitResult
      readonly overflowCauses: AutofitCoordinatedTargetOverflowCauses
    }
  | {
      readonly status: 'unsupported'
      /** Retained only for private coordination diagnostics and later publication. */
      readonly plan: AutofitCoordinatedGapPlan
      readonly reason: AutofitCoordinatedTargetFailureReason
    }
  | {
      readonly status: 'stale'
    }

export type AutofitStaticFitApplication =
  | {
      readonly status: 'committed'
      readonly result: AutofitStaticFitResult
    }
  | {
      readonly status: 'stale'
    }
  | {
      readonly status: 'unsupported'
      readonly reason: AutofitUnsupportedReason
    }

function observedAutofitPresentationTarget(
  presentation: AutofitStaticPresentation,
  kind: AutofitBoundaryPresentation['kind'],
): number | null {
  const target = presentation.boundaries.find(boundary => boundary.kind === kind)
    ?.target
  return target !== undefined && Number.isFinite(target) ? target : null
}

/**
 * Produces a complete transferable plan only from an eligible verified
 * effective-distributed presentation. It deliberately reads saved targets,
 * never realized whitespace or local carrier adjustments.
 */
export function extractAutofitCoordinatedGapPlan(
  source: AutofitStaticFitResult,
): AutofitCoordinatedGapPlan | null {
  if (source.effectiveAlignment !== 'distributed')
    return null

  const observedFull = observedAutofitPresentationTarget(source.presentation, 'full')
  const observedHalf = observedAutofitPresentationTarget(source.presentation, 'half')
  if (observedFull === null && observedHalf === null)
    return null

  return {
    targets: {
      fullTarget: observedFull ?? observedHalf! * 2,
      halfTarget: observedHalf ?? observedFull! / 2,
    },
    provenance: {
      full: observedFull === null ? 'derived' : 'observed',
      half: observedHalf === null ? 'derived' : 'observed',
    },
  }
}

type AutofitRestoredBaseVisualVerification =
  | {
      readonly status: 'measured'
      readonly realizedWhitespace: readonly number[]
    }
  | {
      readonly status: 'deferred'
      readonly reason: string
    }
  | {
      readonly status: 'unsupported'
      readonly reason: AutofitUnsupportedReason
    }

export function resolveAutofitRestoredBaseVerification(options: {
  readonly geometry: AutofitGeometryMeasurement
  readonly visual: AutofitRestoredBaseVisualVerification
  readonly expected: readonly Pick<AutofitMeasuredVisualBoundaries['boundaries'][number], 'target'>[]
  readonly forceGapFailure?: boolean
}):
  | { readonly status: 'valid' }
  | { readonly status: 'stale' }
  | {
      readonly status: 'unsupported'
      readonly reason: AutofitUnsupportedReason
    } {
  if (options.geometry.status !== 'measured' || !options.geometry.fits)
    return { status: 'stale' }
  if (options.visual.status === 'deferred')
    return { status: 'stale' }
  if (options.visual.status === 'unsupported') {
    return {
      status: 'unsupported',
      reason: options.visual.reason,
    }
  }
  if (
    options.forceGapFailure === true
    || !verifyAutofitVisualGaps(
      options.expected,
      options.visual.realizedWhitespace,
    )
  ) {
    return {
      status: 'unsupported',
      reason: 'base-gap-verification',
    }
  }
  return { status: 'valid' }
}

export interface AutofitStaticPresentation {
  readonly signature: AutofitClassificationSignature
  /** Exact neutral typography captured with this published presentation. */
  readonly typography: readonly AutofitTypographyBaselineEntry[]
  readonly scale: number
  readonly boundaries: readonly AutofitBoundaryPresentation[]
  readonly alignment: AlignmentPadding
  /** Private generated block offset retained with coordinated target geometry. */
  readonly residualBlockOffset: number
}

export interface AutofitCoordinatedTargetAlignment {
  readonly targetLocalDelta: number
  readonly paddingShift: number
  readonly alignment: AlignmentPadding
  readonly residualBlockOffset: number
}

export type AutofitCoordinatedTargetAlignmentMeasurement =
  | {
      readonly status: 'measured'
      readonly alignment: AutofitCoordinatedTargetAlignment
    }
  | {
      readonly status: 'deferred'
    }
  | {
      readonly status: 'unsupported'
      readonly reason: AutofitMeasurementUnsupportedReason
    }

export type AutofitCoordinatedTargetAnchorVerification =
  | {
      readonly status: 'measured'
      readonly error: number
    }
  | {
      readonly status: 'deferred'
    }
  | {
      readonly status: 'unsupported'
      readonly reason: AutofitMeasurementUnsupportedReason
    }

function assertFiniteNonNegativePadding(
  padding: AlignmentPadding,
): void {
  if (
    !Number.isFinite(padding.before)
    || !Number.isFinite(padding.after)
    || padding.before < 0
    || padding.after < 0
  ) {
    throw new RangeError('coordinated target padding must be finite and non-negative')
  }
}

/**
 * Redistributes only the target's existing outer-padding budget, retaining the
 * exact signed remainder for generated presentation offset.
 */
export function calculateAutofitCoordinatedTargetAlignment(options: {
  readonly targetLocalDelta: number
  readonly padding: AlignmentPadding
}): AutofitCoordinatedTargetAlignment {
  if (!Number.isFinite(options.targetLocalDelta))
    throw new RangeError('coordinated target delta must be finite')
  assertFiniteNonNegativePadding(options.padding)

  const paddingShift = Math.min(
    Math.max(options.targetLocalDelta, -options.padding.before),
    options.padding.after,
  )
  return {
    targetLocalDelta: options.targetLocalDelta,
    paddingShift,
    alignment: {
      before: options.padding.before + paddingShift,
      after: options.padding.after - paddingShift,
    },
    residualBlockOffset: options.targetLocalDelta - paddingShift,
  }
}

/**
 * Rebuilds a target presentation from its own cleared intrinsic measurement.
 * The source plan supplies only absolute targets; target carriers and saved
 * outer padding remain entirely target-local.
 */
export function createAutofitCoordinatedTargetPresentation(
  localPresentation: AutofitStaticPresentation,
  intrinsic: Pick<AutofitMeasuredVisualBoundaries, 'boundaries'>,
  plan: AutofitCoordinatedGapPlan,
): AutofitStaticPresentation {
  if (localPresentation.boundaries.length !== intrinsic.boundaries.length) {
    throw new RangeError(
      'coordinated target intrinsic boundaries must match the local presentation',
    )
  }

  const boundaries = intrinsic.boundaries.map((boundary, index) => {
    const localBoundary = localPresentation.boundaries[index]
    if (
      localBoundary.kind !== boundary.kind
      || localBoundary.carrier !== boundary.carrier
    ) {
      throw new RangeError(
        'coordinated target intrinsic boundaries must match local carriers',
      )
    }

    const target = boundary.kind === 'full'
      ? plan.targets.fullTarget
      : plan.targets.halfTarget
    return {
      kind: boundary.kind,
      carrier: boundary.carrier,
      target,
      adjustment: calculateAutofitCarrierAdjustment(
        target,
        boundary.intrinsicWhitespace,
      ),
    }
  })

  return {
    ...localPresentation,
    boundaries,
    // The target's local common-tier padding is intentionally not recalculated.
    alignment: localPresentation.alignment,
    residualBlockOffset: 0,
  }
}

/**
 * Retains the synchronized target's local gap adjustments while replacing only
 * its outer padding and generated residual position for start alignment.
 */
export function createAutofitCoordinatedAlignedTargetPresentation(
  localPresentation: AutofitStaticPresentation,
  intrinsic: Pick<AutofitMeasuredVisualBoundaries, 'boundaries'>,
  plan: AutofitCoordinatedGapPlan,
  alignment: AutofitCoordinatedTargetAlignment,
): AutofitStaticPresentation {
  return {
    ...createAutofitCoordinatedTargetPresentation(
      localPresentation,
      intrinsic,
      plan,
    ),
    alignment: alignment.alignment,
    residualBlockOffset: alignment.residualBlockOffset,
  }
}

function synchronizedAutofitTargetResult(
  localResult: AutofitStaticFitResult,
  presentation: AutofitStaticPresentation,
  overflow: boolean,
): AutofitStaticFitResult {
  return {
    tier: localResult.tier,
    scale: localResult.scale,
    overflow,
    effectiveAlignment: 'distributed',
    gapCounts: localResult.gapCounts,
    presentation,
  }
}

/**
 * Resolves only the measured synchronized target terminal. Geometry takes
 * precedence so an authored target overflow remains visible even when the
 * same final pass cannot verify its visual whitespace.
 */
export function resolveAutofitCoordinatedTargetApplication(options: {
  readonly localResult: AutofitStaticFitResult
  readonly plan: AutofitCoordinatedGapPlan
  readonly presentation: AutofitStaticPresentation
  readonly geometry: AutofitGeometryMeasurement
  readonly visual: AutofitCoordinatedTargetVisualVerification
}): AutofitCoordinatedTargetApplication {
  if (options.geometry.status !== 'measured')
    return { status: 'stale' }

  if (!options.geometry.fits) {
    return {
      status: 'synchronized-overflow',
      plan: options.plan,
      result: synchronizedAutofitTargetResult(
        options.localResult,
        options.presentation,
        true,
      ),
      overflowCauses: {
        coordinatedGap: true,
        coordinatedStartAlignment: false,
      },
    }
  }

  if (options.visual.status === 'deferred')
    return { status: 'stale' }

  if (options.visual.status === 'unsupported') {
    return {
      status: 'unsupported',
      plan: options.plan,
      reason: options.visual.reason,
    }
  }

  if (!verifyAutofitVisualGaps(
    options.presentation.boundaries,
    options.visual.realizedWhitespace,
  )) {
    return {
      status: 'unsupported',
      plan: options.plan,
      reason: 'coordinated-gap-verification',
    }
  }

  return {
    status: 'synchronized-fit',
    plan: options.plan,
    result: synchronizedAutofitTargetResult(
      options.localResult,
      options.presentation,
      false,
    ),
  }
}

/**
 * Resolves a target terminal only after exact starting-line alignment has been
 * calculated and applied. The existing gap-only resolver remains available
 * until its caller is migrated to this complete private seam.
 */
export function resolveAutofitCoordinatedAlignedTargetApplication(options: {
  readonly localResult: AutofitStaticFitResult
  readonly plan: AutofitCoordinatedGapPlan
  readonly presentation: AutofitStaticPresentation
  readonly preAlignmentGeometry: AutofitGeometryMeasurement
  readonly alignment: AutofitCoordinatedTargetAlignmentMeasurement
  readonly geometry: AutofitGeometryMeasurement
  readonly visual: AutofitCoordinatedTargetVisualVerification
  readonly anchor: AutofitCoordinatedTargetAnchorVerification
}): AutofitCoordinatedTargetApplication {
  if (options.preAlignmentGeometry.status !== 'measured')
    return { status: 'stale' }
  if (options.alignment.status === 'deferred')
    return { status: 'stale' }
  if (options.alignment.status === 'unsupported') {
    return {
      status: 'unsupported',
      plan: options.plan,
      reason: options.alignment.reason,
    }
  }
  if (options.geometry.status !== 'measured')
    return { status: 'stale' }

  const overflowCauses = {
    coordinatedGap: !options.preAlignmentGeometry.fits,
    coordinatedStartAlignment:
      Math.abs(options.alignment.alignment.residualBlockOffset)
        > AUTOFIT_FIT_TOLERANCE
      || (
        options.preAlignmentGeometry.fits
        && !options.geometry.fits
      ),
  }
  if (
    overflowCauses.coordinatedGap
    || overflowCauses.coordinatedStartAlignment
  ) {
    return {
      status: 'synchronized-overflow',
      plan: options.plan,
      result: synchronizedAutofitTargetResult(
        options.localResult,
        options.presentation,
        true,
      ),
      overflowCauses,
    }
  }

  if (options.visual.status === 'deferred')
    return { status: 'stale' }
  if (options.visual.status === 'unsupported') {
    return {
      status: 'unsupported',
      plan: options.plan,
      reason: options.visual.reason,
    }
  }
  if (!verifyAutofitVisualGaps(
    options.presentation.boundaries,
    options.visual.realizedWhitespace,
  )) {
    return {
      status: 'unsupported',
      plan: options.plan,
      reason: 'coordinated-gap-verification',
    }
  }

  if (options.anchor.status === 'deferred')
    return { status: 'stale' }
  if (options.anchor.status === 'unsupported') {
    return {
      status: 'unsupported',
      plan: options.plan,
      reason: options.anchor.reason,
    }
  }
  if (
    !Number.isFinite(options.anchor.error)
    || Math.abs(options.anchor.error) > AUTOFIT_FIT_TOLERANCE
  ) {
    return {
      status: 'unsupported',
      plan: options.plan,
      reason: 'coordinated-start-alignment-verification',
    }
  }

  return {
    status: 'synchronized-fit',
    plan: options.plan,
    result: synchronizedAutofitTargetResult(
      options.localResult,
      options.presentation,
      false,
    ),
  }
}

export interface AutofitStaticFitSession {
  readonly neutralStyleFingerprint: string
  readonly classificationSignature: AutofitClassificationSignature
  writeIntrinsicCandidate(candidate: TierCandidate): void
  readIntrinsicCandidate(
    candidate: TierCandidate,
  ): AutofitIntrinsicCandidateMeasurement<AutofitMeasuredVisualBoundaries>
  writeCompensatedCandidate(
    candidate: TierCandidate,
    intrinsic: AutofitMeasuredVisualBoundaries,
  ): void
  readFinalCandidate(
    candidate: TierCandidate,
    intrinsic: AutofitMeasuredVisualBoundaries,
  ): AutofitFinalCandidateMeasurement
  /** Returns a result only when this session completed real reads for the tier. */
  resultForMeasuredTier(tier: number): TierSearchResult | null
  applyResult(
    result: TierSearchResult,
    distributionCommitGuard?: () => boolean,
  ): AutofitStaticFitApplication
  /** Captures the active local common-tier starting anchor before restoration. */
  captureStartingAlignmentSourceSnapshot(
    pairHost: Element,
  ): AutofitSourceAnchorSnapshotMeasurement
  /** Re-reads the participant's current bridge-relative coordinate space. */
  readStartingAlignmentCoordinate(
    pairHost: Element,
  ): AutofitRenderedCoordinateSpaceMeasurement
  /** Private auto-column target gap-plus-start-alignment synchronization seam. */
  applyCoordinatedAlignedTargetPlan(
    localResult: AutofitStaticFitResult,
    plan: AutofitCoordinatedGapPlan,
    source: AutofitSourceAnchorSnapshot,
    currentSource: AutofitRenderedCoordinateSpace,
    pairHost: Element,
    targetCommitGuard?: () => boolean,
  ): AutofitCoordinatedTargetApplication
  restorePresentation(presentation: AutofitStaticPresentation): void
  restoreAuthoredNeutralTop(): void
  finishPendingPresentation(): void
  probeNeutralStyleFingerprint(presentation: AutofitStaticPresentation): string
  /**
   * Ends the session. Ordinary cleanup restores authored styles; unmount
   * disposal can retain the already-selected presentation in leaving DOM.
   */
  cleanup(options?: { readonly preservePresentation?: boolean }): void
}

interface AutofitStaticFitSessionOptions {
  readonly viewport: HTMLElement
  readonly flow: HTMLElement
  readonly config: AutofitConfig
  readonly classification: AutofitClassification
}

export function createAutofitClassificationSignature(
  classification: AutofitClassification,
): AutofitClassificationSignature {
  return {
    ...(classification.displayMathBlocks ? {
      displayMathElements: classification.displayMathBlocks.flatMap(block =>
        [block.root, block.paragraph, block.display, block.katex, block.visual]),
    } : {}),
    units: classification.units.map(unit => ({
      kind: unit.kind,
      root: unit.root,
    })),
    boundaries: classification.boundaries.map(boundary => ({
      kind: boundary.kind,
      carrier: boundary.carrier,
    })),
  }
}

export function isAutofitPresentationCompatible(
  signature: AutofitClassificationSignature,
  presentation: AutofitStaticPresentation,
): boolean {
  if (
    !sameDisplayMathElements(signature, presentation.signature)
    || signature.units.length !== presentation.signature.units.length
    || signature.boundaries.length !== presentation.signature.boundaries.length
  ) {
    return false
  }

  return signature.units.every((unit, index) => {
    const retained = presentation.signature.units[index]
    return unit.kind === retained.kind
      && unit.root === retained.root
      && unit.root.isConnected
  }) && signature.boundaries.every((boundary, index) => {
    const retained = presentation.signature.boundaries[index]
    return boundary.kind === retained.kind
      && boundary.carrier === retained.carrier
      && boundary.carrier.isConnected
  })
}

export function areAutofitClassificationSignaturesEqual(
  left: AutofitClassificationSignature,
  right: AutofitClassificationSignature,
): boolean {
  return sameDisplayMathElements(left, right)
    && left.units.length === right.units.length
    && left.boundaries.length === right.boundaries.length
    && left.units.every((unit, index) => {
      const candidate = right.units[index]
      return unit.kind === candidate.kind
        && unit.root === candidate.root
        && unit.root.isConnected
        && candidate.root.isConnected
    })
    && left.boundaries.every((boundary, index) => {
      const candidate = right.boundaries[index]
      return boundary.kind === candidate.kind
        && boundary.carrier === candidate.carrier
        && boundary.carrier.isConnected
        && candidate.carrier.isConnected
    })
}

function sameDisplayMathElements(
  left: AutofitClassificationSignature,
  right: AutofitClassificationSignature,
): boolean {
  const elements = left.displayMathElements ?? []
  const other = right.displayMathElements ?? []
  return elements.length === other.length
    && elements.every((element, index) => element === other[index] && element.isConnected)
}

function formatPixelValue(value: number): string {
  const rounded = Math.round(value * CSS_PRECISION) / CSS_PRECISION
  return `${Object.is(rounded, -0) ? 0 : rounded}px`
}

function parseComputedPixelValue(value: string): number {
  const match = CSS_PIXEL_VALUE.exec(value.trim())
  return match ? Number(match[1]) : Number.NaN
}

function readBaseSpacing(flow: HTMLElement): number {
  const view = flow.ownerDocument.defaultView
  if (!view)
    return Number.NaN

  const resolver = new AutofitGeneratedStyleOwner()
  resolver.set(
    flow,
    'margin-inline-start',
    `var(${BASE_SPACING_PROPERTY})`,
  )
  try {
    return parseComputedPixelValue(
      view.getComputedStyle(flow).marginInlineStart,
    )
  }
  finally {
    resolver.restoreAll()
  }
}

function neutralStyleFingerprint(
  baseSpacing: number,
  typography: readonly AutofitTypographyBaselineEntry[],
): string {
  return JSON.stringify([
    baseSpacing,
    typography.map(entry => [
      entry.element.localName,
      entry.fontSize,
      entry.lineHeight,
    ]),
  ])
}

class AutofitFlowStyleAdapter {
  readonly #flow: HTMLElement
  readonly #styles = new AutofitGeneratedStyleOwner()
  /** Kept separate so ordinary flow styles never retain residual positioning. */
  readonly #residualStyles = new AutofitGeneratedStyleOwner()

  constructor(flow: HTMLElement) {
    this.#flow = flow
  }

  applyIntrinsic(): void {
    this.#styles.set(this.#flow, 'box-sizing', 'border-box')
    this.#styles.set(this.#flow, 'min-height', '0px')
    this.#styles.set(this.#flow, 'padding-block-start', '0px')
    this.#styles.set(this.#flow, 'padding-block-end', '0px')
    this.applyResidualBlockOffset(0)
  }

  applyAlignment(
    padding: AlignmentPadding,
    residualBlockOffset = 0,
  ): void {
    this.#styles.set(
      this.#flow,
      'padding-block-start',
      formatPixelValue(padding.before),
    )
    this.#styles.set(
      this.#flow,
      'padding-block-end',
      formatPixelValue(padding.after),
    )
    this.applyResidualBlockOffset(residualBlockOffset)
  }

  applyResidualBlockOffset(residualBlockOffset: number): void {
    if (!Number.isFinite(residualBlockOffset))
      throw new RangeError('autofit residual block offset must be finite')
    if (residualBlockOffset === 0) {
      this.#residualStyles.restoreAll()
      return
    }
    this.#residualStyles.set(this.#flow, 'position', 'relative')
    this.#residualStyles.set(
      this.#flow,
      'inset-block-start',
      `${residualBlockOffset}px`,
    )
  }

  cleanup(): void {
    this.#residualStyles.restoreAll()
    this.#styles.restoreAll()
  }
}

class AutofitTransitionSuppression {
  readonly #flow: HTMLElement
  readonly #styles = new AutofitTransitionStyleOwner()
  #ownerCount = 0

  constructor(flow: HTMLElement) {
    this.#flow = flow
  }

  acquire(): () => void {
    this.#ownerCount += 1
    this.reassert()

    let released = false
    return () => {
      if (released)
        return
      released = true
      this.#ownerCount -= 1
      if (this.#ownerCount !== 0)
        return

      this.#flow.getBoundingClientRect()
      this.#styles.restoreAll()
    }
  }

  reassert(): void {
    if (this.#ownerCount === 0)
      return
    this.#styles.suppress(this.#flow)
    for (const descendant of this.#flow.querySelectorAll('*'))
      this.#styles.suppress(descendant)
  }
}

function forcedUnsupportedReason(
  viewport: HTMLElement,
  phase: 'intrinsic' | 'final',
): AutofitUnsupportedReason | null {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test'))
    return null

  const reason = viewport.closest<HTMLElement>('.autofit')
    ?.dataset.autofitTestForceUnsupported as AutofitUnsupportedReason | undefined
  if (!reason)
    return null
  if (reason === 'base-gap-verification')
    return phase === 'final' ? reason : null
  if (
    reason === 'visual-target-nonfinite'
    || reason === 'visual-edge-nonfinite'
    || reason === 'carrier-adjustment-nonfinite'
  ) {
    return phase === 'intrinsic' ? reason : null
  }
  return null
}

function autofitTestHooks(viewport: HTMLElement): AutofitTestHooks | undefined {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test'))
    return undefined

  const target = viewport.ownerDocument.defaultView as (
    Window & { readonly __slidevAutofitTestHooks?: AutofitTestHooks }
  ) | null
  return target?.[TEST_HOOK_GLOBAL_KEY]
}

class DomAutofitStaticFitSession implements AutofitStaticFitSession {
  readonly neutralStyleFingerprint: string
  readonly classificationSignature: AutofitClassificationSignature
  readonly #viewport: HTMLElement
  readonly #flow: HTMLElement
  readonly #config: AutofitConfig
  readonly #classification: AutofitClassification
  readonly #typography: AutofitTypographyAdapter
  readonly #spacing: AutofitSpacingAdapter
  readonly #flowStyle: AutofitFlowStyleAdapter
  readonly #transitionSuppression: AutofitTransitionSuppression
  readonly #baseSpacing: number
  readonly #neutralTypography: readonly AutofitTypographyBaselineEntry[]
  readonly #geometryByTier = new Map<number, AutofitMeasuredGeometry>()
  readonly #intrinsicByTier = new Map<number, AutofitMeasuredVisualBoundaries>()
  #releaseMeasurementTransitions: (() => void) | null = null
  #cleanedUp = false

  constructor(options: AutofitStaticFitSessionOptions) {
    this.#viewport = options.viewport
    this.#flow = options.flow
    this.#config = options.config
    this.#classification = options.classification
    this.classificationSignature
      = createAutofitClassificationSignature(options.classification)
    this.#transitionSuppression = new AutofitTransitionSuppression(options.flow)
    this.#ensureMeasurementTransitionSuppression()
    this.#typography = createAutofitTypographyAdapter(options.flow, {
      displayMathBlocks: options.classification.displayMathBlocks,
    })
    this.#spacing = createAutofitSpacingAdapter(options.classification)
    this.#flowStyle = new AutofitFlowStyleAdapter(options.flow)
    this.#baseSpacing = readBaseSpacing(options.flow)

    this.#typography.prepareNeutralCapture()
    this.#neutralTypography = this.#typography.captureNeutral()
    this.neutralStyleFingerprint = neutralStyleFingerprint(
      this.#baseSpacing,
      this.#neutralTypography,
    )
  }

  writeIntrinsicCandidate(candidate: TierCandidate): void {
    this.#assertActive()
    this.#ensureMeasurementTransitionSuppression()
    this.#flowStyle.applyIntrinsic()
    this.#typography.applyTier(candidate.scale)
    this.#spacing.prepareIntrinsic()
    autofitTestHooks(this.#viewport)
      ?.afterIntrinsicCandidateWrite?.(this.#viewport)
  }

  readIntrinsicCandidate(
    candidate: TierCandidate,
  ): AutofitIntrinsicCandidateMeasurement<AutofitMeasuredVisualBoundaries> {
    this.#assertActive()
    const forced = forcedUnsupportedReason(this.#viewport, 'intrinsic')
    if (forced)
      return { status: 'unsupported', reason: forced }

    let targets: AutofitVisualGapTargets
    try {
      targets = calculateAutofitVisualGapTargets(
        this.#baseSpacing,
        candidate.scale,
      )
    }
    catch {
      targets = {
        fullTarget: Number.NaN,
        halfTarget: Number.NaN,
      }
    }

    const measurement = measureAutofitVisualBoundaries({
      viewport: this.#viewport,
      classification: this.#classification,
      targets,
    })
    if (measurement.status !== 'measured')
      return measurement

    this.#intrinsicByTier.set(candidate.index, measurement)
    return { status: 'measured', payload: measurement }
  }

  writeCompensatedCandidate(
    _candidate: TierCandidate,
    intrinsic: AutofitMeasuredVisualBoundaries,
  ): void {
    this.#assertActive()
    this.#transitionSuppression.reassert()
    this.#spacing.applyAdjustments(
      intrinsic.boundaries.map(boundary => boundary.adjustment),
    )
  }

  readFinalCandidate(
    candidate: TierCandidate,
    intrinsic: AutofitMeasuredVisualBoundaries,
  ): AutofitFinalCandidateMeasurement {
    this.#assertActive()
    const forced = forcedUnsupportedReason(this.#viewport, 'final')
    if (forced)
      return { status: 'unsupported', reason: forced }

    const geometry = measureAutofitGeometry({
      viewport: this.#viewport,
      flow: this.#flow,
      classification: this.#classification,
    })
    if (geometry.status === 'deferred')
      return geometry
    if (geometry.status === 'empty')
      throw new Error('semantically empty autofit content must bypass tier search')

    const targets = calculateAutofitVisualGapTargets(
      this.#baseSpacing,
      candidate.scale,
    )
    const realized = measureAutofitVisualBoundaries({
      viewport: this.#viewport,
      classification: this.#classification,
      targets,
    })
    if (realized.status !== 'measured')
      return realized
    if (!verifyAutofitVisualGaps(
      intrinsic.boundaries,
      realized.boundaries.map(boundary => boundary.intrinsicWhitespace),
    )) {
      return { status: 'unsupported', reason: 'base-gap-verification' }
    }

    this.#geometryByTier.set(candidate.index, geometry)
    return { status: 'measured', fits: geometry.fits }
  }

  resultForMeasuredTier(tier: number): TierSearchResult | null {
    this.#assertActive()
    const geometry = this.#geometryByTier.get(tier)
    const intrinsic = this.#intrinsicByTier.get(tier)
    if (!geometry || !intrinsic)
      return null

    const forcedNonFit = autofitTestHooks(this.#viewport)
      ?.forceCachedTierNonFit?.(this.#viewport, tier) === true
    return {
      tier,
      scale: getTierScale(tier, this.#config),
      fits: forcedNonFit ? false : geometry.fits,
      // The test seam deliberately does not fabricate a smallest-tier
      // overflow: the coordinator must see a genuine cached non-fit.
      overflow: forcedNonFit ? false : !geometry.fits,
      measurementCount: 1,
    }
  }

  applyResult(
    result: TierSearchResult,
    distributionCommitGuard: () => boolean = () => true,
  ): AutofitStaticFitApplication {
    this.#assertActive()
    this.#ensureMeasurementTransitionSuppression()
    try {
      const geometry = this.#geometryByTier.get(result.tier)
      const intrinsic = this.#intrinsicByTier.get(result.tier)
      if (!geometry || !intrinsic) {
        throw new Error(
          `selected autofit tier ${result.tier} has no complete measurement`,
        )
      }

      this.#flowStyle.applyIntrinsic()
      this.#typography.applyTier(result.scale)
      this.#spacing.applyAdjustments(
        intrinsic.boundaries.map(boundary => boundary.adjustment),
      )
      const alignment = this.#applyAlignment(
        result,
        geometry,
        intrinsic,
        distributionCommitGuard,
      )
      if (alignment.status !== 'committed')
        return alignment

      return {
        status: 'committed',
        result: {
          tier: result.tier,
          scale: result.scale,
          overflow: result.overflow,
          effectiveAlignment: alignment.effectiveAlignment,
          gapCounts: this.#classification.gapCounts,
          presentation: alignment.presentation,
        },
      }
    }
    finally {
      this.#releaseMeasurementTransitionSuppression()
    }
  }

  captureStartingAlignmentSourceSnapshot(
    pairHost: Element,
  ): AutofitSourceAnchorSnapshotMeasurement {
    this.#assertActive()
    const forcedReason = autofitTestHooks(this.#viewport)
      ?.forceCoordinatedCandidateAnchorUnsupportedReason?.(this.#viewport)
    if (forcedReason) {
      return {
        status: 'unsupported',
        reason: forcedReason,
        node: this.#viewport,
      }
    }
    const measurement = measureAutofitStartingAlignmentSourceSnapshot({
      viewport: this.#viewport,
      pairHost,
      classification: this.#classification,
    })
    if (measurement.status === 'measured') {
      autofitTestHooks(this.#viewport)
        ?.afterCoordinatedCandidateAnchorCaptured?.(this.#viewport, measurement.snapshot)
    }
    return measurement
  }

  readStartingAlignmentCoordinate(
    pairHost: Element,
  ): AutofitRenderedCoordinateSpaceMeasurement {
    this.#assertActive()
    const measurement = measureAutofitRenderedCoordinateSpace({
      viewport: this.#viewport,
      pairHost,
    })
    if (measurement.status !== 'measured')
      return measurement
    return {
      status: 'measured',
      coordinate: autofitTestHooks(this.#viewport)
        ?.overrideCoordinatedCurrentSourceCoordinate?.(
          this.#viewport,
          measurement.coordinate,
        ) ?? measurement.coordinate,
    }
  }

  applyCoordinatedAlignedTargetPlan(
    localResult: AutofitStaticFitResult,
    plan: AutofitCoordinatedGapPlan,
    source: AutofitSourceAnchorSnapshot,
    currentSource: AutofitRenderedCoordinateSpace,
    pairHost: Element,
    targetCommitGuard: () => boolean = () => true,
  ): AutofitCoordinatedTargetApplication {
    this.#assertActive()
    if (!targetCommitGuard())
      return { status: 'stale' }
    this.#ensureMeasurementTransitionSuppression()
    try {
      const hooks = autofitTestHooks(this.#viewport)
      const intrinsic = this.#intrinsicByTier.get(localResult.tier)
      if (!intrinsic) {
        throw new Error(
          `selected autofit tier ${localResult.tier} has no complete intrinsic measurement`,
        )
      }

      this.#flowStyle.applyIntrinsic()
      this.#typography.applyTier(
        localResult.scale,
        localResult.presentation.typography,
      )
      // Clear generated carrier margins before reusing this tier's intrinsic
      // target geometry. Source carrier adjustments never cross this seam.
      this.#spacing.prepareIntrinsic()
      const synchronizedPresentation = createAutofitCoordinatedTargetPresentation(
        localResult.presentation,
        intrinsic,
        plan,
      )
      this.#spacing.applyAdjustments(
        synchronizedPresentation.boundaries.map(boundary => boundary.adjustment),
      )
      // Saved local common-tier padding is reapplied verbatim, not recomputed
      // from the changed content geometry.
      this.#flowStyle.applyAlignment(synchronizedPresentation.alignment)
      hooks?.afterCoordinatedTargetSynchronizationCheckpoint?.(
        this.#viewport,
        'after-gap-mutation',
      )
      if (!targetCommitGuard())
        return { status: 'stale' }

      const preAlignmentGeometry = measureAutofitGeometry({
        viewport: this.#viewport,
        flow: this.#flow,
        classification: this.#classification,
      })
      const targetBeforeAlignment = measureAutofitStartingAlignmentSourceSnapshot({
        viewport: this.#viewport,
        pairHost,
        classification: this.#classification,
      })
      hooks?.afterCoordinatedTargetSynchronizationCheckpoint?.(
        this.#viewport,
        'after-target-anchor',
      )
      if (!targetCommitGuard())
        return { status: 'stale' }
      if (targetBeforeAlignment.status === 'deferred')
        return { status: 'stale' }
      if (targetBeforeAlignment.status === 'unsupported') {
        const application: AutofitCoordinatedTargetApplication = {
          status: 'unsupported',
          plan,
          reason: targetBeforeAlignment.reason,
        }
        autofitTestHooks(this.#viewport)
          ?.afterCoordinatedGapPlanApplied?.(
            this.#viewport,
            plan,
            application,
            localResult,
          )
        return application
      }

      const coordinates = resolveAutofitStartingAlignmentCoordinates({
        source,
        currentSource,
        target: targetBeforeAlignment.snapshot,
      })
      if (coordinates.status === 'deferred')
        return { status: 'stale' }

      const alignment = calculateAutofitCoordinatedTargetAlignment({
        targetLocalDelta: coordinates.targetLocalDelta,
        padding: synchronizedPresentation.alignment,
      })
      const presentation = createAutofitCoordinatedAlignedTargetPresentation(
        localResult.presentation,
        intrinsic,
        plan,
        alignment,
      )
      this.#flowStyle.applyAlignment(
        presentation.alignment,
        presentation.residualBlockOffset,
      )
      hooks?.afterCoordinatedTargetSynchronizationCheckpoint?.(
        this.#viewport,
        'after-alignment-mutation',
      )
      if (!targetCommitGuard())
        return { status: 'stale' }

      const geometry = measureAutofitGeometry({
        viewport: this.#viewport,
        flow: this.#flow,
        classification: this.#classification,
      })
      const visual = measureAutofitVisualBoundaries({
        viewport: this.#viewport,
        classification: this.#classification,
        targets: plan.targets,
      })
      if (!targetCommitGuard())
        return { status: 'stale' }

      const coordinatedPreAlignmentGeometry = preAlignmentGeometry.status === 'measured'
        && hooks?.forceCoordinatedTargetOverflow?.(this.#viewport) === true
        ? { ...preAlignmentGeometry, fits: false }
        : preAlignmentGeometry
      const forcedVisualReason = hooks
        ?.forceCoordinatedVisualUnsupportedReason?.(this.#viewport)
      const coordinatedVisual: AutofitCoordinatedTargetVisualVerification = forcedVisualReason
        ? { status: 'unsupported', reason: forcedVisualReason }
        : visual.status === 'measured'
          ? {
              status: 'measured',
              realizedWhitespace: visual.boundaries.map((boundary) => {
                const realized = boundary.intrinsicWhitespace
                return hooks?.forceCoordinatedGapVerificationFailure?.(this.#viewport) === true
                  ? realized + 1
                  : realized
              }),
            }
          : visual
      const finalTarget = measureAutofitStartingAlignmentSourceSnapshot({
        viewport: this.#viewport,
        pairHost,
        classification: this.#classification,
      })
      const finalCoordinates = finalTarget.status === 'measured'
        ? resolveAutofitStartingAlignmentCoordinates({
            source,
            currentSource,
            target: finalTarget.snapshot,
          })
        : finalTarget
      const anchor: AutofitCoordinatedTargetAnchorVerification = finalCoordinates.status === 'measured'
        ? {
            status: 'measured',
            error: hooks?.forceCoordinatedStartAlignmentVerificationFailure?.(this.#viewport) === true
              ? coordinates.sourceRenderedAnchor - finalCoordinates.targetRenderedAnchor
                + AUTOFIT_FIT_TOLERANCE * 2
              : coordinates.sourceRenderedAnchor - finalCoordinates.targetRenderedAnchor,
          }
        : finalCoordinates.status === 'deferred'
          ? { status: 'deferred' }
          : { status: 'unsupported', reason: finalCoordinates.reason }
      hooks?.afterCoordinatedTargetSynchronizationCheckpoint?.(
        this.#viewport,
        'after-final-reads',
      )
      if (!targetCommitGuard())
        return { status: 'stale' }

      const application = resolveAutofitCoordinatedAlignedTargetApplication({
        localResult,
        plan,
        presentation,
        preAlignmentGeometry: coordinatedPreAlignmentGeometry,
        alignment: { status: 'measured', alignment },
        geometry,
        visual: coordinatedVisual,
        anchor,
      })
      autofitTestHooks(this.#viewport)
        ?.afterCoordinatedGapPlanApplied?.(
          this.#viewport,
          plan,
          application,
          localResult,
        )
      hooks?.afterCoordinatedStartingAlignmentApplied?.(this.#viewport, {
        sourceRenderedAnchor: coordinates.sourceRenderedAnchor,
        targetRenderedAnchor: coordinates.targetRenderedAnchor,
        targetLocalDelta: coordinates.targetLocalDelta,
        targetBlockScale: targetBeforeAlignment.snapshot.viewportBlockScale,
        paddingShift: alignment.paddingShift,
        residualBlockOffset: alignment.residualBlockOffset,
        finalAnchorError: anchor.status === 'measured' ? anchor.error : null,
        application,
      })
      return application
    }
    finally {
      this.#releaseMeasurementTransitionSuppression()
    }
  }

  #basePresentation(
    scale: number,
    intrinsic: AutofitMeasuredVisualBoundaries,
    alignment: AlignmentPadding,
    additions: { readonly full: number; readonly half: number } = {
      full: 0,
      half: 0,
    },
  ): AutofitStaticPresentation {
    const boundaries = calculateDistributedBoundaryCompensations(
      intrinsic.boundaries,
      additions,
    )
    return {
      signature: this.classificationSignature,
      typography: this.#neutralTypography,
      scale,
      boundaries: intrinsic.boundaries.map((boundary, index) => ({
        kind: boundary.kind,
        carrier: boundary.carrier,
        target: boundaries[index].target,
        adjustment: boundaries[index].adjustment,
      })),
      alignment,
      residualBlockOffset: 0,
    }
  }

  #applyAlignment(
    result: TierSearchResult,
    geometry: AutofitMeasuredGeometry,
    intrinsic: AutofitMeasuredVisualBoundaries,
    distributionCommitGuard: () => boolean = () => true,
  ): {
      readonly status: 'committed'
      readonly effectiveAlignment: AutofitEffectiveAlignment
      readonly presentation: AutofitStaticPresentation
    } | {
      readonly status: 'stale'
    } | {
      readonly status: 'unsupported'
      readonly reason: AutofitUnsupportedReason
    } {
    if (result.overflow) {
      const padding = { before: 0, after: 0 }
      this.#flowStyle.applyAlignment(padding)
      if (
        this.#config.alignment === 'distributed'
        && !distributionCommitGuard()
      ) {
        return { status: 'stale' }
      }
      return {
        status: 'committed',
        effectiveAlignment: 'top',
        presentation: this.#basePresentation(
          result.scale,
          intrinsic,
          padding,
        ),
      }
    }

    if (this.#config.alignment !== 'distributed') {
      const padding = calculateAlignmentPadding(
        this.#config.alignment,
        geometry.emptySpace,
      )
      this.#flowStyle.applyAlignment(padding)
      return {
        status: 'committed',
        effectiveAlignment: this.#config.alignment,
        presentation: this.#basePresentation(
          result.scale,
          intrinsic,
          padding,
        ),
      }
    }

    const distribution = calculateDistributedAlignment(
      geometry.emptySpace,
      this.#classification.gapCounts,
    )
    if (distribution.effectiveAlignment === 'middle') {
      const padding = {
        before: distribution.paddingBefore,
        after: distribution.paddingAfter,
      }
      this.#flowStyle.applyAlignment(padding)
      if (!distributionCommitGuard())
        return { status: 'stale' }
      return {
        status: 'committed',
        effectiveAlignment: 'middle',
        presentation: this.#basePresentation(
          result.scale,
          intrinsic,
          padding,
        ),
      }
    }

    const distributedBoundaries = calculateDistributedBoundaryCompensations(
      intrinsic.boundaries,
      {
        full: distribution.fullGapAddition,
        half: distribution.halfGapAddition,
      },
    )
    const distributedPadding = {
      before: distribution.paddingBefore,
      after: distribution.paddingAfter,
    }
    this.#spacing.applyAdjustments(
      distributedBoundaries.map(boundary => boundary.adjustment),
    )
    this.#flowStyle.applyAlignment(distributedPadding)

    const finalGeometry = measureAutofitGeometry({
      viewport: this.#viewport,
      flow: this.#flow,
      classification: this.#classification,
    })
    const baseTargets = calculateAutofitVisualGapTargets(
      this.#baseSpacing,
      result.scale,
    )
    const distributedTargets = {
      fullTarget: baseTargets.fullTarget + distribution.fullGapAddition,
      halfTarget: baseTargets.halfTarget + distribution.halfGapAddition,
    }
    const realizedDistributed = measureAutofitVisualBoundaries({
      viewport: this.#viewport,
      classification: this.#classification,
      targets: distributedTargets,
    })
    const hooks = autofitTestHooks(this.#viewport)
    const distributedGapsValid = realizedDistributed.status === 'measured'
      && verifyAutofitVisualGaps(
        distributedBoundaries,
        realizedDistributed.boundaries.map(
          boundary => boundary.intrinsicWhitespace,
        ),
      )
    const distributedGeometryValid = finalGeometry.status === 'measured'
      && finalGeometry.fits
    hooks?.beforeDistributionCommitBarrier?.(this.#viewport)
    if (!distributionCommitGuard())
      return { status: 'stale' }

    if (
      distributedGeometryValid
      && distributedGapsValid
      && hooks?.forceDistributedVerificationFailure?.(this.#viewport) !== true
    ) {
      return {
        status: 'committed',
        effectiveAlignment: 'distributed',
        presentation: this.#basePresentation(
          result.scale,
          intrinsic,
          distributedPadding,
          {
            full: distribution.fullGapAddition,
            half: distribution.halfGapAddition,
          },
        ),
      }
    }

    this.#spacing.applyAdjustments(
      intrinsic.boundaries.map(boundary => boundary.adjustment),
    )
    const fallbackPadding = calculateAlignmentPadding(
      'middle',
      geometry.emptySpace,
    )
    this.#flowStyle.applyAlignment(fallbackPadding)
    const restoredGeometry = measureAutofitGeometry({
      viewport: this.#viewport,
      flow: this.#flow,
      classification: this.#classification,
    })
    const realizedBase = measureAutofitVisualBoundaries({
      viewport: this.#viewport,
      classification: this.#classification,
      targets: baseTargets,
    })
    if (!distributionCommitGuard())
      return { status: 'stale' }
    const restoredBase = resolveAutofitRestoredBaseVerification({
      geometry: restoredGeometry,
      visual: realizedBase.status === 'measured'
        ? {
            status: 'measured',
            realizedWhitespace: realizedBase.boundaries.map(
              boundary => boundary.intrinsicWhitespace,
            ),
          }
        : realizedBase,
      expected: intrinsic.boundaries,
      forceGapFailure:
        hooks?.forceRestoredBaseVerificationFailure?.(this.#viewport) === true,
    })
    if (restoredBase.status !== 'valid')
      return restoredBase

    return {
      status: 'committed',
      effectiveAlignment: 'middle',
      presentation: this.#basePresentation(
        result.scale,
        intrinsic,
        fallbackPadding,
      ),
    }
  }

  restorePresentation(presentation: AutofitStaticPresentation): void {
    this.#assertActive()
    if (!isAutofitPresentationCompatible(
      this.classificationSignature,
      presentation,
    )) {
      throw new Error('cannot restore an incompatible autofit presentation')
    }
    const releaseRestoreTransitions = this.#transitionSuppression.acquire()
    try {
      this.#flowStyle.applyIntrinsic()
      this.#typography.applyTier(presentation.scale, presentation.typography)
      this.#spacing.applyAdjustments(
        presentation.boundaries.map(boundary => boundary.adjustment),
      )
      this.#flowStyle.applyAlignment(
        presentation.alignment,
        presentation.residualBlockOffset,
      )
    }
    finally {
      releaseRestoreTransitions()
    }
  }

  restoreAuthoredNeutralTop(): void {
    this.#assertActive()
    this.#ensureMeasurementTransitionSuppression()
    try {
      this.#flowStyle.cleanup()
      this.#spacing.cleanup()
      this.#typography.cleanup()
    }
    finally {
      this.#releaseMeasurementTransitionSuppression()
    }
  }

  finishPendingPresentation(): void {
    this.#assertActive()
    this.#releaseMeasurementTransitionSuppression()
  }

  probeNeutralStyleFingerprint(
    presentation: AutofitStaticPresentation,
  ): string {
    this.#assertActive()
    const releaseProbeTransitions = this.#transitionSuppression.acquire()
    try {
      this.#typography.prepareNeutralCapture()
      this.#flow.getBoundingClientRect()
      if (
        autofitTestHooks(this.#viewport)
          ?.forceNeutralProbeFailure?.(this.#viewport) === true
      ) {
        throw new Error('forced neutral fingerprint probe failure')
      }
      return neutralStyleFingerprint(
        readBaseSpacing(this.#flow),
        this.#typography.inspectNeutral(),
      )
    }
    finally {
      try {
        this.restorePresentation(presentation)
        this.#flow.getBoundingClientRect()
      }
      finally {
        releaseProbeTransitions()
        autofitTestHooks(this.#viewport)
          ?.afterNeutralProbeRestore?.(this.#viewport)
      }
    }
  }

  cleanup(options: { readonly preservePresentation?: boolean } = {}): void {
    if (this.#cleanedUp)
      return
    this.#cleanedUp = true
    const releaseTransitions = this.#releaseMeasurementTransitions
      ?? this.#transitionSuppression.acquire()
    this.#releaseMeasurementTransitions = null
    try {
      this.#transitionSuppression.reassert()
      if (!options.preservePresentation) {
        this.#flowStyle.cleanup()
        this.#spacing.cleanup()
        this.#typography.cleanup()
      }
      this.#geometryByTier.clear()
      this.#intrinsicByTier.clear()
    }
    finally {
      releaseTransitions()
    }
  }

  #ensureMeasurementTransitionSuppression(): void {
    if (this.#releaseMeasurementTransitions)
      this.#transitionSuppression.reassert()
    else
      this.#releaseMeasurementTransitions = this.#transitionSuppression.acquire()
  }

  #releaseMeasurementTransitionSuppression(): void {
    this.#releaseMeasurementTransitions?.()
    this.#releaseMeasurementTransitions = null
  }

  #assertActive(): void {
    if (this.#cleanedUp)
      throw new Error('autofit static fitting session has been cleaned up')
  }

}

export function createAutofitStaticFitSession(
  options: AutofitStaticFitSessionOptions,
): AutofitStaticFitSession {
  return new DomAutofitStaticFitSession(options)
}
