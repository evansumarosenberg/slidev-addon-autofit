<script setup lang="ts">
import {
  computed,
  inject,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import { classifyAutofitContent } from '../utils/autofit/classify'
import {
  isAutofitClassificationSemanticallyEmpty,
} from '../utils/autofit/semantic-content'
import {
  DEFAULT_AUTOFIT_CONFIG,
  normalizeAlignment,
  normalizeAutofitConfig,
} from '../utils/autofit/config'
import {
  createAutofitInstanceId,
  sharedAutofitDomScheduler,
} from '../utils/autofit/dom-scheduler'
import { isAutofitViewportRenderable } from '../utils/autofit/geometry'
import { AUTOFIT_DIAGNOSTIC_PREFIX } from '../utils/autofit/diagnostic-prefix'
import { autoColumnContextKey } from '../utils/autofit/auto-column-context'
import type {
  AutoColumnCurrentSourceCoordinate,
  AutoColumnParticipant,
  AutoColumnStartingAlignmentSource,
  AutoColumnStartingAnchorCandidate,
} from '../utils/autofit/auto-column-context'
import type {
  AutoColumnLocalPresentationMetadata,
  AutoColumnRole,
} from '../utils/autofit/auto-column-coordinator'
import { layoutAutofitConfigKey } from '../utils/autofit/layout-config'
import {
  createAutofitLifecycle,
} from '../utils/autofit/lifecycle'
import {
  createAutofitStaticFitSession,
  createAutofitClassificationSignature,
  areAutofitClassificationSignaturesEqual,
  extractAutofitCoordinatedGapPlan,
  isAutofitPresentationCompatible,
} from '../utils/autofit/static-fit'
import { isAutofitSourceAnchorSnapshotCompatible } from '../utils/autofit/starting-alignment'
import { selectFirstAutofitUnsupported } from '../utils/autofit/visual-spacing'
import type {
  AutofitDomMeasurementJob,
} from '../utils/autofit/dom-scheduler'
import type {
  AutofitStaticFitApplication,
  AutofitStaticPresentation,
  AutofitStaticFitSession,
  AutofitCoordinatedGapPlan,
  AutofitCoordinatedTargetApplication,
} from '../utils/autofit/static-fit'
import type {
  AutofitRootDebugAttributes,
} from '../utils/autofit/root-debug'
import type {
  AutofitInvalidationReason,
  AutofitLifecycle,
} from '../utils/autofit/lifecycle'
import type {
  AutofitEffectiveAlignment,
  AutofitMeasurementResult,
  AutofitMeasurementJobHandle,
  AutofitUnsupportedReason,
} from '../utils/autofit/types'

interface AutoFitProps {
  largeTiers?: number
  smallTiers?: number
  tierIncrement?: number
  alignment?: string
}

type AutofitState = 'pending' | 'fit' | 'overflow' | 'unsupported'

const props = withDefaults(defineProps<AutoFitProps>(), {
  largeTiers: DEFAULT_AUTOFIT_CONFIG.largeTiers,
  smallTiers: DEFAULT_AUTOFIT_CONFIG.smallTiers,
  tierIncrement: DEFAULT_AUTOFIT_CONFIG.tierIncrement,
  alignment: 'distributed',
})

const layoutConfiguration = inject(layoutAutofitConfigKey, null)?.claim() ?? null
const autoColumnContext = inject(autoColumnContextKey, null)
const root = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const flow = ref<HTMLElement | null>(null)
const state = ref<AutofitState>('pending')
const selectedTier = ref<number | null>(null)
const selectedScale = ref<number | null>(null)
const effectiveAlignment = ref<AutofitEffectiveAlignment>('middle')
const fullGapCount = ref<number | null>(null)
const halfGapCount = ref<number | null>(null)
const unsupportedReason = ref<AutofitUnsupportedReason | null>(null)
const visiblePending = ref(false)
const semanticallyEmpty = ref(false)
const publishedEmpty = ref(false)
const measureCount = ref(0)
const batchId = ref(0)
const warnedConfigurations = new Set<string>()
const instanceId = createAutofitInstanceId()
let activeSession: AutofitStaticFitSession | null = null
let activeHandle: AutofitMeasurementJobHandle | null = null
let stablePresentation: AutofitStaticPresentation | null = null
let lifecycle: AutofitLifecycle | null = null
let rootDebugAttributes: AutofitRootDebugAttributes | null = null
const pendingInvalidationReasons = new Set<AutofitInvalidationReason>()
let refreshQueued = false
let mounted = false
let unsupportedWarningReason: AutofitUnsupportedReason | null = null
let disposeTestSupersede: (() => void) | null = null
let disposeAutoColumnParticipant: (() => void) | null = null
let autoColumnRole: AutoColumnRole | null = null
type AutoColumnSessionStamp = Readonly<{
  epoch: number
  generation: number
  session: AutofitStaticFitSession
}>
type AutoColumnTerminalStamp = Readonly<{
  epoch: number
  generation: number
  session: AutofitStaticFitSession | null
}>
type AutoColumnTestBarrier = 'local-common'
interface AutoColumnTestHooks {
  holdAutoColumnBarrier?(
    barrier: AutoColumnTestBarrier,
    role: AutoColumnRole,
    epoch: number,
    callback: () => void,
  ): void
  afterAutoColumnBarrierDispatch?(
    barrier: AutoColumnTestBarrier,
    role: AutoColumnRole,
    epoch: number,
    presentation?: AutoColumnLocalPresentationMetadata,
  ): void
}
type AutoColumnPrivateResult = AutoColumnSessionStamp & {
  readonly result: AutofitMeasurementResult
}
let autoColumnPrivateResult: AutoColumnPrivateResult | null = null
let autoColumnPrepared: {
  readonly stamp: AutoColumnSessionStamp
  readonly application: Extract<AutofitStaticFitApplication, { status: 'committed' }>
  readonly anchorCandidate: AutoColumnStartingAnchorCandidate
  readonly anchorPairHost: HTMLElement | null
  readonly measurementCount: number
  readonly batchId: number
} | null = null
let autoColumnSynchronized: {
  readonly stamp: AutoColumnSessionStamp
  readonly application: Extract<AutofitCoordinatedTargetApplication, {
    status: 'synchronized-fit' | 'synchronized-overflow'
  }>
  readonly measurementCount: number
  readonly batchId: number
} | null = null
let autoColumnSynchronizedUnsupported: {
  readonly stamp: AutoColumnSessionStamp
  /** Retained only until terminal publication for internal coordination diagnostics. */
  readonly plan: AutofitCoordinatedGapPlan
  readonly reason: AutofitUnsupportedReason
  readonly diagnostics: { readonly candidateMeasurementCount: number; readonly batchId: number }
} | null = null
let autoColumnUnsupported: {
  readonly stamp: AutoColumnTerminalStamp
  readonly reason: AutofitUnsupportedReason
  readonly gapCounts: { readonly full: number; readonly half: number } | null
  readonly diagnostics: { readonly candidateMeasurementCount: number; readonly batchId: number }
} | null = null
let autoColumnMeasurementCount = 0
let autoColumnEpoch = 0

const rawConfiguration = computed(() => {
  if (autoColumnContext)
    return autoColumnContext.rawConfig.value

  if (layoutConfiguration)
    return layoutConfiguration.value

  return {
    largeTiers: props.largeTiers,
    smallTiers: props.smallTiers,
    tierIncrement: props.tierIncrement,
    alignment: props.alignment,
  }
})

const normalized = computed(() => normalizeAutofitConfig(rawConfiguration.value))
const configError = computed(() => normalized.value.errors.map(error => error.code).join(','))
const requestedAlignment = computed(() => normalized.value.requestedAlignment)

function serializeDiagnosticValue(
  value: unknown,
  seen = new WeakSet<object>(),
): string {
  if (value === null)
    return 'null'

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0))
      return `number:${String(value)}`
    return `number:${value}`
  }

  if (typeof value !== 'object')
    return `${typeof value}:${String(value)}`

  if (seen.has(value))
    return '[circular]'

  seen.add(value)
  if (Array.isArray(value))
    return `[${value.map(item => serializeDiagnosticValue(item, seen)).join(',')}]`

  const record = value as Record<PropertyKey, unknown>
  const properties = Reflect.ownKeys(record)
    .sort((left, right) => String(left).localeCompare(String(right)))
    .map(property => `${String(property)}:${serializeDiagnosticValue(record[property], seen)}`)
    .join(',')
  return `${Object.prototype.toString.call(value)}{${properties}}`
}

