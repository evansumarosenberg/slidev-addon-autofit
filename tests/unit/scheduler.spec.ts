import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_AUTOFIT_CONFIG } from '../../utils/autofit/config'
import {
  createAutofitSchedulerDiagnostics,
  installAutofitDebugGlobal,
} from '../../utils/autofit/debug'
import { createAutofitMeasurementScheduler } from '../../utils/autofit/scheduler'
import type {
  AutofitFinalCandidateMeasurement,
  AutofitIntrinsicCandidateMeasurement,
  AutofitMeasurementFinish,
  AutofitMeasurementJob,
  AutofitMeasurementJobHandle,
  AutofitUnsupportedReason,
} from '../../utils/autofit/types'

type FrameCallback = (timestamp: number) => void

class FakeFrameClock {
  readonly #callbacks = new Map<number, FrameCallback>()
  #nextFrameId = 1

  readonly request = (callback: FrameCallback): number => {
    const frameId = this.#nextFrameId
    this.#nextFrameId += 1
    this.#callbacks.set(frameId, callback)
    return frameId
  }

  readonly cancel = (frameId: unknown): void => {
    this.#callbacks.delete(frameId as number)
  }

  get pendingCount(): number {
    return this.#callbacks.size
  }

  flushNext(): void {
    const next = this.#callbacks.entries().next()
    if (next.done)
      throw new Error('no animation frame is pending')

    const [frameId, callback] = next.value
    this.#callbacks.delete(frameId)
    callback(frameId * 16)
  }

  flushAll(limit = 100): void {
    let count = 0
    while (this.#callbacks.size > 0) {
      if (count >= limit)
        throw new Error('animation-frame work did not settle')
      count += 1
      this.flushNext()
    }
  }
}

interface FakeJob extends AutofitMeasurementJob {
  readonly finishes: AutofitMeasurementFinish[]
}

function createJob(
  instanceId: string,
  config: AutofitMeasurementJob['config'] = DEFAULT_AUTOFIT_CONFIG,
): FakeJob {
  const finishes: AutofitMeasurementFinish[] = []
  return {
    instanceId,
    config,
    finishes,
    finish: result => finishes.push(result),
  }
}

function oneCandidateJob(instanceId: string): FakeJob {
  return createJob(instanceId, {
    ...DEFAULT_AUTOFIT_CONFIG,
    largeTiers: 0,
    smallTiers: 0,
  })
}

function fixedCandidateJob(instanceId: string, fixedTier: number): FakeJob {
  return {
    ...createJob(instanceId),
    fixedTier,
  }
}

function measuredIntrinsic<T>(payload: T): AutofitIntrinsicCandidateMeasurement<T> {
  return { status: 'measured', payload }
}

function measuredFinal(fits: boolean): AutofitFinalCandidateMeasurement {
  return { status: 'measured', fits }
}

function terminal(job: FakeJob): AutofitMeasurementFinish {
  expect(job.finishes).toHaveLength(1)
  return job.finishes[0]
}

