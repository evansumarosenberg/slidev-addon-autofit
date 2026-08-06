import { createFixedTierSearch, createTierSearch } from './tiers'
import type {
  AutofitDiagnosticJob,
  AutofitDiscardReason,
  AutofitFinalCandidateMeasurement,
  AutofitGeometryDeferReason,
  AutofitIntrinsicCandidateMeasurement,
  AutofitMeasurementJob,
  AutofitMeasurementFinish,
  AutofitMeasurementJobHandle,
  AutofitSchedulerDiagnosticSink,
  AutofitUnsupportedReason,
  TierCandidate,
  TierSearchMachine,
} from './types'

type FrameCallback = (timestamp: number) => void
type JobStatus = 'queued' | 'active' | 'finished'

export interface AutofitMeasurementSchedulerOptions<IntrinsicPayload = unknown> {
  requestFrame(callback: FrameCallback): unknown
  cancelFrame?(handle: unknown): void
  writeIntrinsicCandidate(
    job: AutofitMeasurementJob,
    candidate: TierCandidate,
  ): void
  readIntrinsicCandidate(
    job: AutofitMeasurementJob,
    candidate: TierCandidate,
  ): AutofitIntrinsicCandidateMeasurement<IntrinsicPayload>
  writeCompensatedCandidate(
    job: AutofitMeasurementJob,
    candidate: TierCandidate,
    intrinsic: IntrinsicPayload,
  ): void
  readFinalCandidate(
    job: AutofitMeasurementJob,
    candidate: TierCandidate,
    intrinsic: IntrinsicPayload,
  ): AutofitFinalCandidateMeasurement
  diagnostics?: AutofitSchedulerDiagnosticSink
}

export interface AutofitMeasurementScheduler {
  request(job: AutofitMeasurementJob): AutofitMeasurementJobHandle
  cancel(instanceId: string): void
  setDiagnostics(diagnostics?: AutofitSchedulerDiagnosticSink): void
  dispose(): void
}

interface ScheduledJobState extends AutofitDiagnosticJob {
  readonly job: AutofitMeasurementJob
  readonly search: TierSearchMachine
  readonly handle: AutofitMeasurementJobHandle
  candidateMeasurementCount: number
  status: JobStatus
  finished: boolean
}

interface PendingFinishCallback {
  readonly job: AutofitMeasurementJob
  readonly result: AutofitMeasurementFinish
}

function isActiveStatus(status: JobStatus): boolean {
  return status === 'queued' || status === 'active'
}

function isGeometryDeferReason(
  reason: unknown,
): reason is AutofitGeometryDeferReason {
  return reason === 'no-measurable-host' || reason === 'invalid-host-scale'
}