function configurationWarningSignature(): string {
  const errors = normalized.value.errors
    .map(error => [
      error.code,
      error.property ?? '',
      serializeDiagnosticValue(error.value),
    ].join(':'))
    .join('|')
  return `${serializeDiagnosticValue(rawConfiguration.value)}::${errors}`
}

function warnForInvalidConfiguration(): void {
  if (normalized.value.valid)
    return

  const signature = configurationWarningSignature()
  if (warnedConfigurations.has(signature))
    return

  warnedConfigurations.add(signature)
  console.warn(
    `${AUTOFIT_DIAGNOSTIC_PREFIX} AUTOFIT CONFIGURATION ERROR (${signature}); using complete defaults.`,
  )
}

function cancelActiveSessionWork(): void {
  activeHandle?.cancel()
  activeHandle = null
}

function cleanupActiveSession(options: { readonly preservePresentation?: boolean } = {}): void {
  cancelActiveSessionWork()
  runGeneratedMutation(() => activeSession?.cleanup(options))
  activeSession = null
}

function restoreLeavingPresentation(): void {
  const session = activeSession
  if (!session)
    return

  const flowElement = flow.value
  if (
    (state.value === 'fit' || state.value === 'overflow')
    && stablePresentation
    && flowElement
    && isAutofitPresentationCompatible(
      createAutofitClassificationSignature(classifyAutofitContent(flowElement)),
      stablePresentation,
    )
    && isAutofitPresentationCompatible(
      session.classificationSignature,
      stablePresentation,
    )
  ) {
    runGeneratedMutation(() => session.restorePresentation(stablePresentation!))
    return
  }
  if (state.value === 'unsupported')
    runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
}

function disposeActiveSessionForUnmount(): void {
  cancelActiveSessionWork()
  restoreLeavingPresentation()
  runGeneratedMutation(() => activeSession?.cleanup({ preservePresentation: true }))
  activeSession = null
}

function runGeneratedMutation<T>(operation: () => T): T {
  return operation()
}

function updateRootDebugAttributes(): void {
  rootDebugAttributes?.update(measureCount.value, batchId.value)
}

function checkpointEffectiveAlignment(): AutofitEffectiveAlignment {
  const alignment = normalizeAlignment(requestedAlignment.value)
  return alignment === 'distributed' ? 'middle' : alignment
}

function commitEmptyState(): void {
  cleanupActiveSession()
  publishedEmpty.value = true
  selectedTier.value = 0
  selectedScale.value = 1
  effectiveAlignment.value = checkpointEffectiveAlignment()
  fullGapCount.value = 0
  halfGapCount.value = 0
  measureCount.value = 0
  batchId.value = 0
  state.value = 'fit'
  visiblePending.value = false
  unsupportedReason.value = null
  unsupportedWarningReason = null
  stablePresentation = null
  updateRootDebugAttributes()
  lifecycle?.markGeometry()
}

function enterNeutralPending(visible: boolean): void {
  publishedEmpty.value = false
  selectedTier.value = null
  selectedScale.value = null
  fullGapCount.value = null
  halfGapCount.value = null
  unsupportedReason.value = null
  effectiveAlignment.value = 'top'
  semanticallyEmpty.value = false
  visiblePending.value = visible
  state.value = 'pending'
}

function commitUnsupportedState(
  reason: AutofitUnsupportedReason,
  classifiedGapCounts: { readonly full: number; readonly half: number } | null,
  diagnostics: {
    readonly candidateMeasurementCount: number
    readonly batchId: number
  } = { candidateMeasurementCount: 0, batchId: 0 },
): void {
  publishedEmpty.value = false
  selectedTier.value = null
  selectedScale.value = null
  effectiveAlignment.value = 'top'
  fullGapCount.value = classifiedGapCounts?.full ?? null
  halfGapCount.value = classifiedGapCounts?.half ?? null
  semanticallyEmpty.value = false
  unsupportedReason.value = reason
  measureCount.value = diagnostics.candidateMeasurementCount
  batchId.value = diagnostics.batchId
  visiblePending.value = false
  state.value = 'unsupported'
  activeHandle = null
  updateRootDebugAttributes()
  lifecycle?.markGeometry()

  if (unsupportedWarningReason !== reason) {
    console.warn(
      `${AUTOFIT_DIAGNOSTIC_PREFIX} AUTOFIT UNSUPPORTED (${reason}): content is shown with authored neutral typography in top flow.`,
    )
  }
  unsupportedWarningReason = reason
}

