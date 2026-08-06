import type {
  AutofitCandidateMeasurementDiagnostic,
  AutofitDiagnosticJob,
  AutofitDiscardedJob,
  AutofitSchedulerBatchEvent,
  AutofitSchedulerBatchDiagnostic,
  AutofitSchedulerDiagnostics,
  AutofitSchedulerDiagnosticsSnapshot,
} from './types'

const DEBUG_GLOBAL_KEY = '__slidevAutofitDebug'

interface MutableCandidateMeasurement extends AutofitDiagnosticJob {
  count: number
}

export interface AutofitDebugApi {
  readonly snapshot: AutofitSchedulerDiagnosticsSnapshot
  reset(): void
}

function freezeDiagnosticJob(job: AutofitDiagnosticJob): AutofitDiagnosticJob {
  return Object.freeze({
    instanceId: job.instanceId,
    passId: job.passId,
  })
}

function freezeBatch(
  batch: AutofitSchedulerBatchEvent,
): AutofitSchedulerBatchDiagnostic {
  return Object.freeze({
    frameId: batch.frameId,
    batchId: batch.batchId,
    jobs: Object.freeze(batch.jobs.map(freezeDiagnosticJob)),
    intrinsicWritePhaseCount: 1,
    intrinsicReadPhaseCount: 1,
    compensatedWritePhaseCount: 1,
    finalReadPhaseCount: 1,
  })
}

function freezeCandidateMeasurement(
  measurement: AutofitCandidateMeasurementDiagnostic,
): AutofitCandidateMeasurementDiagnostic {
  return Object.freeze({ ...measurement })
}

function freezeDiscardedJob(job: AutofitDiscardedJob): AutofitDiscardedJob {
  return Object.freeze({ ...job })
}

export function createAutofitSchedulerDiagnostics(): AutofitSchedulerDiagnostics {
  let batches: AutofitSchedulerBatchDiagnostic[] = []
  let discardedJobs: AutofitDiscardedJob[] = []
  let candidateMeasurements = new Map<number, MutableCandidateMeasurement>()
  let lastFrameId = 0
  let lastBatchId = 0
  let frameCount = 0
  let batchCount = 0
  let intrinsicWritePhaseCount = 0
  let intrinsicReadPhaseCount = 0
  let compensatedWritePhaseCount = 0
  let finalReadPhaseCount = 0

  return {
    recordBatch(batch): void {
      const batchCopy = freezeBatch(batch)
      batches.push(batchCopy)
      lastFrameId = batch.frameId
      lastBatchId = batch.batchId
      frameCount += 1
      batchCount += 1
      intrinsicWritePhaseCount += 1
      intrinsicReadPhaseCount += 1
      compensatedWritePhaseCount += 1
      finalReadPhaseCount += 1
    },

    recordCandidateMeasurement(job): void {
      const current = candidateMeasurements.get(job.passId)
      if (current) {
        current.count += 1
        return
      }

      candidateMeasurements.set(job.passId, {
        instanceId: job.instanceId,
        passId: job.passId,
        count: 1,
      })
    },

    recordDiscardedJob(job, reason): void {
      discardedJobs.push(Object.freeze({
        instanceId: job.instanceId,
        passId: job.passId,
        reason,
      }))
    },

    snapshot(): AutofitSchedulerDiagnosticsSnapshot {
      return Object.freeze({
        lastFrameId,
        lastBatchId,
        frameCount,
        batchCount,
        intrinsicWritePhaseCount,
        intrinsicReadPhaseCount,
        compensatedWritePhaseCount,
        finalReadPhaseCount,
        discardedJobCount: discardedJobs.length,
        batches: Object.freeze(batches.map(freezeBatch)),
        candidateMeasurements: Object.freeze(
          [...candidateMeasurements.values()].map(freezeCandidateMeasurement),
        ),
        discardedJobs: Object.freeze(discardedJobs.map(freezeDiscardedJob)),
      })
    },

    reset(): void {
      batches = []
      discardedJobs = []
      candidateMeasurements = new Map()
      lastFrameId = 0
      lastBatchId = 0
      frameCount = 0
      batchCount = 0
      intrinsicWritePhaseCount = 0
      intrinsicReadPhaseCount = 0
      compensatedWritePhaseCount = 0
      finalReadPhaseCount = 0
    },
  }
}

export function isAutofitDebugBuild(): boolean {
  return import.meta.env.DEV || import.meta.env.MODE === 'test'
}

export function installAutofitDebugGlobal(
  target: object,
  diagnostics: Pick<AutofitSchedulerDiagnostics, 'snapshot' | 'reset'>,
  enabled = isAutofitDebugBuild(),
): () => void {
  if (!enabled)
    return () => {}

  const previousDescriptor = Object.getOwnPropertyDescriptor(target, DEBUG_GLOBAL_KEY)
  const api = Object.freeze({
    get snapshot(): AutofitSchedulerDiagnosticsSnapshot {
      return diagnostics.snapshot()
    },
    reset(): void {
      diagnostics.reset()
    },
  })

  Object.defineProperty(target, DEBUG_GLOBAL_KEY, {
    configurable: true,
    enumerable: false,
    value: api,
    writable: false,
  })

  let cleanedUp = false
  return (): void => {
    if (cleanedUp)
      return
    cleanedUp = true

    const installedValue = (target as Record<string, unknown>)[DEBUG_GLOBAL_KEY]
    if (installedValue !== api)
      return

    if (previousDescriptor)
      Object.defineProperty(target, DEBUG_GLOBAL_KEY, previousDescriptor)
    else
      Reflect.deleteProperty(target, DEBUG_GLOBAL_KEY)
  }
}