class SharedAutofitMeasurementScheduler<IntrinsicPayload>
  implements AutofitMeasurementScheduler {
  readonly #options: AutofitMeasurementSchedulerOptions<IntrinsicPayload>
  #diagnostics: AutofitSchedulerDiagnosticSink | undefined
  readonly #pending = new Map<string, ScheduledJobState>()
  readonly #current = new Map<string, ScheduledJobState>()
  #nextPassId = 1
  #nextFrameId = 1
  #nextBatchId = 1
  #framePending = false
  #frameHandle: unknown
  #disposed = false
  #runningFrame = false
  #drainingFinishCallbacks = false
  readonly #pendingFinishCallbacks: PendingFinishCallback[] = []

  constructor(options: AutofitMeasurementSchedulerOptions<IntrinsicPayload>) {
    this.#options = options
    this.#diagnostics = options.diagnostics
  }

  request(job: AutofitMeasurementJob): AutofitMeasurementJobHandle {
    try {
      if (this.#disposed)
        throw new Error('autofit measurement scheduler has been disposed')
      if (!job.instanceId)
        throw new TypeError('autofit measurement job requires an instance id')

      const current = this.#current.get(job.instanceId)
      if (current?.job === job && isActiveStatus(current.status))
        return current.handle
      if (current && isActiveStatus(current.status))
        this.#discard(current, 'superseded')

      const state = this.#createState(job)
      this.#current.set(job.instanceId, state)
      this.#pending.set(job.instanceId, state)
      this.#ensureFrame()
      return state.handle
    }
    finally {
      this.#drainFinishCallbacksIfSafe()
    }
  }

  cancel(instanceId: string): void {
    try {
      const state = this.#current.get(instanceId)
      if (state)
        this.#discard(state, 'cancelled')
    }
    finally {
      this.#drainFinishCallbacksIfSafe()
    }
  }

  setDiagnostics(diagnostics?: AutofitSchedulerDiagnosticSink): void {
    this.#diagnostics = diagnostics
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true

    try {
      for (const state of [...this.#current.values()])
        this.#discard(state, 'cancelled')

      this.#cancelEmptyFrame()
    }
    finally {
      this.#drainFinishCallbacksIfSafe()
    }
  }

  #createState(job: AutofitMeasurementJob): ScheduledJobState {
    const passId = this.#nextPassId
    this.#nextPassId += 1

    let state: ScheduledJobState
    const handle: AutofitMeasurementJobHandle = Object.freeze({
      passId,
      get active(): boolean {
        return isActiveStatus(state.status)
      },
      cancel: (): void => {
        try {
          this.#discard(state, 'cancelled')
        }
        finally {
          this.#drainFinishCallbacksIfSafe()
        }
      },
    })

    state = {
      instanceId: job.instanceId,
      passId,
      job,
      search: job.fixedTier === undefined
        ? createTierSearch(job.config)
        : createFixedTierSearch(job.config, job.fixedTier),
      handle,
      candidateMeasurementCount: 0,
      status: 'queued',
      finished: false,
    }
    return state
  }

  #ensureFrame(): void {
    if (this.#framePending || this.#pending.size === 0 || this.#disposed)
      return

    this.#framePending = true
    this.#frameHandle = this.#options.requestFrame(() => this.#runFrame())
  }

  #runFrame(): void {
    this.#framePending = false
    this.#frameHandle = undefined

    if (this.#disposed || this.#pending.size === 0)
      return

    const states = [...this.#pending.values()].filter(state =>
      this.#isCurrent(state) && state.status === 'queued',
    )
    this.#pending.clear()
    if (states.length === 0)
      return

    this.#runningFrame = true
    try {
      const frameId = this.#nextFrameId
      const batchId = this.#nextBatchId
      this.#nextFrameId += 1
      this.#nextBatchId += 1

      for (const state of states)
        state.status = 'active'

      this.#diagnostics?.recordBatch({
        frameId,
        batchId,
        jobs: states.map(state => ({
          instanceId: state.instanceId,
          passId: state.passId,
        })),
      })

      const candidates = new Map<ScheduledJobState, TierCandidate>()
      for (const state of states) {
        if (!this.#isRunnable(state))
          continue

        const candidate = state.search.candidate
        if (!candidate)
          throw new Error('autofit tier search has no candidate to write')

        candidates.set(state, candidate)
        this.#options.writeIntrinsicCandidate(state.job, candidate)
      }

      this.#drainFinishCallbacks()

      const intrinsicByState = new Map<ScheduledJobState, IntrinsicPayload>()
      for (const state of states) {
        if (!this.#isRunnable(state))
          continue

        const candidate = candidates.get(state)
        if (!candidate)
          continue

        const measurement = this.#options.readIntrinsicCandidate(
          state.job,
          candidate,
        )

        if (!this.#isRunnable(state))
          continue

        if (measurement.status === 'deferred') {
          this.#finishDeferred(
            state,
            'intrinsic',
            measurement.reason,
            frameId,
            batchId,
          )
          continue
        }
        if (measurement.status === 'unsupported') {
          this.#finishUnsupported(
            state,
            'intrinsic',
            measurement.reason,
            frameId,
            batchId,
          )
          continue
        }
        if (measurement.status !== 'measured')
          throw new TypeError('invalid autofit intrinsic measurement result')

        intrinsicByState.set(state, measurement.payload)
      }

      this.#drainFinishCallbacks()

      for (const state of states) {
        if (!this.#isRunnable(state))
          continue

        const candidate = candidates.get(state)
        if (!candidate || !intrinsicByState.has(state))
          continue

        this.#options.writeCompensatedCandidate(
          state.job,
          candidate,
          intrinsicByState.get(state) as IntrinsicPayload,
        )
      }

      this.#drainFinishCallbacks()

      for (const state of states) {
        if (!this.#isRunnable(state))
          continue

        const candidate = candidates.get(state)
        if (!candidate || !intrinsicByState.has(state))
          continue

        const measurement = this.#options.readFinalCandidate(
          state.job,
          candidate,
          intrinsicByState.get(state) as IntrinsicPayload,
        )

        if (!this.#isRunnable(state))
          continue

        if (measurement.status === 'deferred') {
          this.#finishDeferred(
            state,
            'final',
            measurement.reason,
            frameId,
            batchId,
          )
          continue
        }
        if (measurement.status === 'unsupported') {
          this.#finishUnsupported(
            state,
            'final',
            measurement.reason,
            frameId,
            batchId,
          )
          continue
        }
        if (measurement.status !== 'measured')
          throw new TypeError('invalid autofit final measurement result')

        state.candidateMeasurementCount += 1
        this.#diagnostics?.recordCandidateMeasurement(state)
        state.search.record(candidate.index, measurement.fits)
        if (state.search.result) {
          this.#complete(state, frameId, batchId)
          continue
        }

        state.status = 'queued'
        this.#pending.set(state.instanceId, state)
      }

      this.#drainFinishCallbacks()

      for (const state of states) {
        if (state.status === 'queued')
          state.job.restore?.()
      }
      this.#drainFinishCallbacks()
    }
    finally {
      this.#runningFrame = false
      this.#drainFinishCallbacks()
      this.#ensureFrame()
    }
  }

  #complete(state: ScheduledJobState, frameId: number, batchId: number): void {
    const result = state.search.result
    if (!result)
      throw new Error('cannot complete an unfinished autofit tier search')

    this.#finish(state, {
      status: 'completed',
      passId: state.passId,
      frameId,
      batchId,
      candidateMeasurementCount: state.candidateMeasurementCount,
      result,
    })
  }

  #finishDeferred(
    state: ScheduledJobState,
    phase: 'intrinsic' | 'final',
    reason: AutofitGeometryDeferReason,
    frameId: number,
    batchId: number,
  ): void {
    if (!isGeometryDeferReason(reason))
      throw new TypeError('unsupported autofit geometry deferral reason')

    this.#finish(state, {
      status: 'deferred',
      passId: state.passId,
      frameId,
      batchId,
      candidateMeasurementCount: state.candidateMeasurementCount,
      phase,
      reason,
    })
  }

  #finishUnsupported(
    state: ScheduledJobState,
    phase: 'intrinsic' | 'final',
    reason: AutofitUnsupportedReason,
    frameId: number,
    batchId: number,
  ): void {
    this.#finish(state, {
      status: 'unsupported',
      passId: state.passId,
      frameId,
      batchId,
      candidateMeasurementCount: state.candidateMeasurementCount,
      phase,
      reason,
    })
  }

  #discard(state: ScheduledJobState, reason: AutofitDiscardReason): void {
    if (!isActiveStatus(state.status))
      return

    if (this.#pending.get(state.instanceId) === state)
      this.#pending.delete(state.instanceId)
    this.#diagnostics?.recordDiscardedJob(state, reason)
    this.#finish(state, {
      status: 'discarded',
      passId: state.passId,
      candidateMeasurementCount: state.candidateMeasurementCount,
      reason,
    })
    this.#cancelEmptyFrame()
  }

  #finish(state: ScheduledJobState, result: AutofitMeasurementFinish): void {
    if (state.finished)
      return

    state.finished = true
    state.status = 'finished'
    if (this.#pending.get(state.instanceId) === state)
      this.#pending.delete(state.instanceId)
    this.#removeCurrent(state)
    this.#pendingFinishCallbacks.push({
      job: state.job,
      result,
    })
  }

  #drainFinishCallbacksIfSafe(): void {
    if (!this.#runningFrame)
      this.#drainFinishCallbacks()
  }

  #drainFinishCallbacks(): void {
    if (this.#drainingFinishCallbacks)
      return

    this.#drainingFinishCallbacks = true
    try {
      while (this.#pendingFinishCallbacks.length > 0) {
        const pending = this.#pendingFinishCallbacks.shift()
        pending?.job.finish(pending.result)
      }
    }
    finally {
      this.#drainingFinishCallbacks = false
    }
  }

  #removeCurrent(state: ScheduledJobState): void {
    if (this.#current.get(state.instanceId) === state)
      this.#current.delete(state.instanceId)
  }

  #isCurrent(state: ScheduledJobState): boolean {
    return this.#current.get(state.instanceId) === state
  }

  #isRunnable(state: ScheduledJobState): boolean {
    return state.status === 'active' && this.#isCurrent(state) && !this.#disposed
  }

  #cancelEmptyFrame(): void {
    if (!this.#framePending || this.#pending.size > 0 || !this.#options.cancelFrame)
      return

    this.#options.cancelFrame(this.#frameHandle)
    this.#framePending = false
    this.#frameHandle = undefined
  }
}

export function createAutofitMeasurementScheduler(
  options: AutofitMeasurementSchedulerOptions,
): AutofitMeasurementScheduler
export function createAutofitMeasurementScheduler<IntrinsicPayload>(
  options: AutofitMeasurementSchedulerOptions<IntrinsicPayload>,
): AutofitMeasurementScheduler
export function createAutofitMeasurementScheduler<IntrinsicPayload>(
  options: AutofitMeasurementSchedulerOptions<IntrinsicPayload>,
): AutofitMeasurementScheduler {
  return new SharedAutofitMeasurementScheduler(options)
}