function commitStaticResult(
  session: AutofitStaticFitSession,
  result: AutofitMeasurementResult,
  classifiedGapCounts: { readonly full: number; readonly half: number },
  sessionGeneration: number,
): void {
  queueMicrotask(() => {
    if (
      !mounted
      || activeSession !== session
      || activeHandle?.passId !== result.passId
    ) {
      return
    }

    const application = runGeneratedMutation(() => session.applyResult(
      result.result,
      () => isStaticFitSessionCurrent(session, sessionGeneration),
    ))
    if (application.status === 'stale') {
      if (activeSession === session) {
        activeHandle = null
        queueStaticFit('geometry')
      }
      return
    }
    if (application.status === 'unsupported') {
      runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
      commitUnsupportedState(
        application.reason,
        classifiedGapCounts,
        {
          candidateMeasurementCount: result.candidateMeasurementCount,
          batchId: result.batchId,
        },
      )
      return
    }
    const committed = application.result
    const enteringOverflow = committed.overflow && state.value !== 'overflow'

    publishedEmpty.value = false
    selectedTier.value = committed.tier
    selectedScale.value = committed.scale
    effectiveAlignment.value = committed.effectiveAlignment
    fullGapCount.value = committed.gapCounts.full
    halfGapCount.value = committed.gapCounts.half
    measureCount.value = result.candidateMeasurementCount
    batchId.value = result.batchId
    state.value = committed.overflow ? 'overflow' : 'fit'
    visiblePending.value = false
    unsupportedReason.value = null
    unsupportedWarningReason = null
    stablePresentation = committed.presentation
    activeHandle = null
    updateRootDebugAttributes()
    lifecycle?.markGeometry(session.neutralStyleFingerprint)

    if (enteringOverflow) {
      console.warn(
        `${AUTOFIT_DIAGNOSTIC_PREFIX} AUTOFIT OVERFLOW: content exceeds the AutoFit viewport at the smallest configured tier.`,
      )
    }
  })
}

function isAutoColumnParticipant(): autoColumnRole is AutoColumnRole {
  return autoColumnContext !== null && autoColumnRole !== null
}

function isAutoColumnSessionCurrent(
  stamp: AutoColumnSessionStamp,
): boolean {
  if (
    !mounted
    || activeSession !== stamp.session
    || !isAutoColumnParticipant()
    || autoColumnEpoch !== stamp.epoch
    || autoColumnContext.currentEpoch() !== stamp.epoch
  ) {
    return false
  }

  const currentGeneration = lifecycle?.commitBarrier() ?? stamp.generation
  const currentFlow = flow.value
  const currentSignature = currentFlow
    ? createAutofitClassificationSignature(classifyAutofitContent(currentFlow))
    : null
  const current = mounted
    && activeSession === stamp.session
    && autoColumnEpoch === stamp.epoch
    && autoColumnContext.currentEpoch() === stamp.epoch
    && currentGeneration === stamp.generation
    && currentSignature !== null
    && areAutofitClassificationSignaturesEqual(
      stamp.session.classificationSignature,
      currentSignature,
    )
  if (!current && mounted && autoColumnEpoch === stamp.epoch)
    queueStaticFit('content')
  return current
}

function isAutoColumnTerminalCurrent(
  stamp: AutoColumnTerminalStamp,
): boolean {
  if (stamp.session)
    return isAutoColumnSessionCurrent(stamp)

  if (
    !mounted
    || !isAutoColumnParticipant()
    || autoColumnEpoch !== stamp.epoch
    || autoColumnContext.currentEpoch() !== stamp.epoch
  ) {
    return false
  }
  const currentGeneration = lifecycle?.commitBarrier() ?? stamp.generation
  const current = currentGeneration === stamp.generation
    && autoColumnEpoch === stamp.epoch
    && autoColumnContext.currentEpoch() === stamp.epoch
  if (!current && mounted && autoColumnEpoch === stamp.epoch)
    queueStaticFit('content')
  return current
}

function autoColumnTestHooks(): AutoColumnTestHooks | undefined {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test'))
    return undefined

  return (window as Window & {
    readonly __slidevAutofitTestHooks?: AutoColumnTestHooks
  }).__slidevAutofitTestHooks
}

function submitMeasuredAutoColumnCommonTier(
  stamp: AutoColumnSessionStamp,
  fits: boolean,
  presentation: AutoColumnLocalPresentationMetadata | undefined,
): void {
  const context = autoColumnContext
  const role = autoColumnRole
  if (!context || !role)
    return

  const submit = (): void => {
    if (!isAutoColumnSessionCurrent(stamp))
      return
    autoColumnTestHooks()?.afterAutoColumnBarrierDispatch?.(
      'local-common',
      role,
      stamp.epoch,
      presentation,
    )
    context.submitCommonTier({
      role,
      epoch: stamp.epoch,
      outcome: { status: 'measured', fits, presentation },
    })
  }
  const hooks = autoColumnTestHooks()
  if (hooks?.holdAutoColumnBarrier) {
    hooks.holdAutoColumnBarrier('local-common', role, stamp.epoch, submit)
    return
  }
  submit()
}

function captureAutoColumnStartingAnchor(
  stamp: AutoColumnSessionStamp,
  application: Extract<AutofitStaticFitApplication, { status: 'committed' }>,
): {
  readonly candidate: AutoColumnStartingAnchorCandidate
  readonly pairHost: HTMLElement | null
} {
  const pairHost = autoColumnContext?.pairHost() ?? null
  // A role can become the source only when its local common-tier presentation
  // is an effective distributed presentation with a transferable gap plan.
  // This also keeps non-distributed, effective-middle, and boundary-free
  // source paths out of anchor measurement entirely.
  if (
    requestedAlignment.value !== 'distributed'
    || application.result.effectiveAlignment !== 'distributed'
    || !extractAutofitCoordinatedGapPlan(application.result)
  ) {
    return {
      candidate: {
        status: 'deferred',
        epoch: stamp.epoch,
        generation: stamp.generation,
      },
      pairHost: null,
    }
  }
  if (!pairHost) {
    return {
      candidate: {
        status: 'deferred',
        epoch: stamp.epoch,
        generation: stamp.generation,
      },
      pairHost: null,
    }
  }

  const measurement = stamp.session.captureStartingAlignmentSourceSnapshot(pairHost)
  if (measurement.status === 'measured') {
    return {
      candidate: {
        status: 'measured',
        epoch: stamp.epoch,
        generation: stamp.generation,
        snapshot: measurement.snapshot,
      },
      pairHost,
    }
  }
  if (measurement.status === 'unsupported') {
    return {
      candidate: {
        status: 'unsupported',
        epoch: stamp.epoch,
        generation: stamp.generation,
        reason: measurement.reason,
      },
      pairHost,
    }
  }
  return {
    candidate: {
      status: 'deferred',
      epoch: stamp.epoch,
      generation: stamp.generation,
    },
    pairHost,
  }
}

