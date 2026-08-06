import { createAutofitMeasurementScheduler } from './scheduler'
import type {
  AutofitFinalCandidateMeasurement,
  AutofitIntrinsicCandidateMeasurement,
  AutofitMeasuredVisualBoundaries,
  AutofitMeasurementJob,
  TierCandidate,
} from './types'

function requestAutofitDomFrame(callback: FrameRequestCallback): number {
  if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
    const testRequestFrame = (window as Window & {
      __slidevAutofitTestRequestFrame?: (callback: FrameRequestCallback) => number
    }).__slidevAutofitTestRequestFrame
    if (testRequestFrame)
      return testRequestFrame(callback)
  }
  return requestAnimationFrame(callback)
}

export interface AutofitDomMeasurementJob extends AutofitMeasurementJob {
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
}

function asDomJob(job: AutofitMeasurementJob): AutofitDomMeasurementJob {
  const candidate = job as Partial<AutofitDomMeasurementJob>
  if (
    typeof candidate.writeIntrinsicCandidate !== 'function'
    || typeof candidate.readIntrinsicCandidate !== 'function'
    || typeof candidate.writeCompensatedCandidate !== 'function'
    || typeof candidate.readFinalCandidate !== 'function'
  ) {
    throw new TypeError('autofit DOM scheduler requires browser measurement adapters')
  }

  return candidate as AutofitDomMeasurementJob
}

export const sharedAutofitDomScheduler = createAutofitMeasurementScheduler<
  AutofitMeasuredVisualBoundaries
>({
  requestFrame: callback => requestAutofitDomFrame(callback),
  cancelFrame: handle => cancelAnimationFrame(handle as number),
  writeIntrinsicCandidate: (job, candidate) => {
    asDomJob(job).writeIntrinsicCandidate(candidate)
  },
  readIntrinsicCandidate: (job, candidate) => {
    return asDomJob(job).readIntrinsicCandidate(candidate)
  },
  writeCompensatedCandidate: (job, candidate, intrinsic) => {
    asDomJob(job).writeCompensatedCandidate(candidate, intrinsic)
  },
  readFinalCandidate: (job, candidate, intrinsic) => {
    return asDomJob(job).readFinalCandidate(candidate, intrinsic)
  },
})

if (import.meta.env.DEV || import.meta.env.MODE === 'test') {
  const {
    createAutofitSchedulerDiagnostics,
    installAutofitDebugGlobal,
  } = await import('./debug')
  const diagnostics = createAutofitSchedulerDiagnostics()
  sharedAutofitDomScheduler.setDiagnostics(diagnostics)

  if (typeof window !== 'undefined') {
    const cleanupDebugGlobal = installAutofitDebugGlobal(
      window,
      diagnostics,
      true,
    )
    import.meta.hot?.dispose(cleanupDebugGlobal)
  }
}

let nextAutofitInstanceId = 1

export function createAutofitInstanceId(): string {
  const id = nextAutofitInstanceId
  nextAutofitInstanceId += 1
  return `autofit-${id}`
}