describe('shared four-subphase measurement scheduler', () => {
  it('measures one caller-selected candidate through the shared four-phase pipeline', () => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const diagnostics = createAutofitSchedulerDiagnostics()
    const fixed = fixedCandidateJob('fixed', -2)
    const ordinary = oneCandidateJob('ordinary')
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: (job, candidate) => {
        events.push(`intrinsic-write:${job.instanceId}:${candidate.index}`)
      },
      readIntrinsicCandidate: (job, candidate) => {
        events.push(`intrinsic-read:${job.instanceId}:${candidate.index}`)
        return measuredIntrinsic(job.instanceId)
      },
      writeCompensatedCandidate: (job, candidate) => {
        events.push(`compensated-write:${job.instanceId}:${candidate.index}`)
      },
      readFinalCandidate: (job, candidate) => {
        events.push(`final-read:${job.instanceId}:${candidate.index}`)
        return measuredFinal(candidate.index !== -2)
      },
      diagnostics,
    })

    scheduler.request(fixed)
    scheduler.request(ordinary)
    clock.flushAll()

    expect(events).toEqual([
      'intrinsic-write:fixed:-2',
      'intrinsic-write:ordinary:0',
      'intrinsic-read:fixed:-2',
      'intrinsic-read:ordinary:0',
      'compensated-write:fixed:-2',
      'compensated-write:ordinary:0',
      'final-read:fixed:-2',
      'final-read:ordinary:0',
    ])
    expect(terminal(fixed)).toMatchObject({
      status: 'completed',
      candidateMeasurementCount: 1,
      result: {
        tier: -2,
        scale: 0.8,
        fits: false,
        overflow: true,
        measurementCount: 1,
      },
    })
    expect(terminal(ordinary)).toMatchObject({
      status: 'completed',
      candidateMeasurementCount: 1,
      result: { tier: 0, measurementCount: 1 },
    })
    const snapshot = diagnostics.snapshot()
    expect(snapshot.batches).toHaveLength(1)
    expect(snapshot.batches[0]).toMatchObject({
      jobs: [
        { instanceId: 'fixed' },
        { instanceId: 'ordinary' },
      ],
      intrinsicWritePhaseCount: 1,
      intrinsicReadPhaseCount: 1,
      compensatedWritePhaseCount: 1,
      finalReadPhaseCount: 1,
    })
    expect(snapshot.candidateMeasurements).toEqual([
      expect.objectContaining({ instanceId: 'fixed', count: 1 }),
      expect.objectContaining({ instanceId: 'ordinary', count: 1 }),
    ])
  })

  it.each([
    {
      status: 'deferred' as const,
      phase: 'intrinsic' as const,
      intrinsic: { status: 'deferred' as const, reason: 'no-measurable-host' as const },
    },
    {
      status: 'unsupported' as const,
      phase: 'intrinsic' as const,
      intrinsic: {
        status: 'unsupported' as const,
        reason: 'visual-edge-nonfinite' as AutofitUnsupportedReason,
      },
    },
    {
      status: 'deferred' as const,
      phase: 'final' as const,
      final: { status: 'deferred' as const, reason: 'invalid-host-scale' as const },
    },
    {
      status: 'unsupported' as const,
      phase: 'final' as const,
      final: {
        status: 'unsupported' as const,
        reason: 'visual-edge-nonfinite' as AutofitUnsupportedReason,
      },
    },
  ])('preserves typed $status $phase outcomes for a fixed candidate', ({
    status,
    phase,
    intrinsic,
    final,
  }) => {
    const clock = new FakeFrameClock()
    const fixed = fixedCandidateJob('fixed', 3)
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: () => intrinsic ?? measuredIntrinsic('intrinsic'),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: () => final ?? measuredFinal(true),
    })

    scheduler.request(fixed)
    clock.flushAll()

    expect(terminal(fixed)).toMatchObject({
      status,
      phase,
      candidateMeasurementCount: 0,
    })
  })

  it('cancels and supersedes fixed-candidate jobs without measuring stale work', () => {
    const clock = new FakeFrameClock()
    const cancelled = fixedCandidateJob('cancelled', -4)
    const original = fixedCandidateJob('fixed', -3)
    const replacement = fixedCandidateJob('fixed', 2)
    const candidates: number[] = []
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: (_job, candidate) => candidates.push(candidate.index),
      readIntrinsicCandidate: () => measuredIntrinsic('intrinsic'),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: () => measuredFinal(true),
    })

    const cancelledHandle = scheduler.request(cancelled)
    cancelledHandle.cancel()
    scheduler.request(original)
    scheduler.request(replacement)
    clock.flushAll()

    expect(terminal(cancelled)).toMatchObject({
      status: 'discarded',
      reason: 'cancelled',
      candidateMeasurementCount: 0,
    })
    expect(terminal(original)).toMatchObject({
      status: 'discarded',
      reason: 'superseded',
      candidateMeasurementCount: 0,
    })
    expect(candidates).toEqual([2])
    expect(terminal(replacement)).toMatchObject({
      status: 'completed',
      result: { tier: 2, measurementCount: 1 },
    })
  })

  it('coalesces duplicate requests for one instance into one pass', () => {
    const clock = new FakeFrameClock()
    const candidates: number[] = []
    const job = createJob('alpha')
    const scheduler = createAutofitMeasurementScheduler<number>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: (_job, candidate) =>
        measuredIntrinsic(candidate.index),
      writeCompensatedCandidate: (_job, candidate, intrinsic) => {
        expect(intrinsic).toBe(candidate.index)
        candidates.push(candidate.index)
      },
      readFinalCandidate: (_job, candidate) =>
        measuredFinal(candidate.index <= 0),
    })

    const first = scheduler.request(job)
    const duplicate = scheduler.request(job)
    expect(duplicate).toBe(first)
    expect(clock.pendingCount).toBe(1)

    clock.flushAll()

    expect(candidates).toEqual([0, 2, 1])
    expect(terminal(job)).toMatchObject({
      status: 'completed',
      passId: first.passId,
      candidateMeasurementCount: 3,
      result: { tier: 0, overflow: false, measurementCount: 3 },
    })
  })

  it('orders all jobs through the four shared subphases', () => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const alpha = oneCandidateJob('alpha')
    const beta = oneCandidateJob('beta')
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: (job, candidate) => {
        events.push(`intrinsic-write:${job.instanceId}:${candidate.index}`)
      },
      readIntrinsicCandidate: (job, candidate) => {
        events.push(`intrinsic-read:${job.instanceId}:${candidate.index}`)
        return measuredIntrinsic(`${job.instanceId}:${candidate.index}`)
      },
      writeCompensatedCandidate: (job, candidate, intrinsic) => {
        events.push(`compensated-write:${job.instanceId}:${candidate.index}:${intrinsic}`)
      },
      readFinalCandidate: (job, candidate, intrinsic) => {
        events.push(`final-read:${job.instanceId}:${candidate.index}:${intrinsic}`)
        return measuredFinal(true)
      },
    })

    scheduler.request(alpha)
    scheduler.request(beta)
    clock.flushAll()

    expect(events).toEqual([
      'intrinsic-write:alpha:0',
      'intrinsic-write:beta:0',
      'intrinsic-read:alpha:0',
      'intrinsic-read:beta:0',
      'compensated-write:alpha:0:alpha:0',
      'compensated-write:beta:0:beta:0',
      'final-read:alpha:0:alpha:0',
      'final-read:beta:0:beta:0',
    ])
    expect(terminal(alpha).status).toBe('completed')
    expect(terminal(beta).status).toBe('completed')
  })

  it('defers owner finish/restoration writes until every intrinsic read completes', () => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const deferred = oneCandidateJob('deferred')
    const neighbor = oneCandidateJob('neighbor')
    deferred.finish = (result) => {
      events.push(`finish:${result.status}:deferred`)
      events.push('restore:deferred')
      deferred.finishes.push(result)
    }
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: job => events.push(`intrinsic-write:${job.instanceId}`),
      readIntrinsicCandidate: (job) => {
        events.push(`intrinsic-read:${job.instanceId}`)
        return job === deferred
          ? {
              status: 'deferred',
              reason: 'no-measurable-host',
            }
          : measuredIntrinsic('neighbor')
      },
      writeCompensatedCandidate: job => events.push(`compensated-write:${job.instanceId}`),
      readFinalCandidate: job => {
        events.push(`final-read:${job.instanceId}`)
        return measuredFinal(true)
      },
    })

    scheduler.request(deferred)
    scheduler.request(neighbor)
    clock.flushAll()

    expect(events.slice(0, 8)).toEqual([
      'intrinsic-write:deferred',
      'intrinsic-write:neighbor',
      'intrinsic-read:deferred',
      'intrinsic-read:neighbor',
      'finish:deferred:deferred',
      'restore:deferred',
      'compensated-write:neighbor',
      'final-read:neighbor',
    ])
    expect(terminal(deferred)).toMatchObject({
      status: 'deferred',
      phase: 'intrinsic',
    })
  })

  it('defers completed, deferred, and unsupported owner writes until every final read completes', () => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const completed = oneCandidateJob('completed')
    const deferred = oneCandidateJob('deferred')
    const unsupported = oneCandidateJob('unsupported')
    for (const job of [completed, deferred, unsupported]) {
      job.finish = (result) => {
        events.push(`finish:${result.status}:${job.instanceId}`)
        events.push(`restore:${job.instanceId}`)
        job.finishes.push(result)
      }
    }
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: job => measuredIntrinsic(job.instanceId),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: (job) => {
        events.push(`final-read:${job.instanceId}`)
        if (job === deferred) {
          return {
            status: 'deferred',
            reason: 'invalid-host-scale',
          }
        }
        if (job === unsupported) {
          return {
            status: 'unsupported',
            reason: 'visual-edge-nonfinite',
          }
        }
        return measuredFinal(true)
      },
    })

    scheduler.request(completed)
    scheduler.request(deferred)
    scheduler.request(unsupported)
    clock.flushAll()

    expect(events).toEqual([
      'final-read:completed',
      'final-read:deferred',
      'final-read:unsupported',
      'finish:completed:completed',
      'restore:completed',
      'finish:deferred:deferred',
      'restore:deferred',
      'finish:unsupported:unsupported',
      'restore:unsupported',
    ])
  })

  it('defers cancellation and supersession finish writes to their read-phase boundary', () => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const superseded = oneCandidateJob('superseded-instance')
    const intrinsicController = oneCandidateJob('intrinsic-controller')
    const replacement = oneCandidateJob('superseded-instance')
    const finalController = oneCandidateJob('final-controller')
    const cancelled = oneCandidateJob('cancelled')
    const finalNeighbor = oneCandidateJob('final-neighbor')
    for (const job of [
      superseded,
      replacement,
      finalController,
      cancelled,
      finalNeighbor,
    ]) {
      job.finish = (result) => {
        events.push(`finish:${result.status}:${job.instanceId}`)
        events.push(`restore:${job.instanceId}`)
        job.finishes.push(result)
      }
    }

    let scheduler: ReturnType<typeof createAutofitMeasurementScheduler<string>>
    let cancelledHandle: AutofitMeasurementJobHandle
    scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: (job) => {
        events.push(`intrinsic-read:${job.instanceId}`)
        if (job === intrinsicController)
          scheduler.request(replacement)
        return measuredIntrinsic(job.instanceId)
      },
      writeCompensatedCandidate: () => {},
      readFinalCandidate: (job) => {
        events.push(`final-read:${job.instanceId}`)
        if (job === finalController)
          cancelledHandle.cancel()
        return measuredFinal(true)
      },
    })

    scheduler.request(superseded)
    scheduler.request(intrinsicController)
    scheduler.request(finalController)
    cancelledHandle = scheduler.request(cancelled)
    scheduler.request(finalNeighbor)
    clock.flushNext()

    expect(events.indexOf('finish:discarded:superseded-instance'))
      .toBeGreaterThan(events.indexOf('intrinsic-read:final-neighbor'))
    expect(events.indexOf('restore:superseded-instance'))
      .toBeGreaterThan(events.indexOf('intrinsic-read:final-neighbor'))
    expect(events.indexOf('finish:discarded:cancelled'))
      .toBeGreaterThan(events.indexOf('final-read:final-neighbor'))
    expect(events.indexOf('restore:cancelled'))
      .toBeGreaterThan(events.indexOf('final-read:final-neighbor'))

    clock.flushAll()
    expect(terminal(superseded)).toMatchObject({
      status: 'discarded',
      reason: 'superseded',
    })
    expect(terminal(cancelled)).toMatchObject({
      status: 'discarded',
      reason: 'cancelled',
    })
  })

  it.each([
    {
      action: 'cancel' as const,
      writePhase: 'intrinsic' as const,
    },
    {
      action: 'supersede' as const,
      writePhase: 'intrinsic' as const,
    },
    {
      action: 'cancel' as const,
      writePhase: 'compensated' as const,
    },
    {
      action: 'supersede' as const,
      writePhase: 'compensated' as const,
    },
  ])('restores after all $writePhase writes and before reads on $action', ({
    action,
    writePhase,
  }) => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const victim = oneCandidateJob('write-phase-victim')
    const controller = oneCandidateJob('write-phase-controller')
    const neighbor = oneCandidateJob('write-phase-neighbor')
    const replacement = oneCandidateJob('write-phase-victim')
    victim.finish = (result) => {
      events.push(`finish:${result.status}:victim`)
      events.push('restore:victim')
      victim.finishes.push(result)
    }
    let scheduler: ReturnType<typeof createAutofitMeasurementScheduler<string>>
    let victimHandle: AutofitMeasurementJobHandle
    let replacementHandle: AutofitMeasurementJobHandle | undefined
    const terminateVictim = (): void => {
      if (action === 'cancel')
        victimHandle.cancel()
      else
        replacementHandle = scheduler.request(replacement)
    }
    scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: (job) => {
        events.push(`intrinsic-write:${job.instanceId}`)
        if (writePhase === 'intrinsic' && job === controller)
          terminateVictim()
      },
      readIntrinsicCandidate: (job) => {
        events.push(`intrinsic-read:${job.instanceId}`)
        return measuredIntrinsic(job.instanceId)
      },
      writeCompensatedCandidate: (job) => {
        events.push(`compensated-write:${job.instanceId}`)
        if (writePhase === 'compensated' && job === controller)
          terminateVictim()
      },
      readFinalCandidate: (job) => {
        events.push(`final-read:${job.instanceId}`)
        return measuredFinal(true)
      },
    })

    victimHandle = scheduler.request(victim)
    scheduler.request(controller)
    scheduler.request(neighbor)
    clock.flushNext()

    const writePrefix = `${writePhase}-write:`
    const readPrefix = writePhase === 'intrinsic'
      ? 'intrinsic-read:'
      : 'final-read:'
    const phaseEvents = events.filter(event =>
      event.startsWith(writePrefix)
      || event.startsWith(readPrefix)
      || event.endsWith(':victim'),
    )
    expect(phaseEvents).toEqual([
      `${writePrefix}write-phase-victim`,
      `${writePrefix}write-phase-controller`,
      `${writePrefix}write-phase-neighbor`,
      'finish:discarded:victim',
      'restore:victim',
      `${readPrefix}write-phase-controller`,
      `${readPrefix}write-phase-neighbor`,
    ])

    clock.flushAll()
    expect(terminal(victim)).toMatchObject({
      status: 'discarded',
      reason: action === 'cancel' ? 'cancelled' : 'superseded',
    })
    expect(victimHandle.active).toBe(false)
    if (action === 'supersede') {
      expect(replacementHandle?.active).toBe(false)
      expect(terminal(replacement).status).toBe('completed')
    }
  })

  it('keeps same-instance reentrant replacement handles owned and terminal', () => {
    const clock = new FakeFrameClock()
    const original = oneCandidateJob('reentrant')
    const outerReplacement = oneCandidateJob('reentrant')
    const nestedReplacement = oneCandidateJob('reentrant')
    let nestedHandle: AutofitMeasurementJobHandle | undefined
    let scheduler: ReturnType<typeof createAutofitMeasurementScheduler<string>>
    const originalFinish = original.finish
    original.finish = (result) => {
      originalFinish(result)
      nestedHandle = scheduler.request(nestedReplacement)
    }
    scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: () => measuredIntrinsic('intrinsic'),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: () => measuredFinal(true),
    })

    const originalHandle = scheduler.request(original)
    const outerHandle = scheduler.request(outerReplacement)
    clock.flushAll()

    expect(nestedHandle).toBeDefined()
    expect(originalHandle.active).toBe(false)
    expect(outerHandle.active).toBe(false)
    expect(nestedHandle!.active).toBe(false)
    expect(terminal(original)).toMatchObject({
      status: 'discarded',
      reason: 'superseded',
    })
    expect(terminal(outerReplacement)).toMatchObject({
      status: 'discarded',
      reason: 'superseded',
    })
    expect(terminal(nestedReplacement).status).toBe('completed')
  })

  it.each([
    {
      status: 'deferred' as const,
      outcome: {
        status: 'deferred' as const,
        reason: 'no-measurable-host' as const,
      },
    },
    {
      status: 'unsupported' as const,
      outcome: {
        status: 'unsupported' as const,
        reason: 'visual-rect-missing' as AutofitUnsupportedReason,
      },
    },
  ])('ends only the affected job after a $status intrinsic read', ({
    status,
    outcome,
  }) => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const stopped = oneCandidateJob('stopped')
    const neighbor = oneCandidateJob('neighbor')
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: job => events.push(`intrinsic-write:${job.instanceId}`),
      readIntrinsicCandidate: (job) => {
        events.push(`intrinsic-read:${job.instanceId}`)
        return job.instanceId === 'stopped'
          ? outcome
          : measuredIntrinsic('neighbor-intrinsic')
      },
      writeCompensatedCandidate: job => events.push(`compensated-write:${job.instanceId}`),
      readFinalCandidate: job => {
        events.push(`final-read:${job.instanceId}`)
        return measuredFinal(true)
      },
    })

    scheduler.request(stopped)
    scheduler.request(neighbor)
    clock.flushAll()

    expect(events).not.toContain('compensated-write:stopped')
    expect(events).not.toContain('final-read:stopped')
    expect(events).toContain('compensated-write:neighbor')
    expect(events).toContain('final-read:neighbor')
    expect(terminal(stopped)).toMatchObject({
      status,
      phase: 'intrinsic',
      candidateMeasurementCount: 0,
    })
    expect(terminal(neighbor)).toMatchObject({
      status: 'completed',
      candidateMeasurementCount: 1,
    })
  })

  it.each([
    {
      status: 'deferred' as const,
      outcome: {
        status: 'deferred' as const,
        reason: 'invalid-host-scale' as const,
      },
    },
    {
      status: 'unsupported' as const,
      outcome: {
        status: 'unsupported' as const,
        reason: 'visual-edge-nonfinite' as AutofitUnsupportedReason,
      },
    },
  ])('ends only the affected job after a $status final read', ({
    status,
    outcome,
  }) => {
    const clock = new FakeFrameClock()
    const stopped = oneCandidateJob('stopped')
    const neighbor = oneCandidateJob('neighbor')
    const diagnostics = createAutofitSchedulerDiagnostics()
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: job => measuredIntrinsic(job.instanceId),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: job =>
        job.instanceId === 'stopped' ? outcome : measuredFinal(true),
      diagnostics,
    })

    scheduler.request(stopped)
    scheduler.request(neighbor)
    clock.flushAll()

    expect(terminal(stopped)).toMatchObject({
      status,
      phase: 'final',
      candidateMeasurementCount: 0,
    })
    expect(terminal(neighbor)).toMatchObject({
      status: 'completed',
      candidateMeasurementCount: 1,
    })
    expect(diagnostics.snapshot().candidateMeasurements).toEqual([
      expect.objectContaining({ instanceId: 'neighbor', count: 1 }),
    ])
  })

  it('restores retained presentations between rounds only after all final reads', () => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const alpha = createJob('alpha')
    const beta = createJob('beta')
    alpha.restore = () => events.push('restore:alpha')
    beta.restore = () => events.push('restore:beta')
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: job => events.push(`intrinsic-write:${job.instanceId}`),
      readIntrinsicCandidate: job => {
        events.push(`intrinsic-read:${job.instanceId}`)
        return measuredIntrinsic(job.instanceId)
      },
      writeCompensatedCandidate: job => events.push(`compensated-write:${job.instanceId}`),
      readFinalCandidate: job => {
        events.push(`final-read:${job.instanceId}`)
        return measuredFinal(false)
      },
    })

    scheduler.request(alpha)
    scheduler.request(beta)
    clock.flushNext()

    expect(events.slice(-4)).toEqual([
      'final-read:alpha',
      'final-read:beta',
      'restore:alpha',
      'restore:beta',
    ])
    expect(alpha.finishes).toEqual([])
    expect(beta.finishes).toEqual([])
  })

  it('leaves terminal restoration to the exactly-once finish callback', () => {
    const clock = new FakeFrameClock()
    const job = oneCandidateJob('terminal-restoration')
    let intermediateRestorations = 0
    let terminalRestorations = 0
    job.restore = () => {
      intermediateRestorations += 1
    }
    job.finish = (result) => {
      terminalRestorations += 1
      job.finishes.push(result)
    }
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: () => measuredIntrinsic('intrinsic'),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: () => ({
        status: 'deferred',
        reason: 'no-measurable-host',
      }),
    })

    scheduler.request(job)
    clock.flushAll()

    expect(intermediateRestorations).toBe(0)
    expect(terminalRestorations).toBe(1)
    expect(terminal(job)).toMatchObject({
      status: 'deferred',
      phase: 'final',
    })
  })

  it.each([
    'intrinsic-write',
    'intrinsic-read',
    'compensated-write',
    'final-read',
  ] as const)('honors cancellation during the %s subphase', (cancelPhase) => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const job = oneCandidateJob(`cancel-${cancelPhase}`)
    let handle: AutofitMeasurementJobHandle
    const cancel = (phase: typeof cancelPhase): void => {
      events.push(phase)
      if (phase === cancelPhase) {
        handle.cancel()
        handle.cancel()
      }
    }
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => cancel('intrinsic-write'),
      readIntrinsicCandidate: () => {
        cancel('intrinsic-read')
        return measuredIntrinsic('intrinsic')
      },
      writeCompensatedCandidate: () => cancel('compensated-write'),
      readFinalCandidate: () => {
        cancel('final-read')
        return measuredFinal(true)
      },
    })

    handle = scheduler.request(job)
    clock.flushAll()

    expect(terminal(job)).toMatchObject({
      status: 'discarded',
      reason: 'cancelled',
      candidateMeasurementCount: 0,
    })
    expect(events.at(-1)).toBe(cancelPhase)
  })

  it.each([
    'intrinsic-write',
    'intrinsic-read',
    'compensated-write',
    'final-read',
  ] as const)('prevents a neighboring job from entering %s after cancellation', (
    cancelPhase,
  ) => {
    const clock = new FakeFrameClock()
    const events: string[] = []
    const controller = oneCandidateJob('controller')
    const cancelled = oneCandidateJob('cancelled')
    let cancelledHandle: AutofitMeasurementJobHandle
    const visit = (phase: typeof cancelPhase, job: AutofitMeasurementJob): void => {
      events.push(`${phase}:${job.instanceId}`)
      if (job.instanceId === 'controller' && phase === cancelPhase)
        cancelledHandle.cancel()
    }
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: job => visit('intrinsic-write', job),
      readIntrinsicCandidate: job => {
        visit('intrinsic-read', job)
        return measuredIntrinsic(job.instanceId)
      },
      writeCompensatedCandidate: job => visit('compensated-write', job),
      readFinalCandidate: job => {
        visit('final-read', job)
        return measuredFinal(true)
      },
    })

    scheduler.request(controller)
    cancelledHandle = scheduler.request(cancelled)
    clock.flushAll()

    expect(events).not.toContain(`${cancelPhase}:cancelled`)
    expect(terminal(cancelled)).toMatchObject({
      status: 'discarded',
      reason: 'cancelled',
    })
    expect(terminal(controller).status).toBe('completed')
  })

  it.each([
    'intrinsic-write',
    'intrinsic-read',
    'compensated-write',
    'final-read',
  ] as const)('supersedes safely during the %s subphase', (supersedePhase) => {
    const clock = new FakeFrameClock()
    const original = oneCandidateJob('same-instance')
    const replacement = oneCandidateJob('same-instance')
    let replacementRequested = false
    let scheduler: ReturnType<typeof createAutofitMeasurementScheduler<string>>
    const supersede = (phase: typeof supersedePhase): void => {
      if (!replacementRequested && phase === supersedePhase) {
        replacementRequested = true
        scheduler.request(replacement)
      }
    }

    scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: job => {
        if (job === original)
          supersede('intrinsic-write')
      },
      readIntrinsicCandidate: job => {
        if (job === original)
          supersede('intrinsic-read')
        return measuredIntrinsic('intrinsic')
      },
      writeCompensatedCandidate: job => {
        if (job === original)
          supersede('compensated-write')
      },
      readFinalCandidate: job => {
        if (job === original)
          supersede('final-read')
        return measuredFinal(true)
      },
    })

    scheduler.request(original)
    clock.flushAll()

    expect(terminal(original)).toMatchObject({
      status: 'discarded',
      reason: 'superseded',
      candidateMeasurementCount: 0,
    })
    expect(terminal(replacement)).toMatchObject({
      status: 'completed',
      candidateMeasurementCount: 1,
    })
  })

  it('provides idempotent instance and scheduler cleanup with one finish each', () => {
    const clock = new FakeFrameClock()
    const alpha = oneCandidateJob('alpha')
    const beta = oneCandidateJob('beta')
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: () => measuredIntrinsic('intrinsic'),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: () => measuredFinal(true),
    })

    scheduler.request(alpha)
    scheduler.request(beta)
    scheduler.cancel('alpha')
    scheduler.cancel('alpha')
    scheduler.dispose()
    scheduler.dispose()
    clock.flushAll()

    expect(terminal(alpha)).toMatchObject({ status: 'discarded', reason: 'cancelled' })
    expect(terminal(beta)).toMatchObject({ status: 'discarded', reason: 'cancelled' })
    expect(clock.pendingCount).toBe(0)
    expect(() => scheduler.request(oneCandidateJob('after-dispose'))).toThrow(/disposed/i)
  })

  it('never exceeds four successfully measured final reads for a default pass', () => {
    const predicates = [
      (tier: number) => tier <= 4,
      (tier: number) => tier <= 3,
      (tier: number) => tier <= 0,
      (tier: number) => tier <= -1,
      (tier: number) => tier <= -4,
      () => false,
    ]

    for (const [index, fits] of predicates.entries()) {
      const clock = new FakeFrameClock()
      const job = createJob(`job-${index}`)
      let finalReads = 0
      const scheduler = createAutofitMeasurementScheduler<number>({
        requestFrame: clock.request,
        cancelFrame: clock.cancel,
        writeIntrinsicCandidate: () => {},
        readIntrinsicCandidate: (_job, candidate) =>
          measuredIntrinsic(candidate.index),
        writeCompensatedCandidate: () => {},
        readFinalCandidate: (_job, candidate) => {
          finalReads += 1
          return measuredFinal(fits(candidate.index))
        },
      })

      scheduler.request(job)
      clock.flushAll()
      expect(finalReads).toBeLessThanOrEqual(4)
      expect(terminal(job)).toMatchObject({
        status: 'completed',
        candidateMeasurementCount: finalReads,
      })
    }
  })

  it('records immutable four-phase, measurement, and discard diagnostics', () => {
    const clock = new FakeFrameClock()
    const diagnostics = createAutofitSchedulerDiagnostics()
    const stale = oneCandidateJob('alpha')
    const alpha = oneCandidateJob('alpha')
    const beta = oneCandidateJob('beta')
    const scheduler = createAutofitMeasurementScheduler<string>({
      requestFrame: clock.request,
      cancelFrame: clock.cancel,
      writeIntrinsicCandidate: () => {},
      readIntrinsicCandidate: job => measuredIntrinsic(job.instanceId),
      writeCompensatedCandidate: () => {},
      readFinalCandidate: () => measuredFinal(true),
      diagnostics,
    })

    scheduler.request(stale)
    const alphaHandle = scheduler.request(alpha)
    const betaHandle = scheduler.request(beta)
    clock.flushAll()

    const snapshot = diagnostics.snapshot()
    expect(snapshot).toMatchObject({
      lastFrameId: 1,
      lastBatchId: 1,
      frameCount: 1,
      batchCount: 1,
      intrinsicWritePhaseCount: 1,
      intrinsicReadPhaseCount: 1,
      compensatedWritePhaseCount: 1,
      finalReadPhaseCount: 1,
      discardedJobCount: 1,
    })
    expect(snapshot.batches[0]).toMatchObject({
      jobs: [
        { instanceId: 'alpha', passId: alphaHandle.passId },
        { instanceId: 'beta', passId: betaHandle.passId },
      ],
      intrinsicWritePhaseCount: 1,
      intrinsicReadPhaseCount: 1,
      compensatedWritePhaseCount: 1,
      finalReadPhaseCount: 1,
    })
    expect(snapshot.candidateMeasurements).toEqual([
      { instanceId: 'alpha', passId: alphaHandle.passId, count: 1 },
      { instanceId: 'beta', passId: betaHandle.passId, count: 1 },
    ])
    expect(snapshot.discardedJobs).toEqual([
      {
        instanceId: 'alpha',
        passId: terminal(stale).passId,
        reason: 'superseded',
      },
    ])
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.batches)).toBe(true)
    expect(snapshot.batches.every(Object.isFrozen)).toBe(true)
    expect(snapshot.batches.every(batch => Object.isFrozen(batch.jobs))).toBe(true)
    expect(Object.isFrozen(snapshot.candidateMeasurements)).toBe(true)
    expect(snapshot.candidateMeasurements.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(snapshot.discardedJobs)).toBe(true)
    expect(snapshot.discardedJobs.every(Object.isFrozen)).toBe(true)
  })
})