function prepareAutoColumnResult(
  privateResult: AutoColumnPrivateResult,
  result: AutofitMeasurementResult = privateResult.result,
  measurementCount = autoColumnMeasurementCount,
): 'prepared' | 'stale' | 'unsupported' {
  const { session } = privateResult
  const application = runGeneratedMutation(() => session.applyResult(
    result.result,
    () => isAutoColumnSessionCurrent(privateResult),
  ))
  // Prepared coordinated presentations deliberately stay private, but their
  // generated style writes must still be consumed by the instance lifecycle.
  // Otherwise an observer invalidates the first participant while its sibling
  // is preparing the same common tier.
  if (!isAutoColumnSessionCurrent(privateResult))
    return 'stale'
  if (application.status === 'stale')
    return 'stale'
  if (application.status === 'unsupported') {
    runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
    lifecycle?.markGeometry(session.neutralStyleFingerprint)
    autoColumnUnsupported = {
      stamp: privateResult,
      reason: application.reason,
      gapCounts: null,
      diagnostics: {
        candidateMeasurementCount: measurementCount,
        batchId: result.batchId,
      },
    }
    return 'unsupported'
  }

  const anchorCapture = captureAutoColumnStartingAnchor(privateResult, application)
  autoColumnPrepared = {
    stamp: privateResult,
    application,
    anchorCandidate: anchorCapture.candidate,
    anchorPairHost: anchorCapture.pairHost,
    measurementCount,
    batchId: result.batchId,
  }
  // Applying a result is required to calculate its complete presentation, but
  // a coordinated result is private until both roles are ready.  Put the
  // currently published presentation straight back so candidate typography,
  // spacing, and alignment can never leak through the pair barrier.
  if (stablePresentation) {
    runGeneratedMutation(() => session.restorePresentation(stablePresentation!))
  }
  else {
    runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
  }
  lifecycle?.markGeometry(session.neutralStyleFingerprint)
  return 'prepared'
}

function autoColumnPreparedMetadata(): AutoColumnLocalPresentationMetadata | null {
  const prepared = autoColumnPrepared
  if (!prepared)
    return null

  const boundaries = prepared.application.result.presentation.boundaries
  const targetFor = (kind: 'full' | 'half'): number | null => {
    const target = boundaries.find(boundary => boundary.kind === kind)?.target
    return typeof target === 'number' && Number.isFinite(target) ? target : null
  }
  return {
    requestedAlignment: requestedAlignment.value,
    effectiveAlignment: prepared.application.result.effectiveAlignment,
    verifiedGapTargets: {
      full: targetFor('full'),
      half: targetFor('half'),
    },
  }
}

function restoreAutoColumnHeldPresentation(session: AutofitStaticFitSession): void {
  if (stablePresentation)
    runGeneratedMutation(() => session.restorePresentation(stablePresentation!))
  else
    runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
}

function coordinatedAutoColumnGapPlan(epoch: number): AutofitCoordinatedGapPlan | null {
  const prepared = autoColumnPrepared
  if (
    !prepared
    || prepared.stamp.epoch !== epoch
    || !isAutoColumnSessionCurrent(prepared.stamp)
  ) {
    return null
  }
  return extractAutofitCoordinatedGapPlan(prepared.application.result)
}

function autoColumnStartingAnchorCandidate(
  epoch: number,
): AutoColumnStartingAnchorCandidate | null {
  const prepared = autoColumnPrepared
  if (
    !prepared
    || prepared.stamp.epoch !== epoch
    || !isAutoColumnSessionCurrent(prepared.stamp)
  ) {
    return null
  }
  if (
    prepared.anchorCandidate.epoch !== prepared.stamp.epoch
    || prepared.anchorCandidate.generation !== prepared.stamp.generation
  ) {
    return null
  }
  return prepared.anchorCandidate
}

function currentAutoColumnStartingAnchor(
  epoch: number,
  candidate: Extract<AutoColumnStartingAnchorCandidate, { readonly status: 'measured' }>,
): AutoColumnCurrentSourceCoordinate {
  const prepared = autoColumnPrepared
  const pairHost = autoColumnContext?.pairHost() ?? null
  if (
    !prepared
    || prepared.stamp.epoch !== epoch
    || prepared.anchorCandidate !== candidate
    || candidate.epoch !== prepared.stamp.epoch
    || candidate.generation !== prepared.stamp.generation
    || prepared.anchorPairHost !== pairHost
    || !pairHost
    || !isAutoColumnSessionCurrent(prepared.stamp)
  ) {
    return { status: 'deferred' }
  }

  const measurement = prepared.stamp.session.readStartingAlignmentCoordinate(pairHost)
  if (
    measurement.status !== 'measured'
    || !isAutofitSourceAnchorSnapshotCompatible(
      candidate.snapshot,
      measurement.coordinate,
    )
  ) {
    return { status: 'deferred' }
  }
  return measurement
}

function prepareAutoColumnStartingAnchorUnsupported(epoch: number): void {
  const prepared = autoColumnPrepared
  if (
    !prepared
    || prepared.stamp.epoch !== epoch
    || prepared.anchorCandidate.status !== 'unsupported'
    || !isAutoColumnSessionCurrent(prepared.stamp)
  ) {
    return
  }

  autoColumnUnsupported = {
    stamp: prepared.stamp,
    reason: prepared.anchorCandidate.reason,
    gapCounts: null,
    diagnostics: {
      candidateMeasurementCount: prepared.measurementCount,
      batchId: prepared.batchId,
    },
  }
}

function publishAutoColumnPrepared(): void {
  const prepared = autoColumnPrepared
  if (!prepared || !isAutoColumnSessionCurrent(prepared.stamp))
    return

  const { session } = prepared.stamp

  const committed = prepared.application.result
  // The private prepare path restores the held presentation. Reapply the
  // prepared DOM presentation immediately before its public refs are changed.
  runGeneratedMutation(() => session.restorePresentation(committed.presentation))
  const enteringOverflow = committed.overflow && state.value !== 'overflow'
  publishedEmpty.value = false
  selectedTier.value = committed.tier
  selectedScale.value = committed.scale
  effectiveAlignment.value = committed.effectiveAlignment
  fullGapCount.value = committed.gapCounts.full
  halfGapCount.value = committed.gapCounts.half
  measureCount.value = prepared.measurementCount
  batchId.value = prepared.batchId
  state.value = committed.overflow ? 'overflow' : 'fit'
  visiblePending.value = false
  unsupportedReason.value = null
  unsupportedWarningReason = null
  stablePresentation = committed.presentation
  activeHandle = null
  updateRootDebugAttributes()
  lifecycle?.markGeometry(session.neutralStyleFingerprint)

  if (enteringOverflow) {
    console.warn(
      `${AUTOFIT_DIAGNOSTIC_PREFIX} AUTOFIT OVERFLOW: content exceeds the AutoFit viewport at the smallest configured tier.`,
    )
  }
}

function synchronizeAutoColumnTarget(
  epoch: number,
  plan: AutofitCoordinatedGapPlan,
  source: AutoColumnStartingAlignmentSource,
): void {
  const prepared = autoColumnPrepared
  if (
    !prepared
    || prepared.stamp.epoch !== epoch
    || !isAutoColumnSessionCurrent(prepared.stamp)
    || !isAutoColumnParticipant()
  ) {
    return
  }

  const pairHost = autoColumnContext?.pairHost() ?? null
  if (!pairHost)
    return

  const application = runGeneratedMutation(() => prepared.stamp.session.applyCoordinatedAlignedTargetPlan(
    prepared.application.result,
    plan,
    source.candidate.snapshot,
    source.current,
    pairHost,
    () => isAutoColumnSessionCurrent(prepared.stamp),
  ))
  if (!isAutoColumnSessionCurrent(prepared.stamp))
    return

  // Target application is private until the bridge receives the coordinator's
  // terminal decision. Restore the preceding compatible pair (or neutral
  // first-layout state) before that decision can publish either role.
  restoreAutoColumnHeldPresentation(prepared.stamp.session)
  if (!isAutoColumnSessionCurrent(prepared.stamp))
    return

  if (application.status === 'stale')
    return

  if (application.status === 'unsupported') {
    autoColumnSynchronizedUnsupported = {
      stamp: prepared.stamp,
      plan: application.plan,
      reason: application.reason,
      diagnostics: {
        candidateMeasurementCount: prepared.measurementCount,
        batchId: prepared.batchId,
      },
    }
    autoColumnContext.submitTargetSynchronization({
      role: autoColumnRole,
      epoch,
      outcome: { status: 'unsupported' },
    })
    return
  }

  autoColumnSynchronized = {
    stamp: prepared.stamp,
    application,
    measurementCount: prepared.measurementCount,
    batchId: prepared.batchId,
  }
  autoColumnContext.submitTargetSynchronization({
    role: autoColumnRole,
    epoch,
    outcome: { status: application.status },
  })
}

function publishAutoColumnSynchronizedTarget(): void {
  const synchronized = autoColumnSynchronized
  if (!synchronized || !isAutoColumnSessionCurrent(synchronized.stamp))
    return

  const { session } = synchronized.stamp
  const committed = synchronized.application.result
  runGeneratedMutation(() => session.restorePresentation(committed.presentation))
  const enteringOverflow = committed.overflow && state.value !== 'overflow'
  publishedEmpty.value = false
  selectedTier.value = committed.tier
  selectedScale.value = committed.scale
  effectiveAlignment.value = committed.effectiveAlignment
  fullGapCount.value = committed.gapCounts.full
  halfGapCount.value = committed.gapCounts.half
  measureCount.value = synchronized.measurementCount
  batchId.value = synchronized.batchId
  state.value = committed.overflow ? 'overflow' : 'fit'
  visiblePending.value = false
  unsupportedReason.value = null
  unsupportedWarningReason = null
  stablePresentation = committed.presentation
  activeHandle = null
  updateRootDebugAttributes()
  lifecycle?.markGeometry(session.neutralStyleFingerprint)

  if (enteringOverflow) {
    const causes = synchronized.application.status === 'synchronized-overflow'
      ? synchronized.application.overflowCauses
      : null
    const requirement = causes?.coordinatedGap && causes.coordinatedStartAlignment
      ? 'required coordinated semantic gaps and start alignment exceed the AutoFit viewport'
      : causes?.coordinatedStartAlignment
        ? 'required coordinated start alignment exceeds the AutoFit viewport'
        : 'required coordinated semantic gaps exceed the AutoFit viewport'
    console.warn(
      `${AUTOFIT_DIAGNOSTIC_PREFIX} AUTOFIT OVERFLOW: ${requirement} at the shared tier; no smaller-tier fallback was attempted.`,
    )
  }
}

function publishAutoColumnSynchronizedUnsupported(): void {
  const unsupported = autoColumnSynchronizedUnsupported
  if (!unsupported || !isAutoColumnSessionCurrent(unsupported.stamp))
    return

  runGeneratedMutation(() => unsupported.stamp.session.restoreAuthoredNeutralTop())
  commitUnsupportedState(
    unsupported.reason,
    null,
    unsupported.diagnostics,
  )
}

function publishAutoColumnPrivate(): void {
  if (autoColumnUnsupported) {
    const unsupported = autoColumnUnsupported
    if (!isAutoColumnTerminalCurrent(unsupported.stamp))
      return
    commitUnsupportedState(
      unsupported.reason,
      unsupported.gapCounts,
      unsupported.diagnostics,
    )
    return
  }
  if (semanticallyEmpty.value) {
    commitEmptyState()
    return
  }
  if (
    autoColumnPrivateResult
    && prepareAutoColumnResult(autoColumnPrivateResult) === 'prepared'
  ) {
    publishAutoColumnPrepared()
  }
}