describe('development/test diagnostics exposure', () => {
  it('installs a read-only live snapshot with reset and idempotent cleanup', () => {
    const diagnostics = createAutofitSchedulerDiagnostics()
    const target: Record<string, unknown> = {}
    const cleanup = installAutofitDebugGlobal(target, diagnostics, true)
    const api = target.__slidevAutofitDebug as {
      readonly snapshot: { readonly batchCount: number }
      reset(): void
    }

    expect(api).toBeDefined()
    expect(Object.isFrozen(api)).toBe(true)
    expect(api.snapshot.batchCount).toBe(0)
    expect(() => {
      Object.assign(api, { snapshot: null })
    }).toThrow()

    diagnostics.recordBatch({
      frameId: 1,
      batchId: 1,
      jobs: [],
    })
    expect(api.snapshot.batchCount).toBe(1)

    api.reset()
    expect(api.snapshot.batchCount).toBe(0)

    cleanup()
    cleanup()
    expect(target).not.toHaveProperty('__slidevAutofitDebug')
  })

  it('does not expose a production global when diagnostics are disabled', () => {
    const target: Record<string, unknown> = {}
    const cleanup = installAutofitDebugGlobal(
      target,
      createAutofitSchedulerDiagnostics(),
      false,
    )

    expect(target).not.toHaveProperty('__slidevAutofitDebug')
    expect(vi.fn(cleanup)).not.toThrow()
  })
})