function prepareAutoColumnCommonTier(epoch: number, tier: number): void {
  if (
    !isAutoColumnParticipant()
    || epoch !== autoColumnEpoch
    || !autoColumnPrivateResult
    || !activeSession
  )
    return

  const cached = activeSession.resultForMeasuredTier(tier)
  if (cached) {
    const result: AutofitMeasurementResult = {
      ...autoColumnPrivateResult.result,
      result: cached,
    }
    const preparation = prepareAutoColumnResult(autoColumnPrivateResult, result)
    if (preparation === 'stale')
      return
    if (preparation === 'unsupported') {
      autoColumnContext.submitCommonTier({
        role: autoColumnRole,
        epoch,
        outcome: autoColumnUnsupported
          ? { status: 'unsupported' }
          : { status: 'stale' },
      })
      return
    }
    // A cached non-fit must be submitted as a non-fit. The only legitimate
    // overflow is the role's private smallest-tier terminal.
    submitMeasuredAutoColumnCommonTier(
      autoColumnPrivateResult,
      cached.fits || (
        cached.overflow
        && autoColumnPrivateResult.result.result.overflow
        && cached.tier === -normalized.value.config.smallTiers
      ),
      autoColumnPreparedMetadata() ?? undefined,
    )
    return
  }

  const session = activeSession
  const privateResult = autoColumnPrivateResult
  const stamp: AutoColumnSessionStamp = {
    epoch,
    generation: privateResult.generation,
    session,
  }
  const commonMeasurementCount = autoColumnMeasurementCount
  const job: AutofitDomMeasurementJob = {
    instanceId,
    config: normalized.value.config,
    fixedTier: tier,
    writeIntrinsicCandidate: candidate => runGeneratedMutation(
      () => session.writeIntrinsicCandidate(candidate),
    ),
    readIntrinsicCandidate: candidate => runGeneratedMutation(
      () => session.readIntrinsicCandidate(candidate),
    ),
    writeCompensatedCandidate: (candidate, intrinsic) => runGeneratedMutation(
      () => session.writeCompensatedCandidate(candidate, intrinsic),
    ),
    readFinalCandidate: (candidate, intrinsic) => runGeneratedMutation(
      () => session.readFinalCandidate(candidate, intrinsic),
    ),
    finish: (result) => {
      if (
        !isAutoColumnParticipant()
        || !isAutoColumnSessionCurrent(stamp)
      )
        return
      if (result.status === 'completed') {
        const measurementCount = commonMeasurementCount + result.candidateMeasurementCount
        const preparation = prepareAutoColumnResult(
          privateResult,
          result,
          measurementCount,
        )
        if (preparation === 'stale')
          return
        autoColumnMeasurementCount = measurementCount
        if (preparation === 'unsupported') {
          autoColumnContext.submitCommonTier({
            role: autoColumnRole,
            epoch,
            outcome: { status: 'unsupported' },
          })
          return
        }
        submitMeasuredAutoColumnCommonTier(
          stamp,
          result.result.fits,
          autoColumnPreparedMetadata() ?? undefined,
        )
        return
      }
      if (result.status === 'unsupported') {
        if (!isAutoColumnSessionCurrent(stamp))
          return
        runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
        autoColumnUnsupported = {
          stamp,
          reason: result.reason,
          gapCounts: null,
          diagnostics: {
            candidateMeasurementCount: autoColumnMeasurementCount,
            batchId: result.batchId,
          },
        }
        autoColumnContext.submitCommonTier({
          role: autoColumnRole,
          epoch,
          outcome: { status: 'unsupported' },
        })
        return
      }
      autoColumnContext.submitCommonTier({
        role: autoColumnRole,
        epoch,
        outcome: { status: result.status === 'deferred' ? 'deferred' : 'cancelled' },
      })
    },
  }
  activeHandle = sharedAutofitDomScheduler.request(job)
}

function beginAutoColumnEpoch(epoch: number): void {
  if (!mounted || epoch < autoColumnEpoch)
    return

  autoColumnEpoch = epoch
  // An invalidation can synchronously interrupt the private target gap/anchor
  // operation after it has written generated styles.  Keep the current session
  // alive until the replacement epoch starts so the prior compatible pair (or
  // the first-layout neutral state) is restored before this callback returns.
  // The new epoch and existing session guard make every old callback stale.
  activeHandle?.cancel()
  activeHandle = null
  if (activeSession) {
    const currentFlow = flow.value
    if (
      stablePresentation
      && currentFlow
      && isAutofitPresentationCompatible(
        createAutofitClassificationSignature(classifyAutofitContent(currentFlow)),
        stablePresentation,
      )
    ) {
      runGeneratedMutation(() => activeSession?.restorePresentation(stablePresentation!))
    }
    else {
      runGeneratedMutation(() => activeSession?.restoreAuthoredNeutralTop())
    }
  }
  autoColumnPrivateResult = null
  autoColumnPrepared = null
  autoColumnSynchronized = null
  autoColumnSynchronizedUnsupported = null
  autoColumnUnsupported = null
  autoColumnMeasurementCount = 0
  rootDebugAttributes?.updatePrivateTier(null)
  queueMicrotask(() => startStaticFit(epoch))
}

function discardAutoColumnEpoch(epoch: number): void {
  if (epoch !== autoColumnEpoch)
    return

  activeHandle?.cancel()
  activeHandle = null
  autoColumnPrivateResult = null
  autoColumnPrepared = null
  autoColumnSynchronized = null
  autoColumnSynchronizedUnsupported = null
  autoColumnUnsupported = null
  rootDebugAttributes?.updatePrivateTier(null)
  if (activeSession && stablePresentation) {
    runGeneratedMutation(() => activeSession?.restorePresentation(stablePresentation!))
    lifecycle?.markGeometry(activeSession.neutralStyleFingerprint)
    return
  }
  if (activeSession)
    runGeneratedMutation(() => activeSession?.restoreAuthoredNeutralTop())
  enterNeutralPending(false)
}

function hideAutoColumnForTopology(epoch: number): void {
  if (epoch !== autoColumnEpoch)
    return
  stablePresentation = null
  enterNeutralPending(false)
}

function registerAutoColumnParticipant(rootElement: HTMLElement): void {
  const role = rootElement.getAttribute('data-autofit-role')
  if (!autoColumnContext || (role !== 'left' && role !== 'right'))
    return

  autoColumnRole = role
  const participant: AutoColumnParticipant = {
    beginEpoch: beginAutoColumnEpoch,
    discardEpoch: discardAutoColumnEpoch,
    hideForTopology: hideAutoColumnForTopology,
    prepareCommonTier: prepareAutoColumnCommonTier,
    publishPrivate: (epoch) => {
      if (epoch === autoColumnEpoch)
        publishAutoColumnPrivate()
    },
    publishCommonTier: (epoch) => {
      if (epoch === autoColumnEpoch)
        publishAutoColumnPrepared()
    },
    coordinatedGapPlan: coordinatedAutoColumnGapPlan,
    startingAnchorCandidate: autoColumnStartingAnchorCandidate,
    currentStartingAnchor: currentAutoColumnStartingAnchor,
    prepareStartingAnchorUnsupported: prepareAutoColumnStartingAnchorUnsupported,
    synchronizeTarget: synchronizeAutoColumnTarget,
    publishSynchronizedTarget: (epoch) => {
      if (epoch === autoColumnEpoch)
        publishAutoColumnSynchronizedTarget()
    },
    publishSynchronizedUnsupported: (epoch) => {
      if (epoch === autoColumnEpoch)
        publishAutoColumnSynchronizedUnsupported()
    },
  }
  autoColumnEpoch = autoColumnContext.register(role, participant)
  disposeAutoColumnParticipant = (() => {
    const unregister = (): void => autoColumnContext.unregister(role, participant)
    return unregister
  })()
}

function isStaticFitSessionCurrent(
  session: AutofitStaticFitSession,
  sessionGeneration: number,
): boolean {
  if (!mounted || activeSession !== session)
    return false

  const currentGeneration = lifecycle?.commitBarrier() ?? sessionGeneration
  const currentFlow = flow.value
  const currentSignature = currentFlow
    ? createAutofitClassificationSignature(classifyAutofitContent(currentFlow))
    : null
  const current = currentGeneration === sessionGeneration
    && currentSignature !== null
    && areAutofitClassificationSignaturesEqual(
      session.classificationSignature,
      currentSignature,
    )
  if (!current)
    queueStaticFit('content')
  return current
}

function startStaticFit(coordinatedEpoch?: number): void {
  if (!mounted)
    return

  if (isAutoColumnParticipant() && coordinatedEpoch !== undefined && coordinatedEpoch !== autoColumnEpoch)
    return

  const startEpoch = coordinatedEpoch ?? autoColumnEpoch

  refreshQueued = false
  pendingInvalidationReasons.clear()
  warnForInvalidConfiguration()
  if (isAutoColumnParticipant()) {
    autoColumnPrivateResult = null
    autoColumnPrepared = null
    autoColumnSynchronized = null
    autoColumnSynchronizedUnsupported = null
    autoColumnUnsupported = null
    autoColumnMeasurementCount = 0
    rootDebugAttributes?.updatePrivateTier(null)
  }

  const viewportElement = viewport.value
  const flowElement = flow.value
  if (!viewportElement || !flowElement)
    return

  if (state.value === 'pending' && !visiblePending.value)
    effectiveAlignment.value = checkpointEffectiveAlignment()

  const replacingStableEmpty = state.value === 'fit'
    && semanticallyEmpty.value
    && stablePresentation === null
  const classification = classifyAutofitContent(flowElement)
  const signature = createAutofitClassificationSignature(classification)
  const compatibleStable = stablePresentation
    ? isAutofitPresentationCompatible(signature, stablePresentation)
    : false
  const hadStablePresentation = stablePresentation !== null
  const classificationFailure = selectFirstAutofitUnsupported(
    classification.visual.unsupported,
  )
  semanticallyEmpty.value = isAutofitClassificationSemanticallyEmpty(classification)

  // Empty and unsupported terminals are still topology changes. Establish
  // compatibility before their early returns so the pair never leaves a
  // generated presentation mapped to a different live tree.
  if (hadStablePresentation && !compatibleStable) {
    cleanupActiveSession()
    stablePresentation = null
    if (isAutoColumnParticipant())
      autoColumnContext.hideForTopology(startEpoch)
    else
      enterNeutralPending(true)
  }

  if (semanticallyEmpty.value) {
    if (isAutoColumnParticipant()) {
      autoColumnContext.submitPrivate({
        role: autoColumnRole,
        epoch: startEpoch,
        outcome: { status: 'empty' },
      })
      return
    }
    commitEmptyState()
    return
  }
  if (classificationFailure) {
    if (isAutoColumnParticipant()) {
      cleanupActiveSession()
      autoColumnUnsupported = {
        stamp: {
          epoch: startEpoch,
          generation: lifecycle?.generation ?? 0,
          session: null,
        },
        reason: classificationFailure.reason,
        gapCounts: null,
        diagnostics: { candidateMeasurementCount: 0, batchId: 0 },
      }
      autoColumnContext.submitPrivate({
        role: autoColumnRole,
        epoch: startEpoch,
        outcome: { status: 'unsupported' },
      })
      return
    }
    cleanupActiveSession()
    commitUnsupportedState(classificationFailure.reason, null)
    return
  }
  if (replacingStableEmpty)
    enterNeutralPending(false)

  if (!isAutofitViewportRenderable(viewportElement)) {
    if (activeHandle)
      cleanupActiveSession()
    lifecycle?.markGeometry()
    return
  }

  cleanupActiveSession()
  const session = runGeneratedMutation(() => createAutofitStaticFitSession({
    viewport: viewportElement,
    flow: flowElement,
    config: normalized.value.config,
    classification,
  }))
  const sessionGeneration = lifecycle?.generation ?? 0
  activeSession = session
  const autoColumnStamp: AutoColumnSessionStamp | null = isAutoColumnParticipant()
    ? { epoch: startEpoch, generation: sessionGeneration, session }
    : null
  if (stablePresentation && compatibleStable) {
    runGeneratedMutation(
      () => session.restorePresentation(stablePresentation!),
    )
  }

  const job: AutofitDomMeasurementJob = {
    instanceId,
    config: normalized.value.config,
    writeIntrinsicCandidate: candidate => runGeneratedMutation(
      () => session.writeIntrinsicCandidate(candidate),
    ),
    readIntrinsicCandidate: candidate => runGeneratedMutation(
      () => session.readIntrinsicCandidate(candidate),
    ),
    writeCompensatedCandidate: (candidate, intrinsic) => runGeneratedMutation(
      () => session.writeCompensatedCandidate(candidate, intrinsic),
    ),
    readFinalCandidate: (candidate, intrinsic) => runGeneratedMutation(
      () => session.readFinalCandidate(candidate, intrinsic),
    ),
    restore: () => {
      if (
        activeSession === session
        && stablePresentation
        && compatibleStable
      ) {
        runGeneratedMutation(
          () => session.restorePresentation(stablePresentation!),
        )
      }
      else if (activeSession === session) {
        runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
      }
    },
    finish: (result) => {
      if (activeSession !== session)
        return

      if (result.status === 'completed') {
        if (stablePresentation && compatibleStable) {
          runGeneratedMutation(
            () => session.restorePresentation(stablePresentation!),
          )
        }
        if (isAutoColumnParticipant()) {
          if (!autoColumnStamp || !isAutoColumnSessionCurrent(autoColumnStamp))
            return
          // A completed private search must not leave its last candidate's
          // generated styles in the live tree while its sibling finishes.
          // Hold the previous compatible coordinated presentation instead.
          if (stablePresentation && compatibleStable) {
            runGeneratedMutation(
              () => session.restorePresentation(stablePresentation!),
            )
          }
          else {
            runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
          }
          if (!isAutoColumnSessionCurrent(autoColumnStamp))
            return
          lifecycle?.markGeometry(session.neutralStyleFingerprint)
          autoColumnPrivateResult = {
            ...autoColumnStamp,
            result,
          }
          autoColumnMeasurementCount = result.candidateMeasurementCount
          rootDebugAttributes?.updatePrivateTier(result.result.tier)
          autoColumnContext.submitPrivate({
            role: autoColumnRole,
            epoch: autoColumnStamp.epoch,
            outcome: {
              status: 'managed',
              tier: result.result.tier,
              overflow: result.result.overflow,
            },
          })
          return
        }
        commitStaticResult(
          session,
          result,
          classification.gapCounts,
          sessionGeneration,
        )
        return
      }

      activeHandle = null
      if (result.status === 'deferred') {
        if (isAutoColumnParticipant()) {
          if (!autoColumnStamp || !isAutoColumnSessionCurrent(autoColumnStamp))
            return
          autoColumnContext.submitPrivate({
            role: autoColumnRole,
            epoch: autoColumnStamp.epoch,
            outcome: { status: 'deferred' },
          })
          return
        }
        if (stablePresentation && compatibleStable) {
          runGeneratedMutation(
            () => session.restorePresentation(stablePresentation!),
          )
          runGeneratedMutation(() => session.finishPendingPresentation())
        }
        else {
          runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
        }
        queueMicrotask(() => {
          if (mounted && activeSession === session) {
            lifecycle?.markGeometry(session.neutralStyleFingerprint)
          }
        })
        return
      }
      if (result.status === 'unsupported') {
        if (isAutoColumnParticipant()) {
          if (!autoColumnStamp || !isAutoColumnSessionCurrent(autoColumnStamp))
            return
        }
        else if (!isStaticFitSessionCurrent(session, sessionGeneration)) {
          if (activeSession === session)
            activeHandle = null
          return
        }
        runGeneratedMutation(() => session.restoreAuthoredNeutralTop())
        if (isAutoColumnParticipant()) {
          autoColumnUnsupported = {
            stamp: autoColumnStamp!,
            reason: result.reason,
            gapCounts: classification.gapCounts,
            diagnostics: {
              candidateMeasurementCount: result.candidateMeasurementCount,
              batchId: result.batchId,
            },
          }
          autoColumnContext.submitPrivate({
            role: autoColumnRole,
            epoch: autoColumnStamp!.epoch,
            outcome: { status: 'unsupported' },
          })
          return
        }
        commitUnsupportedState(result.reason, classification.gapCounts, {
          candidateMeasurementCount: result.candidateMeasurementCount,
          batchId: result.batchId,
        })
      }
    },
  }
  activeHandle = sharedAutofitDomScheduler.request(job)
}

function queueStaticFit(reason: AutofitInvalidationReason): void {
  if (!mounted)
    return

  if (isAutoColumnParticipant()) {
    autoColumnContext.invalidate(autoColumnRole)
    return
  }

  pendingInvalidationReasons.add(reason)
  if (refreshQueued)
    return

  refreshQueued = true
  queueMicrotask(startStaticFit)
}

watch(
  rawConfiguration,
  () => queueStaticFit('configuration'),
  { deep: true },
)

onMounted(async () => {
  mounted = true
  await nextTick()
  const rootElement = root.value
  const viewportElement = viewport.value
  const flowElement = flow.value
  if (!rootElement || !viewportElement || !flowElement)
    return

  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    const { installAutofitRootDebugAttributes } = await import(
      '../utils/autofit/root-debug'
    )
    if (!mounted)
      return
    rootDebugAttributes = installAutofitRootDebugAttributes(rootElement)
    updateRootDebugAttributes()
    const event = 'slidev-autofit-test-supersede'
    const supersede = (): void => queueStaticFit('content')
    rootElement.addEventListener(event, supersede)
    disposeTestSupersede = () => {
      rootElement.removeEventListener(event, supersede)
    }
  }

  lifecycle = createAutofitLifecycle({
    root: rootElement,
    viewport: viewportElement,
    flow: flowElement,
    probeStyleContext: () => {
      if (
        !activeSession
        || !stablePresentation
        || (state.value !== 'fit' && state.value !== 'overflow')
      ) {
        return null
      }
      return runGeneratedMutation(
        () => activeSession!.probeNeutralStyleFingerprint(stablePresentation!),
      )
    },
    invalidate: queueStaticFit,
  })
  registerAutoColumnParticipant(rootElement)
  startStaticFit()
})

onBeforeUnmount(() => {
  mounted = false
  rootDebugAttributes?.dispose()
  rootDebugAttributes = null
  disposeTestSupersede?.()
  disposeTestSupersede = null
  disposeAutoColumnParticipant?.()
  disposeAutoColumnParticipant = null
  lifecycle?.dispose()
  lifecycle = null
  disposeActiveSessionForUnmount()
  stablePresentation = null
  sharedAutofitDomScheduler.cancel(instanceId)
})
</script>

<template>
  <div
    ref="root"
    class="autofit"
    :class="{
      'autofit--pending': state === 'pending',
      'autofit--pending-visible': state === 'pending' && visiblePending,
      'autofit--fit': state === 'fit',
      'autofit--overflow': state === 'overflow',
      'autofit--unsupported': state === 'unsupported',
      'autofit--config-error': !normalized.valid,
    }"
    :data-autofit-state="state"
    :data-autofit-tier="selectedTier ?? undefined"
    :data-autofit-scale="selectedScale ?? undefined"
    :data-autofit-requested-alignment="requestedAlignment"
    :data-autofit-effective-alignment="effectiveAlignment"
    :data-autofit-full-gaps="fullGapCount ?? undefined"
    :data-autofit-half-gaps="halfGapCount ?? undefined"
    :data-autofit-config-error="normalized.valid ? undefined : configError"
    :data-autofit-empty="publishedEmpty ? 'true' : undefined"
    :data-autofit-unsupported-reason="unsupportedReason ?? undefined"
  >
    <div ref="viewport" class="autofit__viewport">
      <div ref="flow" class="autofit__flow">
        <slot />
      </div>
    </div>
    <div class="autofit__diagnostics" aria-hidden="true">
      <span v-if="state === 'overflow'" class="autofit__overflow-badge">
        AUTOFIT OVERFLOW
      </span>
      <span
        v-if="state === 'unsupported'"
        class="autofit__unsupported-badge"
      >
        AUTOFIT UNSUPPORTED
      </span>
    </div>
  </div>
</template>
