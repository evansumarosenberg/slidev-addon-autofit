import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  waitForAnimationFrames,
  waitForAutofitLifecycleIdle,
  waitForAutofitPublication,
  waitForPageAssets,
} from './helpers/autofit-settle'

async function holdFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const frames: FrameRequestCallback[] = []
    Object.assign(window, {
      __autofitCoordinationFrames: frames,
      __slidevAutofitTestRequestFrame: (callback: FrameRequestCallback): number => {
        frames.push(callback)
        return 910_000 + frames.length
      },
    })
  })
}

async function releaseOneFrame(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const target = window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }
    const callback = target.__autofitCoordinationFrames?.shift()
    if (!callback)
      throw new Error('expected a held coordination frame')
    callback(performance.now())
    await new Promise<void>(resolve => queueMicrotask(resolve))
  })
}

async function releaseHeldFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const target = window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }
    const callbacks = target.__autofitCoordinationFrames?.splice(0) ?? []
    if (callbacks.length === 0)
      throw new Error('expected held coordination frames')
    for (const callback of callbacks)
      callback(performance.now())
    await new Promise<void>(resolve => queueMicrotask(resolve))
  })
}

interface CachedCommonTierNonFitSnapshot {
  readonly batchCount: number
  readonly candidateMeasurements: number[]
  readonly discardedJobs: string[]
  readonly cachedNonFitCalls: number
}

async function cachedCommonTierNonFitSnapshot(
  page: Page,
): Promise<CachedCommonTierNonFitSnapshot> {
  return page.evaluate(() => {
    const target = window as typeof window & {
      __autofitCachedCommonTierNonFitCalls?: number
      __slidevAutofitDebug?: {
        readonly snapshot: {
          readonly batchCount: number
          readonly candidateMeasurements: readonly { readonly count: number }[]
          readonly discardedJobs: readonly { readonly reason: string }[]
        }
      }
    }
    const debug = target.__slidevAutofitDebug
    if (!debug)
      throw new Error('expected development autofit diagnostics')
    return {
      batchCount: debug.snapshot.batchCount,
      candidateMeasurements: debug.snapshot.candidateMeasurements
        .map(({ count }) => count)
        .sort((left, right) => left - right),
      discardedJobs: debug.snapshot.discardedJobs.map(({ reason }) => reason),
      cachedNonFitCalls: target.__autofitCachedCommonTierNonFitCalls ?? 0,
    }
  })
}

async function restoreFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
      __slidevAutofitTestRequestFrame?: unknown
    }
    delete target.__slidevAutofitTestRequestFrame
    for (const callback of target.__autofitCoordinationFrames?.splice(0) ?? [])
      callback(performance.now())
  })
}

type AutoColumnBarrier = 'local-common' | 'target-synchronization'

interface HeldAutoColumnBarrier {
  readonly barrier: AutoColumnBarrier
  readonly role: 'left' | 'right'
  readonly epoch: number
}

async function installAutoColumnBarrierHolds(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Barrier = 'local-common' | 'target-synchronization'
    type Held = {
      readonly barrier: Barrier
      readonly role: 'left' | 'right'
      readonly epoch: number
      readonly callback: () => void
    }
    const target = window as typeof window & {
      __autofitCoordinationHeldBarriers?: Held[]
      __autofitCoordinationBarrierDispatches?: Array<{
        readonly barrier: Barrier
        readonly role: 'left' | 'right'
        readonly epoch: number
      }>
      __autofitCoordinationLocalPresentations?: Array<{
        readonly role: 'left' | 'right'
        readonly epoch: number
        readonly full: number | null
        readonly half: number | null
      }>
      __autofitCoordinationTargetPlans?: Array<{
        readonly role: string | null
        readonly fullTarget: number
        readonly halfTarget: number
      }>
      __slidevAutofitTestHooks?: Record<string, unknown>
    }
    target.__autofitCoordinationHeldBarriers = []
    target.__autofitCoordinationBarrierDispatches = []
    target.__autofitCoordinationLocalPresentations = []
    target.__autofitCoordinationTargetPlans = []
    target.__slidevAutofitTestHooks = {
      holdAutoColumnBarrier(
        barrier: Barrier,
        role: 'left' | 'right',
        epoch: number,
        callback: () => void,
      ): void {
        target.__autofitCoordinationHeldBarriers?.push({ barrier, role, epoch, callback })
      },
      afterAutoColumnBarrierDispatch(
        barrier: Barrier,
        role: 'left' | 'right',
        epoch: number,
        presentation?: {
          readonly verifiedGapTargets?: { readonly full: number | null; readonly half: number | null }
        },
      ): void {
        target.__autofitCoordinationBarrierDispatches?.push({ barrier, role, epoch })
        if (barrier === 'local-common') {
          target.__autofitCoordinationLocalPresentations?.push({
            role,
            epoch,
            full: presentation?.verifiedGapTargets?.full ?? null,
            half: presentation?.verifiedGapTargets?.half ?? null,
          })
        }
      },
      afterCoordinatedGapPlanApplied(
        viewport: HTMLElement,
        plan: { readonly targets: { readonly fullTarget: number; readonly halfTarget: number } },
      ): void {
        target.__autofitCoordinationTargetPlans?.push({
          role: viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role') ?? null,
          fullTarget: plan.targets.fullTarget,
          halfTarget: plan.targets.halfTarget,
        })
      },
    }
  })
}

async function heldAutoColumnBarriers(page: Page): Promise<HeldAutoColumnBarrier[]> {
  return page.evaluate(() => {
    return ((window as typeof window & {
      __autofitCoordinationHeldBarriers?: Array<{
        readonly barrier: AutoColumnBarrier
        readonly role: 'left' | 'right'
        readonly epoch: number
      }>
    }).__autofitCoordinationHeldBarriers ?? []).map(({ barrier, role, epoch }) => ({
      barrier,
      role,
      epoch,
    }))
  })
}

async function releaseAutoColumnBarrier(
  page: Page,
  expected: HeldAutoColumnBarrier,
): Promise<void> {
  await page.evaluate(async ({ barrier, role, epoch }) => {
    const target = window as typeof window & {
      __autofitCoordinationHeldBarriers?: Array<{
        readonly barrier: AutoColumnBarrier
        readonly role: 'left' | 'right'
        readonly epoch: number
        readonly callback: () => void
      }>
    }
    const callbacks = target.__autofitCoordinationHeldBarriers ?? []
    const index = callbacks.findIndex(callback => callback.barrier === barrier
      && callback.role === role
      && callback.epoch === epoch)
    if (index < 0)
      throw new Error(`expected held ${barrier} callback for ${role} epoch ${epoch}`)
    callbacks.splice(index, 1)[0].callback()
    await new Promise<void>(resolve => queueMicrotask(resolve))
  }, expected)
}

async function clearAutoColumnBarrierHolds(page: Page): Promise<void> {
  await page.evaluate(() => {
    const hooks = (window as typeof window & {
      __slidevAutofitTestHooks?: Record<string, unknown>
    }).__slidevAutofitTestHooks
    delete hooks?.holdAutoColumnBarrier
  })
}

async function autoColumnBarrierDispatches(page: Page): Promise<HeldAutoColumnBarrier[]> {
  return page.evaluate(() => (window as typeof window & {
    __autofitCoordinationBarrierDispatches?: HeldAutoColumnBarrier[]
  }).__autofitCoordinationBarrierDispatches ?? [])
}

async function autoColumnTargetPlans(page: Page): Promise<Array<{
  readonly role: string | null
  readonly fullTarget: number
  readonly halfTarget: number
}>> {
  return page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: Array<{
      readonly role: string | null
      readonly fullTarget: number
      readonly halfTarget: number
    }>
  }).__autofitCoordinationTargetPlans ?? [])
}

async function autoColumnLocalPresentations(page: Page): Promise<Array<{
  readonly role: 'left' | 'right'
  readonly epoch: number
  readonly full: number | null
  readonly half: number | null
}>> {
  return page.evaluate(() => (window as typeof window & {
    __autofitCoordinationLocalPresentations?: Array<{
      readonly role: 'left' | 'right'
      readonly epoch: number
      readonly full: number | null
      readonly half: number | null
    }>
  }).__autofitCoordinationLocalPresentations ?? [])
}

async function roles(pair: Locator): Promise<Locator> {
  const result = pair.locator('.autofit')
  await expect(result).toHaveCount(2)
  return result
}

function finiteTier(attribute: string | null): number {
  if (attribute === null || attribute.trim() === '')
    throw new Error('expected a present finite tier attribute')
  const tier = Number(attribute)
  expect(Number.isFinite(tier)).toBe(true)
  return tier
}

async function expectPrivatePairHidden(pair: Locator): Promise<void> {
  for (const role of await (await roles(pair)).all()) {
    await expect(role).toHaveAttribute('data-autofit-state', 'pending')
    await expect(role).not.toHaveAttribute('data-autofit-tier', /.+/)
    await expect(role).not.toHaveAttribute('data-autofit-scale', /.+/)
    await expect(role).not.toHaveAttribute('data-autofit-full-gaps', /.+/)
    await expect(role).not.toHaveAttribute('data-autofit-half-gaps', /.+/)
    await expect(role.locator('.autofit__viewport')).toHaveCSS('visibility', 'hidden')
    await expect(role.locator('.autofit__diagnostics')).toHaveText('')
  }
}

async function coordinatedPresentationSnapshot(pair: Locator): Promise<unknown> {
  return (await roles(pair)).evaluateAll((roots) => roots.map((root) => {
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    return {
      attributes: [...root.attributes]
        .filter(attribute => attribute.name.startsWith('data-autofit-')
          && attribute.name !== 'data-autofit-private-tier')
        .map(attribute => [attribute.name, attribute.value]),
      viewportVisibility: getComputedStyle(
        root.querySelector<HTMLElement>('.autofit__viewport')!,
      ).visibility,
      diagnostic: root.querySelector('.autofit__diagnostics')?.textContent?.trim() ?? '',
      flow: {
        fontSize: getComputedStyle(flow).fontSize,
        lineHeight: getComputedStyle(flow).lineHeight,
        paddingBlockStart: getComputedStyle(flow).paddingBlockStart,
        paddingBlockEnd: getComputedStyle(flow).paddingBlockEnd,
        insetBlockStart: getComputedStyle(flow).insetBlockStart,
      },
      content: [...flow.children].map((element) => {
        const style = getComputedStyle(element)
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          marginBlockStart: style.marginBlockStart,
          marginBlockEnd: style.marginBlockEnd,
        }
      }),
    }
  }))
}

async function start(page: Page, slide: number): Promise<Locator> {
  await page.goto(`/${slide}`)
  await waitForPageAssets(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  await expect(pair).toBeAttached()
  return pair
}

async function waitForPair(pair: Locator): Promise<Locator> {
  const result = await roles(pair)
  for (const role of await result.all())
    await waitForAutofitPublication(role)
  return result
}

type CoordinatedTargetCheckpoint =
  | 'after-gap-mutation'
  | 'after-target-anchor'
  | 'after-alignment-mutation'
  | 'after-final-reads'

interface CoordinatedCheckpointSnapshot {
  readonly step: CoordinatedTargetCheckpoint
  readonly presentation: unknown
}

async function installTargetSynchronizationInvalidation(
  page: Page,
  step: CoordinatedTargetCheckpoint,
  supersedes: number,
): Promise<void> {
  await page.evaluate(({ step, supersedes }) => {
    const target = window as typeof window & {
      __autofitCoordinatedCheckpointSnapshots?: CoordinatedCheckpointSnapshot[]
      __autofitCoordinatedCheckpointTerminals?: Array<{
        readonly finalAnchorError: number | null
        readonly terminal: string
      }>
      __slidevAutofitTestHooks?: Record<string, unknown>
    }
    target.__autofitCoordinatedCheckpointSnapshots = []
    target.__autofitCoordinatedCheckpointTerminals = []
    let triggered = false
    let terminalRecorded = false
    Object.assign(target.__slidevAutofitTestHooks ??= {}, {
      afterCoordinatedTargetSynchronizationCheckpoint(
        viewport: HTMLElement,
        currentStep: CoordinatedTargetCheckpoint,
      ): void {
        if (triggered || currentStep !== step)
          return
        triggered = true
        const root = viewport.closest<HTMLElement>('.autofit')!
        for (let count = 0; count < supersedes; count += 1)
          root.dispatchEvent(new Event('slidev-autofit-test-supersede'))
        const pair = root.closest<HTMLElement>('[data-testid="coordination-harness"]')!
        target.__autofitCoordinatedCheckpointSnapshots?.push({
          step: currentStep,
          presentation: [...pair.querySelectorAll<HTMLElement>('.autofit')].map((role) => {
            const flow = role.querySelector<HTMLElement>('.autofit__flow')!
            const style = getComputedStyle(flow)
            return {
              attributes: [...role.attributes]
                .filter(attribute => attribute.name.startsWith('data-autofit-')
                  && attribute.name !== 'data-autofit-private-tier')
                .map(attribute => [attribute.name, attribute.value]),
              viewportVisibility: getComputedStyle(
                role.querySelector<HTMLElement>('.autofit__viewport')!,
              ).visibility,
              diagnostic: role.querySelector('.autofit__diagnostics')?.textContent?.trim() ?? '',
              flow: {
                fontSize: style.fontSize,
                lineHeight: style.lineHeight,
                paddingBlockStart: style.paddingBlockStart,
                paddingBlockEnd: style.paddingBlockEnd,
                insetBlockStart: style.insetBlockStart,
              },
              content: [...flow.children].map((element) => {
                const childStyle = getComputedStyle(element)
                return {
                  fontSize: childStyle.fontSize,
                  lineHeight: childStyle.lineHeight,
                  marginBlockStart: childStyle.marginBlockStart,
                  marginBlockEnd: childStyle.marginBlockEnd,
                }
              }),
            }
          }),
        })
      },
      afterCoordinatedStartingAlignmentApplied(
        _viewport: HTMLElement,
        details: {
          readonly finalAnchorError: number | null
          readonly application: { readonly status: string }
        },
      ): void {
        if (terminalRecorded)
          return
        terminalRecorded = true
        target.__autofitCoordinatedCheckpointTerminals?.push({
          finalAnchorError: details.finalAnchorError,
          terminal: details.application.status,
        })
      },
    })
  }, { step, supersedes })
}

async function coordinatedCheckpointSnapshots(
  page: Page,
): Promise<CoordinatedCheckpointSnapshot[]> {
  return page.evaluate(() => (window as typeof window & {
    __autofitCoordinatedCheckpointSnapshots?: CoordinatedCheckpointSnapshot[]
  }).__autofitCoordinatedCheckpointSnapshots ?? [])
}

async function coordinatedCheckpointTerminals(page: Page): Promise<Array<{
  readonly finalAnchorError: number | null
  readonly terminal: string
}>> {
  return page.evaluate(() => (window as typeof window & {
    __autofitCoordinatedCheckpointTerminals?: Array<{
      readonly finalAnchorError: number | null
      readonly terminal: string
    }>
  }).__autofitCoordinatedCheckpointTerminals ?? [])
}

interface CoordinatedTopologyInvalidationSnapshot {
  readonly existingGeneratedDeclarations: number
  readonly restoredGeneratedDeclarations: number
}

async function installTargetSynchronizationTopologyInvalidation(
  page: Page,
): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitCoordinatedTopologyInvalidationSnapshots?: CoordinatedTopologyInvalidationSnapshot[]
      __slidevAutofitTestHooks?: Record<string, unknown>
    }
    target.__autofitCoordinatedTopologyInvalidationSnapshots = []
    let triggered = false
    Object.assign(target.__slidevAutofitTestHooks ??= {}, {
      afterCoordinatedTargetSynchronizationCheckpoint(
        viewport: HTMLElement,
        step: CoordinatedTargetCheckpoint,
      ): void {
        if (triggered || step !== 'after-gap-mutation')
          return
        triggered = true
        const root = viewport.closest<HTMLElement>('.autofit')!
        const flow = root.querySelector<HTMLElement>('.autofit__flow')!
        const declarationCount = (element: HTMLElement): number => [
          'font-size',
          'line-height',
          'margin-block-start',
          'margin-block-end',
          'padding-block-start',
          'padding-block-end',
          'inset-block-start',
        ].filter(property => element.style.getPropertyValue(property) !== '').length
        const existingGeneratedDeclarations = [...flow.children]
          .reduce((count, child) => count + declarationCount(child as HTMLElement), 0)
        const appended = document.createElement('p')
        appended.textContent = 'Topology mutation during target synchronization'
        flow.append(appended)
        root.dispatchEvent(new Event('slidev-autofit-test-supersede'))
        target.__autofitCoordinatedTopologyInvalidationSnapshots?.push({
          existingGeneratedDeclarations,
          restoredGeneratedDeclarations: [...flow.children]
            .reduce((count, child) => count + declarationCount(child as HTMLElement), 0),
        })
      },
    })
  })
}

async function coordinatedTopologyInvalidationSnapshots(
  page: Page,
): Promise<CoordinatedTopologyInvalidationSnapshot[]> {
  return page.evaluate(() => (window as typeof window & {
    __autofitCoordinatedTopologyInvalidationSnapshots?: CoordinatedTopologyInvalidationSnapshot[]
  }).__autofitCoordinatedTopologyInvalidationSnapshots ?? [])
}

async function releaseSynchronizationAfterSourceMutation(
  page: Page,
  synchronization: HeldAutoColumnBarrier,
  mutation: 'origin' | 'size' | 'scale' | 'pair-host-scale' | 'nonfinite',
): Promise<void> {
  await page.evaluate(async ({ synchronization, mutation }) => {
    const target = window as typeof window & {
      __autofitCoordinationHeldBarriers?: Array<{
        readonly barrier: AutoColumnBarrier
        readonly role: 'left' | 'right'
        readonly epoch: number
        readonly callback: () => void
      }>
      __slidevAutofitTestHooks?: Record<string, unknown>
    }
    const source = document.querySelector<HTMLElement>('[data-autofit-role="right"]')!
    const viewport = source.querySelector<HTMLElement>('.autofit__viewport')!
    const host = source.closest<HTMLElement>('[data-testid="coordination-harness"]')!
    if (mutation === 'origin')
      viewport.style.transform = 'translateY(8px)'
    else if (mutation === 'size')
      viewport.style.height = `${viewport.getBoundingClientRect().height + 8}px`
    else if (mutation === 'scale')
      viewport.style.transform = 'scale(0.98)'
    else if (mutation === 'pair-host-scale')
      host.style.transform = 'scale(0.98)'
    else {
      let injected = false
      Object.assign(target.__slidevAutofitTestHooks ??= {}, {
        overrideCoordinatedCurrentSourceCoordinate(
          candidate: HTMLElement,
          coordinate: Record<string, number>,
        ): Record<string, number> {
          if (!injected && candidate.closest('[data-autofit-role="right"]')) {
            injected = true
            return { ...coordinate, viewportBlockScale: Number.NaN }
          }
          return coordinate
        },
      })
    }
    const callbacks = target.__autofitCoordinationHeldBarriers ?? []
    const index = callbacks.findIndex(callback => callback.barrier === synchronization.barrier
      && callback.role === synchronization.role
      && callback.epoch === synchronization.epoch)
    if (index < 0)
      throw new Error('expected the held synchronization callback')
    callbacks.splice(index, 1)[0].callback()
    await new Promise<void>(resolve => queueMicrotask(resolve))
  }, { synchronization, mutation })
}

interface StartingAlignmentObservation {
  readonly role: 'left' | 'right'
  readonly sourceRenderedAnchor: number
  readonly targetRenderedAnchor: number
  readonly targetLocalDelta: number
  readonly targetBlockScale: number
  readonly paddingShift: number
  readonly residualBlockOffset: number
  readonly finalAnchorError: number | null
  readonly terminal: string
}

interface CandidateAnchorCaptureObservation {
  readonly role: 'left' | 'right'
  readonly renderedAnchor: number
  readonly paddingBefore: number
  readonly paddingAfter: number
}

async function installCandidateAnchorCaptureObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitCandidateAnchorCaptures?: CandidateAnchorCaptureObservation[]
      __slidevAutofitTestHooks?: Record<string, unknown>
    }
    target.__autofitCandidateAnchorCaptures = []
    Object.assign(target.__slidevAutofitTestHooks ?? {}, {
      afterCoordinatedCandidateAnchorCaptured(
        viewport: HTMLElement,
        snapshot: { readonly localAnchor: number; readonly viewportBlockScale: number },
      ): void {
        const flow = viewport.querySelector<HTMLElement>('.autofit__flow')!
        const style = getComputedStyle(flow)
        target.__autofitCandidateAnchorCaptures?.push({
          role: viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role') as 'left' | 'right',
          renderedAnchor: viewport.getBoundingClientRect().top
            + snapshot.localAnchor * snapshot.viewportBlockScale,
          paddingBefore: Number.parseFloat(style.paddingBlockStart),
          paddingAfter: Number.parseFloat(style.paddingBlockEnd),
        })
      },
    })
  })
}

async function candidateAnchorCaptures(page: Page): Promise<CandidateAnchorCaptureObservation[]> {
  return page.evaluate(() => (window as typeof window & {
    __autofitCandidateAnchorCaptures?: CandidateAnchorCaptureObservation[]
  }).__autofitCandidateAnchorCaptures ?? [])
}

async function installStartingAlignmentObserver(
  page: Page,
  forceGapOverflow = false,
): Promise<void> {
  await page.evaluate((forceGapOverflow) => {
    const target = window as typeof window & {
      __autofitStartingAlignment?: StartingAlignmentObservation[]
    }
    target.__autofitStartingAlignment = []
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCoordinatedTargetOverflow: (): boolean => forceGapOverflow,
        afterCoordinatedStartingAlignmentApplied(
          viewport: HTMLElement,
          details: Omit<StartingAlignmentObservation, 'role' | 'terminal'> & {
            readonly application: { readonly status: string }
          },
        ): void {
          target.__autofitStartingAlignment?.push({
            role: viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role') as 'left' | 'right',
            sourceRenderedAnchor: details.sourceRenderedAnchor,
            targetRenderedAnchor: details.targetRenderedAnchor,
            targetLocalDelta: details.targetLocalDelta,
            targetBlockScale: details.targetBlockScale,
            paddingShift: details.paddingShift,
            residualBlockOffset: details.residualBlockOffset,
            finalAnchorError: details.finalAnchorError,
            terminal: details.application.status,
          })
        },
      },
    })
  }, forceGapOverflow)
}

async function startingAlignmentObservations(page: Page): Promise<StartingAlignmentObservation[]> {
  return page.evaluate(() => (window as typeof window & {
    __autofitStartingAlignment?: StartingAlignmentObservation[]
  }).__autofitStartingAlignment ?? [])
}

async function renderedStartingAnchors(pair: Locator): Promise<number[]> {
  return (await roles(pair)).evaluateAll((roots) => roots.map((root) => {
    const first = root.querySelector<HTMLElement>(
      '[data-testid*="first"], [data-testid$="semantic-a"], [data-testid$="semantic-heading"]',
    ) ?? root.querySelector<HTMLElement>('.autofit__flow > *')!
    if (first.localName === 'svg' || first.localName === 'blockquote')
      return first.getBoundingClientRect().top
    const range = document.createRange()
    range.selectNodeContents(first)
    return Math.min(...[...range.getClientRects()].map(rectangle => rectangle.top))
  }))
}

async function coordinatedAlignedTerminalSnapshot(pair: Locator): Promise<{
  readonly anchors: number[]
  readonly roles: Array<{
    readonly state: string | null
    readonly tier: string | null
    readonly scale: string | null
    readonly alignment: string | null
    readonly paddingBlockStart: string
    readonly paddingBlockEnd: string
    readonly insetBlockStart: string
  }>
}> {
  const roots = await roles(pair)
  return {
    anchors: await renderedStartingAnchors(pair),
    roles: await roots.evaluateAll(elements => elements.map((element) => {
      const flow = element.querySelector<HTMLElement>('.autofit__flow')!
      const style = getComputedStyle(flow)
      return {
        state: element.getAttribute('data-autofit-state'),
        tier: element.getAttribute('data-autofit-tier'),
        scale: element.getAttribute('data-autofit-scale'),
        alignment: element.getAttribute('data-autofit-effective-alignment'),
        paddingBlockStart: style.paddingBlockStart,
        paddingBlockEnd: style.paddingBlockEnd,
        insetBlockStart: style.insetBlockStart,
      }
    })),
  }
}

async function installPublicationObserver(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitCoordinationPublications?: Array<Array<{
        state: string | null
        tier: string | null
        scale: string | null
        fullGaps: string | null
        halfGaps: string | null
        empty: string | null
        visible: string
        diagnostic: string
      }>>
    }
    const publications: NonNullable<typeof target.__autofitCoordinationPublications> = []
    const snapshot = () => [...document.querySelector(
      '[data-testid="coordination-harness"]',
    )?.querySelectorAll('.autofit') ?? []].map((root) => {
      const viewport = root.querySelector('.autofit__viewport')!
      return {
        state: root.getAttribute('data-autofit-state'),
        tier: root.getAttribute('data-autofit-tier'),
        scale: root.getAttribute('data-autofit-scale'),
        fullGaps: root.getAttribute('data-autofit-full-gaps'),
        halfGaps: root.getAttribute('data-autofit-half-gaps'),
        empty: root.getAttribute('data-autofit-empty'),
        visible: getComputedStyle(viewport).visibility,
        diagnostic: root.querySelector('.autofit__diagnostics')?.textContent?.trim() ?? '',
      }
    })
    new MutationObserver((mutations) => {
      if (!mutations.some((mutation) => {
        const node = mutation.target instanceof Element
          ? mutation.target
          : mutation.target.parentElement
        return node?.closest('[data-testid="coordination-harness"]')
      })) {
        return
      }
      const value = snapshot()
      if (value.length === 2)
        publications.push(value)
    }).observe(document.body, { subtree: true, childList: true, attributes: true })
    target.__autofitCoordinationPublications = publications
  })
}

async function expectOnlyAtomicPublication(page: Page): Promise<void> {
  const result = await expect.poll(() => page.evaluate(() => {
    const snapshots = (window as typeof window & {
      __autofitCoordinationPublications?: Array<Array<{
        state: string | null
        tier: string | null
        scale: string | null
        fullGaps: string | null
        halfGaps: string | null
        empty: string | null
        visible: string
        diagnostic: string
      }>>
    }).__autofitCoordinationPublications ?? []
    const isPrivate = (snapshot: typeof snapshots[number]) => snapshot.every(role =>
      role.state === 'pending'
      && role.tier === null
      && role.scale === null
      && role.fullGaps === null
      && role.halfGaps === null
      && role.empty === null
      && role.visible === 'hidden'
      && role.diagnostic === '',
    )
    const final = [...document.querySelector(
      '[data-testid="coordination-harness"]',
    )?.querySelectorAll('.autofit') ?? []].map((root) => {
      const viewport = root.querySelector('.autofit__viewport')!
      return {
        state: root.getAttribute('data-autofit-state'),
        tier: root.getAttribute('data-autofit-tier'),
        scale: root.getAttribute('data-autofit-scale'),
        fullGaps: root.getAttribute('data-autofit-full-gaps'),
        halfGaps: root.getAttribute('data-autofit-half-gaps'),
        empty: root.getAttribute('data-autofit-empty'),
        visible: getComputedStyle(viewport).visibility,
        diagnostic: root.querySelector('.autofit__diagnostics')?.textContent?.trim() ?? '',
      }
    })
    const isFinal = (snapshot: typeof snapshots[number]) => snapshot.length === final.length
      && snapshot.every((role, index) => Object.entries(role).every(
        ([key, value]) => final[index][key as keyof typeof role] === value,
      ))
    const finalTransitions = snapshots.reduce((count, snapshot, index) => {
      return count + Number(isFinal(snapshot) && (index === 0 || !isFinal(snapshots[index - 1])))
    }, 0)
    return {
      snapshots,
      valid: snapshots.length > 0 && snapshots.every(snapshot => isPrivate(snapshot) || isFinal(snapshot)),
      finalTransitions,
    }
  })).toMatchObject({ valid: true, finalTransitions: 1 })
  return result
}

for (const [slide, order, firstRole] of [
  [50, 'left finishes first', 0],
  [51, 'right finishes first', 1],
] as const) {
  test(`keeps every private-search and common-tier frame hidden when ${order}`, async ({ page }) => {
    await page.goto(`/${slide}`)
    await holdFrames(page)
    await installPublicationObserver(page)
    await page.locator('[data-testid="start-coordination"]:visible').click()
    const pair = page.locator('[data-testid="coordination-harness"]:visible')
    await expect.poll(() => page.evaluate(() => {
      return (window as typeof window & {
        __autofitCoordinationFrames?: FrameRequestCallback[]
      }).__autofitCoordinationFrames?.length ?? 0
    })).toBeGreaterThan(0)

    let sawExpectedSingleton = false
    let sawBothPrivateTerminals = false
    for (let step = 0; step < 8; step += 1) {
      await expectPrivatePairHidden(pair)
      await releaseOneFrame(page)
      await expectPrivatePairHidden(pair)
      const privateTiers = await (await roles(pair)).evaluateAll(roots =>
        roots.map(root => root.getAttribute('data-autofit-private-tier')),
      )
      const privateTerminalCount = privateTiers.filter(tier => tier !== null).length
      if (privateTerminalCount === 1) {
        expect(privateTiers[firstRole]).not.toBeNull()
        expect(privateTiers[1 - firstRole]).toBeNull()
        sawExpectedSingleton = true
      }
      if (privateTerminalCount === 2) {
        expect(sawExpectedSingleton).toBe(true)
        sawBothPrivateTerminals = true
        break
      }
    }
    expect(sawExpectedSingleton).toBe(true)
    expect(sawBothPrivateTerminals).toBe(true)
    await expect.poll(() => page.evaluate(() => {
      return (window as typeof window & {
        __autofitCoordinationFrames?: FrameRequestCallback[]
      }).__autofitCoordinationFrames?.length ?? 0
    })).toBeGreaterThan(0)
    await expectPrivatePairHidden(pair)

    await restoreFrames(page)
    const result = await waitForPair(pair)
    await expect(result.nth(0)).toHaveAttribute('data-autofit-tier', '-4')
    await expect(result.nth(1)).toHaveAttribute('data-autofit-tier', '-4')
    await expect(result.nth(0).locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
    await expect(result.nth(1).locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
    await expectOnlyAtomicPublication(page)
  })
}

test('uses private fitted tiers, reuses balanced measurements, and measures only the missing common tier', async ({ page }) => {
  const balanced = await start(page, 52)
  const balancedRoles = await waitForPair(balanced)
  for (const role of await balancedRoles.all()) {
    await expect(role).toHaveAttribute('data-autofit-private-tier', '0')
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
    await expect(role).toHaveAttribute('data-autofit-scale', '1')
    await expect(role).toHaveAttribute('data-autofit-state', 'fit')
    await expect(role).toHaveAttribute('data-autofit-measure-count', '1')
  }

  await page.goto('/65')
  await holdFrames(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const unbalanced = page.locator('[data-testid="coordination-harness"]:visible')
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)
  let privateMeasurementCounts: string[] | null = null
  for (let step = 0; step < 12; step += 1) {
    await releaseOneFrame(page)
    const unbalancedRoles = await roles(unbalanced)
    const privateTiers = await unbalancedRoles.evaluateAll(roots =>
      roots.map(root => root.getAttribute('data-autofit-private-tier')),
    )
    if (privateTiers.every(tier => tier !== null && tier.trim() !== '')) {
      const values = privateTiers.map(finiteTier)
      expect(Math.min(...values)).toBeLessThan(Math.max(...values))
      await expectPrivatePairHidden(unbalanced)
      privateMeasurementCounts = await page.evaluate(() => {
        const debug = (window as typeof window & {
          __slidevAutofitDebug?: {
            readonly snapshot: {
              readonly candidateMeasurements: readonly { readonly count: number }[]
            }
          }
        }).__slidevAutofitDebug
        return debug?.snapshot.candidateMeasurements
          .map(measurement => String(measurement.count))
          .sort((left, right) => Number(left) - Number(right)) ?? []
      })
      break
    }
  }
  expect(privateMeasurementCounts).toEqual(['1', '4'])
  await restoreFrames(page)
  const unbalancedRoles = await waitForPair(unbalanced)
  const tiers = await unbalancedRoles.evaluateAll(roots => roots.map((root) => ({
    private: root.getAttribute('data-autofit-private-tier'),
    published: root.getAttribute('data-autofit-tier'),
  })))
  const privateTiers = tiers.map(({ private: tier }) => finiteTier(tier))
  const publishedTiers = tiers.map(({ published }) => finiteTier(published))
  expect(Math.min(...privateTiers)).toBeLessThan(
    Math.max(...privateTiers),
  )
  expect(publishedTiers[0]).toBe(publishedTiers[1])
  for (const role of await unbalancedRoles.all()) {
    await expect(role).toHaveAttribute('data-autofit-state', 'fit')
  }
  await expect(unbalancedRoles.nth(0)).toHaveAttribute('data-autofit-measure-count', '2')
  await expect(unbalancedRoles.nth(1)).toHaveAttribute('data-autofit-measure-count', '4')
})

test('localizes one-sided and two-sided overflow at the atomic smallest tier', async ({ page }) => {
  for (const [slide, states] of [
    [53, ['fit', 'overflow']],
    [54, ['overflow', 'overflow']],
  ] as const) {
    const pair = await start(page, slide)
    const result = await waitForPair(pair)
    for (const [index, expectedState] of states.entries()) {
      const role = result.nth(index)
      await expect(role).toHaveAttribute('data-autofit-state', expectedState)
      await expect(role).toHaveAttribute('data-autofit-tier', '-4')
      await expect(role).toHaveAttribute('data-autofit-scale', '0.6')
      await expect(role).toHaveClass(expectedState === 'overflow'
        ? /autofit--overflow/
        : /autofit--fit/)
      await expect(role.locator('.autofit__overflow-badge')).toHaveCount(
        expectedState === 'overflow' ? 1 : 0,
      )
      await expect(role).toHaveAttribute(
        'data-autofit-effective-alignment',
        'top',
      )
    }
  }
})

type AtomicTerminalCase = {
  readonly slide: number
  readonly states: readonly [string, string]
  readonly tiers: readonly [string | null, string | null]
}

const atomicTerminalCases: readonly AtomicTerminalCase[] = [
  { slide: 55, states: ['fit', 'fit'], tiers: ['0', '0'] },
  { slide: 56, states: ['fit', 'fit'], tiers: ['0', '0'] },
  { slide: 57, states: ['unsupported', 'fit'], tiers: [null, '0'] },
  { slide: 58, states: ['unsupported', 'overflow'], tiers: [null, '-4'] },
  { slide: 59, states: ['unsupported', 'fit'], tiers: [null, '0'] },
  { slide: 60, states: ['unsupported', 'unsupported'], tiers: [null, null] },
  { slide: 61, states: ['fit', 'unsupported'], tiers: ['0', null] },
  { slide: 62, states: ['overflow', 'unsupported'], tiers: ['-4', null] },
  { slide: 63, states: ['fit', 'unsupported'], tiers: ['0', null] },
]

async function expectAtomicTerminal(
  page: Page,
  { slide, states, tiers }: AtomicTerminalCase,
): Promise<void> {
  await page.goto(`/${slide}`)
  await installPublicationObserver(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  for (const index of [0, 1] as const) {
    const role = result.nth(index)
    await expect(role).toHaveAttribute('data-autofit-state', states[index])
    if (tiers[index] === null) {
      await expect(role).not.toHaveAttribute('data-autofit-tier')
      await expect(role).not.toHaveAttribute('data-autofit-scale')
      await expect(role).toHaveAttribute('data-autofit-effective-alignment', 'top')
      await expect(role.locator('.autofit__unsupported-badge')).toHaveCount(1)
    }
    else {
      await expect(role).toHaveAttribute('data-autofit-tier', tiers[index])
      await expect(role).toHaveAttribute('data-autofit-scale', tiers[index] === '0' ? '1' : '0.6')
    }
  }
  if (slide === 55)
    await expect(result.nth(0)).toHaveAttribute('data-autofit-empty', 'true')
  if (slide === 56) {
    for (const role of await result.all())
      await expect(role).toHaveAttribute('data-autofit-empty', 'true')
  }
  if (slide === 63)
    await expect(result.nth(0)).toHaveAttribute('data-autofit-empty', 'true')
  await expectOnlyAtomicPublication(page)
}

for (const terminalCase of atomicTerminalCases) {
  test(`atomically retains each healthy terminal beside empty and unsupported fallbacks (slide ${terminalCase.slide})`, async ({ page }) => {
    await expectAtomicTerminal(page, terminalCase)
  })
}

test('keeps empty state role-local beside managed and overflow terminals', async ({ page }) => {
  const cases = [
    [55, ['fit', 'fit'], [true, false]],
    [66, ['fit', 'fit'], [false, true]],
    [67, ['fit', 'overflow'], [true, false]],
    [68, ['overflow', 'fit'], [false, true]],
    [56, ['fit', 'fit'], [true, true]],
  ] as const

  for (const [slide, states, empties] of cases) {
    await page.goto(`/${slide}`)
    await installPublicationObserver(page)
    await page.locator('[data-testid="start-coordination"]:visible').click()
    const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
    for (const index of [0, 1] as const) {
      const role = result.nth(index)
      await expect(role).toHaveAttribute('data-autofit-state', states[index])
      if (empties[index]) {
        await expect(role).toHaveAttribute('data-autofit-empty', 'true')
        await expect(role.locator('.autofit__overflow-badge')).toHaveCount(0)
      }
      else {
        await expect(role).not.toHaveAttribute('data-autofit-empty')
        await expect(role).toHaveAttribute('data-autofit-tier', states[index] === 'overflow' ? '-4' : '0')
      }
    }
    await expectOnlyAtomicPublication(page)
  }
})

test('shares the authoritative distributed semantic-gap plan while retaining local counts and padding', async ({ page }) => {
  await page.goto('/64')
  await waitForPageAssets(page)
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        afterCoordinatedGapPlanApplied(
          viewport: HTMLElement,
          plan: unknown,
          application: {
            readonly result?: {
              readonly presentation: {
                readonly boundaries: readonly {
                  readonly kind: string
                  readonly target: number
                  readonly carrier: Element
                }[]
                readonly alignment: { readonly before: number; readonly after: number }
              }
            }
          },
          localResult: {
            readonly presentation: {
              readonly alignment: { readonly before: number; readonly after: number }
            }
          },
        ): void {
          const root = viewport.closest<HTMLElement>('.autofit')
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push({
            role: root?.getAttribute('data-autofit-role'),
            plan,
            boundaries: application.result?.presentation.boundaries.map(boundary => ({
              kind: boundary.kind,
              target: boundary.target,
              testId: boundary.carrier.getAttribute('data-testid'),
              tag: boundary.carrier.localName,
            })),
            synchronizedPadding: application.result?.presentation.alignment,
            localPadding: localResult.presentation.alignment,
          })
        },
      },
    })
  })
  await installPublicationObserver(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  const result = await waitForPair(pair)
  const left = result.nth(0)
  const right = result.nth(1)
  for (const role of [left, right]) {
    await expect(role).toHaveAttribute('data-autofit-state', 'fit')
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
    await expect(role).toHaveAttribute('data-autofit-scale', '1')
    await expect(role).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
    await expect(role.locator('.autofit__diagnostics')).toHaveText('')
  }
  await expect(left).toHaveAttribute('data-autofit-full-gaps', '1')
  await expect(left).toHaveAttribute('data-autofit-half-gaps', '0')
  await expect(right).toHaveAttribute('data-autofit-full-gaps', '0')
  await expect(right).toHaveAttribute('data-autofit-half-gaps', '3')

  const presentation = await result.evaluateAll((roots) => roots.map((root, index) => {
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    const style = getComputedStyle(flow)
    const textEdges = (element: HTMLElement): { readonly leading: number; readonly trailing: number } => {
      const range = document.createRange()
      range.selectNodeContents(element)
      const rectangles = [...range.getClientRects()]
      return {
        leading: Math.min(...rectangles.map(rectangle => rectangle.top)),
        trailing: Math.max(...rectangles.map(rectangle => rectangle.bottom)),
      }
    }
    const carrier = root.querySelector<HTMLElement>(index === 0
      ? '[data-testid="coordination-left-semantic-b"]'
      : '[data-testid="coordination-right-semantic-list"]')!
    const previous = root.querySelector<HTMLElement>(index === 0
      ? '[data-testid="coordination-left-semantic-a"]'
      : '[data-testid="coordination-right-semantic-copy"]')!
    const following = index === 0
      ? carrier
      : carrier.querySelector<HTMLElement>('li')!
    return {
      paddingBefore: Number.parseFloat(style.paddingBlockStart),
      paddingAfter: Number.parseFloat(style.paddingBlockEnd),
      carrierMargin: Number.parseFloat(getComputedStyle(carrier).marginBlockStart),
      visualGap: textEdges(following).leading - textEdges(previous).trailing,
      visualScale: flow.getBoundingClientRect().width / flow.clientWidth,
    }
  }))
  expect(presentation[1].paddingBefore).toBeCloseTo(presentation[1].paddingAfter, 4)
  expect(presentation[0].carrierMargin).toBeGreaterThan(presentation[1].carrierMargin)
  const synchronized = await page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationTargetPlans?: Array<{
        readonly role: string | null
        readonly plan: { readonly targets: { readonly fullTarget: number; readonly halfTarget: number } }
        readonly boundaries: readonly {
          readonly kind: string
          readonly target: number
          readonly testId: string | null
          readonly tag: string
        }[]
        readonly synchronizedPadding?: { readonly before: number; readonly after: number }
        readonly localPadding: { readonly before: number; readonly after: number }
      }>
    }).__autofitCoordinationTargetPlans
  })
  expect(synchronized).toHaveLength(1)
  expect(synchronized?.[0].role).toBe('left')
  expect(synchronized?.[0].boundaries).toEqual([
    expect.objectContaining({ kind: 'full', testId: 'coordination-left-semantic-b' }),
  ])
  expect(
    presentation[0].paddingBefore + presentation[0].paddingAfter,
  ).toBeCloseTo(
    synchronized![0].localPadding.before + synchronized![0].localPadding.after,
    3,
  )
  expect(synchronized![0].synchronizedPadding?.before).toBeCloseTo(
    presentation[0].paddingBefore,
    3,
  )
  expect(synchronized![0].synchronizedPadding?.after).toBeCloseTo(
    presentation[0].paddingAfter,
    3,
  )
  expect(presentation[0].visualGap).toBeCloseTo(
    synchronized![0].plan.targets.fullTarget * presentation[0].visualScale,
    1,
  )
  expect(presentation[1].visualGap).toBeCloseTo(
    synchronized![0].plan.targets.halfTarget * presentation[1].visualScale,
    1,
  )
  await expectOnlyAtomicPublication(page)
})

test('aligns the target first text line to the fixed authoritative source after semantic-gap synchronization', async ({ page }) => {
  await page.goto('/64')
  await waitForPageAssets(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))

  const anchors = await result.evaluateAll((roots) => roots.map((root) => {
    const firstUnit = root.querySelector<HTMLElement>(
      '[data-testid^="coordination-"]',
    )!
    const range = document.createRange()
    range.selectNodeContents(firstUnit)
    return Math.min(...[...range.getClientRects()].map(rectangle => rectangle.top))
  }))

  // The existing deterministic semantic authority for this fixture is right;
  // alignment may move only the left target.
  expect(anchors[0]).toBeCloseTo(anchors[1]!, 1)
})

test('aligns text/media, media/text, and atomic/text first-unit pairs', async ({ page }) => {
  for (const mode of [
    'semantic-text-media',
    'semantic-media-text',
    'semantic-atomic-text',
  ]) {
    await page.goto(`/64?coordinationMode=${mode}`)
    await installStartingAlignmentObserver(page)
    await page.locator('[data-testid="start-coordination"]:visible').click()
    const pair = page.locator('[data-testid="coordination-harness"]:visible')
    await waitForPair(pair)
    const anchors = await renderedStartingAnchors(pair)
    expect(anchors[0]).toBeCloseTo(anchors[1]!, 1)
    const observations = await startingAlignmentObservations(page)
    expect(observations).toHaveLength(1)
    expect(Math.abs(observations[0]!.finalAnchorError ?? Number.NaN)).toBeLessThanOrEqual(0.5)
  }
})

test('captures candidate anchors from the transient common-tier presentation before neutral restoration without an intermediate paint', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-capture')
  await installAutoColumnBarrierHolds(page)
  await installCandidateAnchorCaptureObserver(page)
  await installPublicationObserver(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  const epoch = await waitForHeldSemanticPair(page, pair)

  const captures = await candidateAnchorCaptures(page)
  expect(captures.map(capture => capture.role).sort()).toEqual(['left', 'right'])
  const sourceCapture = captures.find(capture => capture.role === 'right')!
  expect(sourceCapture.paddingBefore).toBeGreaterThan(0)
  expect(sourceCapture.paddingAfter).toBeGreaterThan(0)

  const neutralSourceAnchor = await pair.locator('[data-autofit-role="right"]').evaluate((root) => {
    const first = root.querySelector<HTMLElement>('[data-testid="coordination-right-semantic-heading"]')!
    const range = document.createRange()
    range.selectNodeContents(first)
    return Math.min(...[...range.getClientRects()].map(rectangle => rectangle.top))
  })
  expect(Math.abs(sourceCapture.renderedAnchor - neutralSourceAnchor)).toBeGreaterThan(10)

  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  await expectPrivatePairHidden(pair)

  const synchronization = await releaseHeldLocalCommon(page, epoch, ['left', 'right'])
  await releaseAutoColumnBarrier(page, synchronization)
  await waitForPair(pair)
  await expectOnlyAtomicPublication(page)
})

test('uses common rendered coordinates across a transformed target and moves the selected target only', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-scaled')
  await waitForPageAssets(page)
  await installStartingAlignmentObserver(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  await waitForPair(pair)
  const anchors = await renderedStartingAnchors(pair)
  expect(anchors[0]).toBeCloseTo(anchors[1]!, 1)
  const [observation] = await startingAlignmentObservations(page)
  expect(observation).toBeDefined()
  expect(observation?.targetBlockScale).not.toBeCloseTo(1, 3)
  expect(observation?.targetLocalDelta).toBeCloseTo(
    (observation!.sourceRenderedAnchor - observation!.targetRenderedAnchor)
      / observation!.targetBlockScale,
    6,
  )
})

test('mirrors source authority while redistributing only the target padding for positive and negative shifts', async ({ page }) => {
  const cases = [
    ['semantic', 'left', -1],
    ['semantic-mirror-positive', 'right', 1],
  ] as const
  for (const [mode, targetRole, sign] of cases) {
    await page.goto(`/64?coordinationMode=${mode}`)
    await installStartingAlignmentObserver(page)
    await page.locator('[data-testid="start-coordination"]:visible').click()
    const pair = page.locator('[data-testid="coordination-harness"]:visible')
    await waitForPair(pair)
    const anchors = await renderedStartingAnchors(pair)
    expect(anchors[0]).toBeCloseTo(anchors[1]!, 1)
    const [observation] = await startingAlignmentObservations(page)
    expect(observation?.role).toBe(targetRole)
    expect(Math.sign(observation!.targetLocalDelta)).toBe(sign)
    expect(Math.abs(observation!.residualBlockOffset)).toBeLessThanOrEqual(0.5)
  }
})

test('retains exact anchors and target-only overflow for a mirrored positive out-of-budget residual', async ({ page }) => {
  for (const scenario of [
    {
      forceGapOverflow: false,
      warning: 'required coordinated start alignment exceeds',
    },
    {
      forceGapOverflow: true,
      warning: 'required coordinated semantic gaps and start alignment exceed',
    },
  ] as const) {
    const warnings: string[] = []
    const listener = (message: { type(): string; text(): string }): void => {
      if (message.type() === 'warning')
        warnings.push(message.text())
    }
    page.on('console', listener)
    await page.goto('/64?coordinationMode=semantic-mirror-positive-overflow')
    await installStartingAlignmentObserver(page, scenario.forceGapOverflow)
    await page.locator('[data-testid="start-coordination"]:visible').click()
    const pair = page.locator('[data-testid="coordination-harness"]:visible')
    const result = await waitForPair(pair)
    const [source, target] = await result.all()

    await expect(source).toHaveAttribute('data-autofit-state', 'fit')
    await expect(source).toHaveAttribute('data-autofit-private-tier', '0')
    await expect(source).toHaveAttribute('data-autofit-tier', '0')
    await expect(source).toHaveAttribute('data-autofit-full-gaps', '0')
    await expect(source).toHaveAttribute('data-autofit-half-gaps', '3')
    await expect(target).toHaveAttribute('data-autofit-state', 'overflow')
    await expect(target).toHaveAttribute('data-autofit-private-tier', '0')
    await expect(target).toHaveAttribute('data-autofit-tier', '0')
    await expect(target).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
    await expect(target).toHaveAttribute('data-autofit-full-gaps', '1')
    await expect(target).toHaveAttribute('data-autofit-half-gaps', '0')

    const anchors = await renderedStartingAnchors(pair)
    expect(anchors[0]).toBeCloseTo(anchors[1]!, 1)
    const [observation] = await startingAlignmentObservations(page)
    expect(observation?.role).toBe('right')
    expect(observation?.targetLocalDelta).toBeGreaterThan(0)
    expect(observation?.residualBlockOffset).toBeGreaterThan(0.5)
    expect(Math.abs(observation!.finalAnchorError ?? Number.NaN)).toBeLessThanOrEqual(0.5)
    expect(warnings).toContainEqual(expect.stringContaining(scenario.warning))
    expect(warnings.some(warning => warning.includes('smallest configured tier'))).toBe(false)
    page.off('console', listener)
  }
})

test('uses the smaller private-tier role as the authoritative source plan', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-unequal')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        afterCoordinatedGapPlanApplied(
          viewport: HTMLElement,
          plan: { readonly targets: { readonly fullTarget: number } },
          application: {
            readonly result?: {
              readonly presentation: {
                readonly boundaries: readonly { readonly target: number }[]
              }
            }
          },
        ): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push({
            role: viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role'),
            sourceTarget: plan.targets.fullTarget,
            targetBoundary: application.result?.presentation.boundaries[0]?.target,
          })
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const [left, right] = await result.all()

  const tiers = await result.evaluateAll(roots => roots.map((root) => ({
    role: root.getAttribute('data-autofit-role'),
    private: root.getAttribute('data-autofit-private-tier'),
    published: root.getAttribute('data-autofit-tier'),
  })))
  const privateTiers = tiers.map(({ private: tier }) => finiteTier(tier))
  const publishedTiers = tiers.map(({ published }) => finiteTier(published))
  const sourceIndex = privateTiers[0]! < privateTiers[1]! ? 0 : 1
  const targetIndex = 1 - sourceIndex
  expect(privateTiers[sourceIndex]).toBeLessThan(privateTiers[targetIndex])
  expect(publishedTiers[0]).toBe(publishedTiers[1])
  for (const role of [left, right]) {
    await expect(role).toHaveAttribute('data-autofit-state', 'fit')
    await expect(role).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  }
  expect(await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: Array<{
      readonly role: string | null
      readonly sourceTarget: number
      readonly targetBoundary: number
    }>
  }).__autofitCoordinationTargetPlans)).toEqual([
    expect.objectContaining({
      role: tiers[targetIndex]!.role,
      sourceTarget: expect.any(Number),
      targetBoundary: expect.any(Number),
    }),
  ])
  const synchronized = await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: Array<{
      readonly sourceTarget: number
      readonly targetBoundary: number
    }>
  }).__autofitCoordinationTargetPlans?.[0])
  expect(synchronized?.targetBoundary).toBeCloseTo(synchronized!.sourceTarget, 8)
})

test('derives a missing half target from a full-only authoritative source', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-unequal-left')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        afterCoordinatedGapPlanApplied(
          viewport: HTMLElement,
          plan: {
            readonly targets: { readonly halfTarget: number }
            readonly provenance: { readonly half: string }
          },
          application: {
            readonly result?: {
              readonly presentation: {
                readonly boundaries: readonly {
                  readonly kind: string
                  readonly target: number
                }[]
              }
            }
          },
        ): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push({
            role: viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role'),
            provenance: plan.provenance.half,
            sourceTarget: plan.targets.halfTarget,
            targetBoundary: application.result?.presentation.boundaries[0],
          })
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const roleLocators = await result.all()

  const tiers = await result.evaluateAll(roots => roots.map((root) => ({
    role: root.getAttribute('data-autofit-role'),
    private: root.getAttribute('data-autofit-private-tier'),
    published: root.getAttribute('data-autofit-tier'),
  })))
  const privateTiers = tiers.map(({ private: tier }) => finiteTier(tier))
  const publishedTiers = tiers.map(({ published }) => finiteTier(published))
  const sourceIndex = privateTiers[0]! < privateTiers[1]! ? 0 : 1
  const targetIndex = 1 - sourceIndex
  const source = roleLocators[sourceIndex]!
  const target = roleLocators[targetIndex]!
  expect(privateTiers[sourceIndex]).toBeLessThan(privateTiers[targetIndex])
  expect(publishedTiers[0]).toBe(publishedTiers[1])
  await expect(source).toHaveAttribute('data-autofit-state', 'fit')
  await expect(target).toHaveAttribute('data-autofit-state', 'fit')
  for (const role of [source, target])
    await expect(role).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  await expect(target).toHaveAttribute('data-autofit-full-gaps', '0')
  await expect(target).toHaveAttribute('data-autofit-half-gaps', '3')
  const synchronized = await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: Array<{
      readonly role: string | null
      readonly provenance: string
      readonly sourceTarget: number
      readonly targetBoundary: { readonly kind: string; readonly target: number }
    }>
  }).__autofitCoordinationTargetPlans?.[0])
  expect(synchronized).toMatchObject({
    role: tiers[targetIndex]!.role,
    provenance: 'derived',
    targetBoundary: { kind: 'half' },
  })
  expect(synchronized?.targetBoundary.target).toBeCloseTo(synchronized!.sourceTarget, 8)
})

test('publishes a synchronized target overflow without a tier or alignment fallback', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning')
      warnings.push(message.text())
  })
  await page.goto('/64')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        forceCoordinatedTargetOverflow: (): boolean => true,
        afterCoordinatedGapPlanApplied(
          viewport: HTMLElement,
          plan: {
            readonly targets: { readonly fullTarget: number; readonly halfTarget: number }
          },
          application: {
            readonly result?: {
              readonly presentation: {
                readonly boundaries: readonly {
                  readonly kind: 'full' | 'half'
                  readonly target: number
                }[]
              }
            }
          },
        ): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push({
            role: viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role'),
            targets: plan.targets,
            boundaries: application.result?.presentation.boundaries.map(({ kind, target }) => ({
              kind,
              target,
            })),
          })
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const synchronized = await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: Array<{
      readonly role: string | null
      readonly targets: { readonly fullTarget: number; readonly halfTarget: number }
      readonly boundaries: readonly { readonly kind: 'full' | 'half'; readonly target: number }[]
    }>
  }).__autofitCoordinationTargetPlans)
  expect(synchronized).toEqual([
    expect.objectContaining({
      role: expect.stringMatching(/^(left|right)$/),
      boundaries: [expect.objectContaining({ kind: 'full' })],
    }),
  ])
  const target = page.locator(`[data-testid="coordination-harness"]:visible [data-autofit-role="${synchronized![0]!.role}"]`)
  const source = page.locator(`[data-testid="coordination-harness"]:visible [data-autofit-role="${synchronized![0]!.role === 'left' ? 'right' : 'left'}"]`)
  const publishedTiers = await result.evaluateAll(roots => roots.map(root =>
    root.getAttribute('data-autofit-tier'),
  ))
  const finitePublishedTiers = publishedTiers.map(finiteTier)
  expect(finitePublishedTiers[0]).toBe(finitePublishedTiers[1])
  await expect(source).toHaveAttribute('data-autofit-state', 'fit')
  await expect(target).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(target).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  await expect(target).toHaveAttribute('data-autofit-full-gaps', '1')
  await expect(target).toHaveAttribute('data-autofit-half-gaps', '0')
  for (const boundary of synchronized![0].boundaries) {
    const authoritativeTarget = boundary.kind === 'full'
      ? synchronized![0].targets.fullTarget
      : synchronized![0].targets.halfTarget
    expect(boundary.target).toBeCloseTo(authoritativeTarget, 8)
  }
  expect(warnings).toContainEqual(expect.stringContaining('required coordinated semantic gaps'))
  expect(warnings.some(warning => warning.includes('smallest configured tier'))).toBe(false)
})

test('retains exact target alignment for gap-only, alignment-only, and combined coordinated overflow warnings', async ({ page }) => {
  const cases = [
    {
      mode: 'semantic',
      forceGapOverflow: true,
      warning: 'required coordinated semantic gaps exceed',
    },
    {
      mode: 'semantic-alignment-overflow',
      forceGapOverflow: false,
      warning: 'required coordinated start alignment exceeds',
    },
    {
      mode: 'semantic-alignment-overflow',
      forceGapOverflow: true,
      warning: 'required coordinated semantic gaps and start alignment exceed',
    },
  ] as const
  for (const scenario of cases) {
    const warnings: string[] = []
    const listener = (message: { type(): string; text(): string }): void => {
      if (message.type() === 'warning')
        warnings.push(message.text())
    }
    page.on('console', listener)
    await page.goto(`/64?coordinationMode=${scenario.mode}`)
    await installStartingAlignmentObserver(page, scenario.forceGapOverflow)
    await page.locator('[data-testid="start-coordination"]:visible').click()
    const pair = page.locator('[data-testid="coordination-harness"]:visible')
    const result = await waitForPair(pair)
    const [observation] = await startingAlignmentObservations(page)
    expect(observation?.role).toMatch(/^(left|right)$/)
    const target = pair.locator(`[data-autofit-role="${observation!.role}"]`)
    const source = pair.locator(`[data-autofit-role="${observation!.role === 'left' ? 'right' : 'left'}"]`)
    const states = await result.evaluateAll(roots => roots.map(root =>
      root.getAttribute('data-autofit-state'),
    ))
    const publishedTiers = await result.evaluateAll(roots => roots.map(root =>
      root.getAttribute('data-autofit-tier'),
    ))
    expect(states.filter(state => state === 'overflow')).toHaveLength(1)
    expect(states.filter(state => state === 'fit')).toHaveLength(1)
    const finitePublishedTiers = publishedTiers.map(finiteTier)
    expect(finitePublishedTiers[0]).toBe(finitePublishedTiers[1])
    await expect(source).toHaveAttribute('data-autofit-state', 'fit')
    await expect(target).toHaveAttribute('data-autofit-state', 'overflow')
    await expect(target).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
    const anchors = await renderedStartingAnchors(pair)
    expect(anchors[0]).toBeCloseTo(anchors[1]!, 1)
    expect(observation?.terminal).toBe('synchronized-overflow')
    expect(Math.abs(observation!.finalAnchorError ?? Number.NaN)).toBeLessThanOrEqual(0.5)
    expect(warnings).toContainEqual(expect.stringContaining(scenario.warning))
    expect(warnings.some(warning => warning.includes('smallest configured tier'))).toBe(false)
    page.off('console', listener)
  }
})

test('publishes finite coordinated-gap mismatches as target-only unsupported without verified gaps', async ({ page }) => {
  await page.goto('/64')
  await page.evaluate(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCoordinatedGapVerificationFailure: (): boolean => true,
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const [target, source] = await result.all()

  await expect(source).toHaveAttribute('data-autofit-state', 'fit')
  await expect(source).toHaveAttribute('data-autofit-tier', '0')
  await expect(target).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(target).toHaveAttribute('data-autofit-unsupported-reason', 'coordinated-gap-verification')
  await expect(target).not.toHaveAttribute('data-autofit-tier')
  await expect(target).not.toHaveAttribute('data-autofit-full-gaps')
  await expect(target).not.toHaveAttribute('data-autofit-half-gaps')
})

test('publishes a fitted coordinated start mismatch as target-only unsupported', async ({ page }) => {
  await page.goto('/64')
  await page.evaluate(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCoordinatedStartAlignmentVerificationFailure: (): boolean => true,
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const [target, source] = await result.all()

  await expect(source).toHaveAttribute('data-autofit-state', 'fit')
  await expect(source).toHaveAttribute('data-autofit-tier', '0')
  await expect(target).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(target).toHaveAttribute(
    'data-autofit-unsupported-reason',
    'coordinated-start-alignment-verification',
  )
  await expect(target).not.toHaveAttribute('data-autofit-tier')
  await expect(target).not.toHaveAttribute('data-autofit-scale')
})

test('keeps selected-source candidate-anchor failure in the common-tier fallback while target anchor failure stays target-only', async ({ page }) => {
  for (const sourceReason of ['visual-rect-missing', 'visual-edge-nonfinite'] as const) {
    await page.goto('/64')
    await page.evaluate((sourceReason) => {
      Object.assign(window, {
        __slidevAutofitTestHooks: {
          forceCoordinatedCandidateAnchorUnsupportedReason(viewport: HTMLElement): string | null {
            return viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role') === 'right'
              ? sourceReason
              : null
          },
        },
      })
    }, sourceReason)
    await page.locator('[data-testid="start-coordination"]:visible').click()
    const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
    const [target, source] = await result.all()
    await expect(source).toHaveAttribute('data-autofit-state', 'unsupported')
    await expect(source).toHaveAttribute('data-autofit-unsupported-reason', sourceReason)
    await expect(source).not.toHaveAttribute('data-autofit-tier')
    await expect(target).toHaveAttribute('data-autofit-state', 'fit')
    await expect(target).toHaveAttribute('data-autofit-tier', '0')
  }

  await page.goto('/64?coordinationMode=semantic-unequal')
  await installPublicationObserver(page)
  await page.evaluate(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCoordinatedCandidateAnchorUnsupportedReason(viewport: HTMLElement): string | null {
          return viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role') === 'right'
            ? 'visual-edge-nonfinite'
            : null
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const unequal = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const unequalRoles = await unequal.all()
  const unequalTiers = await unequal.evaluateAll(roots => roots.map((root) => ({
    state: root.getAttribute('data-autofit-state'),
    private: root.getAttribute('data-autofit-private-tier'),
    published: root.getAttribute('data-autofit-tier'),
  })))
  const privateTiers = unequalTiers.map(({ private: tier }) => finiteTier(tier))
  const unsupportedIndex = unequalTiers.findIndex(({ state }) => state === 'unsupported')
  expect(unsupportedIndex).toBeGreaterThanOrEqual(0)
  const targetIndex = 1 - unsupportedIndex
  const unaffectedTarget = unequalRoles[targetIndex]!
  const unsupportedSource = unequalRoles[unsupportedIndex]!
  expect(privateTiers[unsupportedIndex]).toBeLessThan(
    privateTiers[targetIndex],
  )
  await expect(unaffectedTarget).toHaveAttribute('data-autofit-state', 'fit')
  expect(finiteTier(unequalTiers[targetIndex]!.published)).toBe(privateTiers[targetIndex])
  await expect(unsupportedSource).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(unsupportedSource).toHaveAttribute('data-autofit-unsupported-reason', 'visual-edge-nonfinite')
  await expect(unsupportedSource).not.toHaveAttribute('data-autofit-tier')
  await expect(unsupportedSource).not.toHaveAttribute('data-autofit-scale')
  await expectOnlyAtomicPublication(page)

  await page.goto('/64')
  await page.evaluate(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCoordinatedVisualUnsupportedReason: (): string => 'visual-edge-nonfinite',
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const [targetFailure, validSource] = await result.all()
  await expect(validSource).toHaveAttribute('data-autofit-state', 'fit')
  await expect(validSource).toHaveAttribute('data-autofit-tier', '0')
  await expect(targetFailure).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(targetFailure).toHaveAttribute('data-autofit-unsupported-reason', 'visual-edge-nonfinite')
  await expect(targetFailure).not.toHaveAttribute('data-autofit-tier')
})

test('preserves a typed coordinated target visual failure over the generic mismatch reason', async ({ page }) => {
  await page.goto('/64')
  await page.evaluate(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCoordinatedVisualUnsupportedReason: (): string => 'visual-edge-nonfinite',
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const [target, source] = await result.all()

  await expect(source).toHaveAttribute('data-autofit-state', 'fit')
  await expect(target).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(target).toHaveAttribute('data-autofit-unsupported-reason', 'visual-edge-nonfinite')
})

test('skips synchronization for a requested bottom pair while retaining common-tier local presentations', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-bottom')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        afterCoordinatedGapPlanApplied(): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push(true)
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))

  for (const role of await result.all()) {
    await expect(role).toHaveAttribute('data-autofit-state', 'fit')
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
    await expect(role).toHaveAttribute('data-autofit-effective-alignment', 'bottom')
  }
  expect(await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: unknown[]
  }).__autofitCoordinationTargetPlans)).toEqual([])
})

test('skips synchronization for boundary-free and effective-middle sources', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-boundary-free')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        afterCoordinatedGapPlanApplied(): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push(true)
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  let result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  for (const role of await result.all()) {
    await expect(role).toHaveAttribute('data-autofit-state', 'fit')
    await expect(role).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
    await expect(role).toHaveAttribute('data-autofit-full-gaps', '0')
  }
  expect(await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: unknown[]
  }).__autofitCoordinationTargetPlans)).toEqual([])

  await page.goto('/64')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        forceDistributedVerificationFailure: (): boolean => true,
        afterCoordinatedGapPlanApplied(): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push(true)
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  for (const role of await result.all()) {
    await expect(role).toHaveAttribute('data-autofit-state', 'fit')
    await expect(role).toHaveAttribute('data-autofit-effective-alignment', 'middle')
  }
  expect(await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: unknown[]
  }).__autofitCoordinationTargetPlans)).toEqual([])
})

test('synchronizes a boundary-free target while retaining its local padding and zero boundary counts', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-target-free')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPresentations: [] as unknown[],
      __slidevAutofitTestHooks: {
        afterCoordinatedGapPlanApplied(
          viewport: HTMLElement,
          _plan: unknown,
          application: {
            readonly result?: { readonly presentation: { readonly alignment: unknown } }
          },
          localResult: { readonly presentation: { readonly alignment: unknown } },
        ): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPresentations?: unknown[]
          }).__autofitCoordinationTargetPresentations?.push({
            role: viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role'),
            synchronizedPadding: application.result?.presentation.alignment,
            localPadding: localResult.presentation.alignment,
          })
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const [source, target] = await result.all()

  await expect(source).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  await expect(target).toHaveAttribute('data-autofit-state', 'fit')
  await expect(target).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  await expect(target).toHaveAttribute('data-autofit-full-gaps', '0')
  await expect(target).toHaveAttribute('data-autofit-half-gaps', '0')
  expect(await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPresentations?: Array<{
      readonly role: string | null
      readonly synchronizedPadding: unknown
      readonly localPadding: unknown
    }>
  }).__autofitCoordinationTargetPresentations)).toEqual([
    {
      role: 'right',
      synchronizedPadding: expect.any(Object),
      localPadding: expect.any(Object),
    },
  ])
  const padding = await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPresentations?: Array<{
      readonly synchronizedPadding: unknown
      readonly localPadding: unknown
    }>
  }).__autofitCoordinationTargetPresentations?.[0])
  expect(padding?.synchronizedPadding).not.toEqual(padding?.localPadding)
  const synchronizedPadding = padding?.synchronizedPadding as {
    readonly before: number
    readonly after: number
  }
  const localPadding = padding?.localPadding as {
    readonly before: number
    readonly after: number
  }
  expect(synchronizedPadding.before + synchronizedPadding.after).toBeCloseTo(
    localPadding.before + localPadding.after,
    8,
  )
})

test('keeps distributed alignment and padding local when only its sibling overflows', async ({ page }) => {
  await page.goto('/69')
  await page.evaluate(() => {
    Object.assign(window, {
      __autofitCoordinationTargetPlans: [] as unknown[],
      __slidevAutofitTestHooks: {
        afterCoordinatedGapPlanApplied(): void {
          ;(window as typeof window & {
            __autofitCoordinationTargetPlans?: unknown[]
          }).__autofitCoordinationTargetPlans?.push(true)
        },
      },
    })
  })
  await installPublicationObserver(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const result = await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
  const left = result.nth(0)
  const right = result.nth(1)

  for (const role of [left, right]) {
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
    await expect(role).toHaveAttribute('data-autofit-scale', '0.6')
  }
  await expect(left).toHaveAttribute('data-autofit-state', 'fit')
  await expect(left).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  await expect(left).toHaveAttribute('data-autofit-full-gaps', '1')
  await expect(left).toHaveAttribute('data-autofit-half-gaps', '0')
  await expect(left.locator('.autofit__diagnostics')).toHaveText('')
  await expect(right).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(right).toHaveAttribute('data-autofit-effective-alignment', 'top')
  await expect(right).toHaveAttribute('data-autofit-full-gaps', '0')
  await expect(right).toHaveAttribute('data-autofit-half-gaps', '0')
  await expect(right.locator('.autofit__overflow-badge')).toHaveCount(1)

  const presentation = await result.evaluateAll((roots) => roots.map((root) => {
    const style = getComputedStyle(root.querySelector<HTMLElement>('.autofit__flow')!)
    return {
      paddingBefore: Number.parseFloat(style.paddingBlockStart),
      paddingAfter: Number.parseFloat(style.paddingBlockEnd),
    }
  }))
  expect(presentation[0].paddingBefore).toBeGreaterThan(0)
  expect(presentation[0].paddingBefore).toBeCloseTo(presentation[0].paddingAfter, 4)
  expect(presentation[1].paddingBefore).toBe(0)
  expect(presentation[1].paddingAfter).toBe(0)
  expect(await page.evaluate(() => (window as typeof window & {
    __autofitCoordinationTargetPlans?: unknown[]
  }).__autofitCoordinationTargetPlans)).toEqual([])
  await expectOnlyAtomicPublication(page)
})

async function waitForHeldSemanticPair(page: Page, pair: Locator): Promise<number> {
  await expect(pair).toBeAttached()
  let previous = ''
  await expect.poll(async () => {
    await waitForAnimationFrames(page, 2)
    const common = (await heldAutoColumnBarriers(page))
      .filter(callback => callback.barrier === 'local-common')
    const current = JSON.stringify(common)
    const latestEpoch = Math.max(...common.map(callback => callback.epoch))
    const latestEpochComplete = Number.isFinite(latestEpoch)
      && ['left', 'right'].every(role =>
        common.some(callback => callback.epoch === latestEpoch && callback.role === role),
      )
    const stable = latestEpochComplete && current === previous
    previous = current
    return stable
  }).toBe(true)
  const common = (await heldAutoColumnBarriers(page))
    .filter(callback => callback.barrier === 'local-common')
  const epoch = Math.max(...common.map(callback => callback.epoch))
  expect(common.filter(callback => callback.epoch === epoch)).toEqual([
    expect.objectContaining({ role: 'left', epoch }),
    expect.objectContaining({ role: 'right', epoch }),
  ])
  return epoch
}

async function startHeldSemanticPair(page: Page, query = ''): Promise<{
  readonly pair: Locator
  readonly epoch: number
}> {
  await page.goto(`/64${query}`)
  await waitForPageAssets(page)
  await installAutoColumnBarrierHolds(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  return { pair, epoch: await waitForHeldSemanticPair(page, pair) }
}

async function releaseHeldLocalCommon(
  page: Page,
  epoch: number,
  rolesInCompletionOrder: readonly ('left' | 'right')[],
): Promise<HeldAutoColumnBarrier> {
  await page.evaluate(async ({ epoch, rolesInCompletionOrder }) => {
    const target = window as typeof window & {
      __autofitCoordinationHeldBarriers?: Array<{
        readonly barrier: AutoColumnBarrier
        readonly role: 'left' | 'right'
        readonly epoch: number
        readonly callback: () => void
      }>
    }
    const callbacks = target.__autofitCoordinationHeldBarriers ?? []
    for (const role of rolesInCompletionOrder) {
      const index = callbacks.findIndex(callback =>
        callback.barrier === 'local-common'
        && callback.role === role
        && callback.epoch === epoch,
      )
      if (index < 0)
        throw new Error(`expected held local-common callback for ${role} epoch ${epoch}`)
      callbacks.splice(index, 1)[0].callback()
    }
    await new Promise<void>(resolve => queueMicrotask(resolve))
  }, { epoch, rolesInCompletionOrder })
  await expect.poll(async () => {
    return (await heldAutoColumnBarriers(page))
      .filter(callback => callback.barrier === 'target-synchronization' && callback.epoch === epoch)
  }).toHaveLength(1)
  return (await heldAutoColumnBarriers(page)).find(callback =>
    callback.barrier === 'target-synchronization' && callback.epoch === epoch,
  )!
}

test('chooses and publishes the same authority plan in both local common-tier completion orders', async ({ page }) => {
  async function complete(
    pair: Locator,
    epoch: number,
    rolesInCompletionOrder: readonly ('left' | 'right')[],
    firstPresentation: boolean,
  ): Promise<Awaited<ReturnType<typeof coordinatedAlignedTerminalSnapshot>>> {
    const synchronization = await releaseHeldLocalCommon(page, epoch, rolesInCompletionOrder)
    expect(synchronization.role).toBe('left')
    if (firstPresentation)
      await expectPrivatePairHidden(pair)
    const source = (await autoColumnLocalPresentations(page)).find(presentation =>
      presentation.role === 'right' && presentation.epoch === epoch,
    )
    expect(source).toBeDefined()
    await releaseAutoColumnBarrier(page, synchronization)
    await waitForPair(pair)
    const plans = await autoColumnTargetPlans(page)
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({ role: 'left' })
    if (source!.full !== null) {
      expect(plans[0]!.fullTarget).toBe(source!.full)
      expect(plans[0]!.halfTarget).toBe(source!.full / 2)
    }
    else {
      expect(source!.half).not.toBeNull()
      expect(plans[0]!.halfTarget).toBe(source!.half)
      expect(plans[0]!.fullTarget).toBe(source!.half! * 2)
    }
    return coordinatedAlignedTerminalSnapshot(pair)
  }

  const { pair, epoch } = await startHeldSemanticPair(page)
  await expectPrivatePairHidden(pair)
  const first = await complete(pair, epoch, ['right', 'left'], true)

  await installAutoColumnBarrierHolds(page)
  await page.locator('[data-autofit-role="left"]:visible').dispatchEvent('slidev-autofit-test-supersede')
  const targetEpoch = await waitForHeldSemanticPair(page, pair)
  const second = await complete(pair, targetEpoch, ['left', 'right'], false)
  expect(second).toEqual(first)
})

test('discards held local common-tier work when invalidated before authority selection', async ({ page }) => {
  const { pair, epoch } = await startHeldSemanticPair(page)
  const left = (await heldAutoColumnBarriers(page)).find(callback =>
    callback.barrier === 'local-common' && callback.role === 'left' && callback.epoch === epoch,
  )!
  const right = (await heldAutoColumnBarriers(page)).find(callback =>
    callback.barrier === 'local-common' && callback.role === 'right' && callback.epoch === epoch,
  )!
  await releaseAutoColumnBarrier(page, left)
  await page.locator('[data-autofit-role="left"]').dispatchEvent('slidev-autofit-test-supersede')
  await releaseAutoColumnBarrier(page, right)
  expect(await autoColumnBarrierDispatches(page)).toEqual([
    { barrier: 'local-common', role: 'left', epoch },
  ])
  await expectPrivatePairHidden(pair)

  await clearAutoColumnBarrierHolds(page)
  await page.locator('[data-autofit-role="left"]').dispatchEvent('slidev-autofit-test-supersede')
  await waitForPair(pair)
})

for (const [description, supersedes] of [
  ['invalidation', 1],
  ['supersession', 2],
] as const) {
  test(`discards a held target synchronization callback after ${description}`, async ({ page }) => {
    const { pair, epoch } = await startHeldSemanticPair(page)
    const synchronization = await releaseHeldLocalCommon(page, epoch, ['left', 'right'])
    for (let count = 0; count < supersedes; count += 1)
      await page.locator('[data-autofit-role="left"]').dispatchEvent('slidev-autofit-test-supersede')
    await releaseAutoColumnBarrier(page, synchronization)
    expect(await autoColumnBarrierDispatches(page)).toEqual([
      { barrier: 'local-common', role: 'left', epoch },
      { barrier: 'local-common', role: 'right', epoch },
    ])
    await expectPrivatePairHidden(pair)

    await clearAutoColumnBarrierHolds(page)
    await page.locator('[data-autofit-role="left"]').dispatchEvent('slidev-autofit-test-supersede')
    await waitForPair(pair)
  })
}

for (const [presentation, cancel] of [
  ['first presentation', false],
  ['subsequent presentation', false],
  ['first presentation', true],
  ['subsequent presentation', true],
] as const) {
  test(`retains the ${presentation === 'first presentation' ? 'hidden initial state' : 'compatible pair'} when synchronization is ${cancel ? 'cancelled' : 'deferred'} `, async ({ page }) => {
    let pair: Locator
    let epoch: number
    let priorPresentation: unknown = null
    if (presentation === 'subsequent presentation') {
      await page.goto('/64')
      await page.locator('[data-testid="start-coordination"]:visible').click()
      pair = page.locator('[data-testid="coordination-harness"]:visible')
      await waitForPair(pair)
      priorPresentation = await coordinatedPresentationSnapshot(pair)
      await installAutoColumnBarrierHolds(page)
      await page.locator('[data-autofit-role="left"]:visible').dispatchEvent('slidev-autofit-test-supersede')
      epoch = await waitForHeldSemanticPair(page, pair)
    }
    else {
      ({ pair, epoch } = await startHeldSemanticPair(page))
    }
    const synchronization = await releaseHeldLocalCommon(page, epoch, ['left', 'right'])
    if (presentation === 'first presentation')
      await expectPrivatePairHidden(pair)
    else
      expect(await coordinatedPresentationSnapshot(pair)).toEqual(priorPresentation)

    if (cancel) {
      await page.locator('[data-testid="coordination-unmount"]:visible').click()
      await expect(pair).toHaveCount(0)
      await releaseAutoColumnBarrier(page, synchronization)
      expect(await autoColumnBarrierDispatches(page)).toEqual([
        { barrier: 'local-common', role: 'left', epoch },
        { barrier: 'local-common', role: 'right', epoch },
      ])
      await clearAutoColumnBarrierHolds(page)
      await page.locator('[data-testid="coordination-remount"]:visible').click()
      await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
      return
    }

    await page.locator('[data-autofit-role="left"]').dispatchEvent('slidev-autofit-test-supersede')
    await releaseAutoColumnBarrier(page, synchronization)
    expect(await autoColumnBarrierDispatches(page)).toEqual([
      { barrier: 'local-common', role: 'left', epoch },
      { barrier: 'local-common', role: 'right', epoch },
    ])
    if (presentation === 'first presentation')
      await expectPrivatePairHidden(pair)
    else
      expect(await coordinatedPresentationSnapshot(pair)).toEqual(priorPresentation)

    await clearAutoColumnBarrierHolds(page)
    await page.locator('[data-autofit-role="left"]').dispatchEvent('slidev-autofit-test-supersede')
    await waitForPair(pair)
  })
}

test('rejects a held old synchronization callback across unmount and remount', async ({ page }) => {
  const { pair, epoch } = await startHeldSemanticPair(page)
  const synchronization = await releaseHeldLocalCommon(page, epoch, ['left', 'right'])
  await page.locator('[data-testid="coordination-unmount"]:visible').click()
  await expect(pair).toHaveCount(0)
  await releaseAutoColumnBarrier(page, synchronization)
  expect(await autoColumnBarrierDispatches(page)).toEqual([
    { barrier: 'local-common', role: 'left', epoch },
    { barrier: 'local-common', role: 'right', epoch },
  ])
  await clearAutoColumnBarrierHolds(page)
  await page.locator('[data-testid="coordination-remount"]:visible').click()
  await waitForPair(page.locator('[data-testid="coordination-harness"]:visible'))
})

test('uses only current metadata when reactive content reverses semantic authority', async ({ page }) => {
  await page.goto('/64?coordinationMode=semantic-reactive')
  await installAutoColumnBarrierHolds(page)
  await clearAutoColumnBarrierHolds(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  await waitForPair(pair)
  expect(await autoColumnTargetPlans(page)).toEqual([
    expect.objectContaining({ role: 'left' }),
  ])

  await installAutoColumnBarrierHolds(page)
  await page.locator('[data-testid="coordination-toggle-semantic-source"]:visible').click()
  await expect.poll(async () => {
    return (await heldAutoColumnBarriers(page))
      .filter(callback => callback.barrier === 'local-common')
      .length
  }).toBeGreaterThanOrEqual(2)
  await expectPrivatePairHidden(pair)
  // The reactive slot replacement can enqueue a newer epoch while Playwright
  // is checking the retained pair. Release only that current pair; earlier
  // held callbacks deliberately remain stale lifecycle coverage.
  await page.evaluate(() => new Promise<void>(resolve => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  const common = (await heldAutoColumnBarriers(page))
    .filter(callback => callback.barrier === 'local-common')
  const epoch = Math.max(...common.map(callback => callback.epoch))
  expect(common.filter(callback => callback.epoch === epoch)).toEqual([
    expect.objectContaining({ role: 'left', epoch }),
    expect.objectContaining({ role: 'right', epoch }),
  ])
  const synchronization = await releaseHeldLocalCommon(page, epoch, ['right', 'left'])
  expect(synchronization.role).toBe('right')
  await releaseAutoColumnBarrier(page, synchronization)
  await waitForPair(pair)
  expect(await autoColumnTargetPlans(page)).toEqual([
    expect.objectContaining({ role: 'right' }),
  ])
})

test('restores authored neutral styles when target topology changes during stale synchronization', async ({ page }) => {
  await page.goto('/64')
  await waitForPageAssets(page)
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  await waitForPair(pair)
  await waitForAutofitLifecycleIdle(page)

  await installTargetSynchronizationTopologyInvalidation(page)
  await page.locator('[data-autofit-role="left"]:visible').dispatchEvent('slidev-autofit-test-supersede')
  await expect.poll(async () => coordinatedTopologyInvalidationSnapshots(page)).toHaveLength(1)
  expect((await coordinatedTopologyInvalidationSnapshots(page))[0]).toMatchObject({
    existingGeneratedDeclarations: expect.any(Number),
    restoredGeneratedDeclarations: 0,
  })
  expect((await coordinatedTopologyInvalidationSnapshots(page))[0]!.existingGeneratedDeclarations)
    .toBeGreaterThan(0)

  await waitForPair(pair)
})

for (const [description, supersedes] of [
  ['invalidation', 1],
  ['supersession', 2],
] as const) {
  for (const step of [
    'after-gap-mutation',
    'after-target-anchor',
    'after-alignment-mutation',
    'after-final-reads',
  ] as const) {
    test(`restores the compatible pair when ${description} occurs ${step}`, async ({ page }) => {
      await page.goto('/64')
      await waitForPageAssets(page)
      await page.locator('[data-testid="start-coordination"]:visible').click()
      const pair = page.locator('[data-testid="coordination-harness"]:visible')
      await waitForPair(pair)
      await waitForAutofitLifecycleIdle(page)
      const priorPresentation = await coordinatedPresentationSnapshot(pair)
      const priorBatchIds = await (await roles(pair)).evaluateAll(roots =>
        roots.map(root => root.getAttribute('data-autofit-batch-id')),
      )

      await installTargetSynchronizationInvalidation(page, step, supersedes)
      await page.locator('[data-autofit-role="left"]:visible').dispatchEvent('slidev-autofit-test-supersede')
      await expect.poll(async () => coordinatedCheckpointSnapshots(page)).toHaveLength(1)
      expect((await coordinatedCheckpointSnapshots(page))[0]).toEqual({
        step,
        presentation: priorPresentation,
      })

      await waitForPair(pair)
      await expect.poll(async () => (await roles(pair)).evaluateAll(roots =>
        roots.map(root => root.getAttribute('data-autofit-batch-id')),
      )).not.toEqual(priorBatchIds)
      await expect.poll(async () => coordinatedCheckpointTerminals(page)).toHaveLength(1)
      const [terminal] = await coordinatedCheckpointTerminals(page)
      expect(terminal).toMatchObject({ terminal: 'synchronized-fit' })
      expect(Math.abs(terminal!.finalAnchorError ?? Number.NaN)).toBeLessThanOrEqual(0.5)
    })
  }
}

for (const mutation of [
  'origin',
  'size',
  'scale',
  'pair-host-scale',
  'nonfinite',
] as const) {
  test(`discards an incompatible ${mutation} source coordinate snapshot and obtains a fresh pair`, async ({ page }) => {
    const { pair, epoch } = await startHeldSemanticPair(page)
    const synchronization = await releaseHeldLocalCommon(page, epoch, ['left', 'right'])
    await clearAutoColumnBarrierHolds(page)
    await releaseSynchronizationAfterSourceMutation(page, synchronization, mutation)

    const oldEpochTargetDispatches = (await autoColumnBarrierDispatches(page))
      .filter(dispatch => dispatch.barrier === 'target-synchronization' && dispatch.epoch === epoch)
    expect(oldEpochTargetDispatches).toEqual([])
    await waitForPair(pair)
    expect((await autoColumnBarrierDispatches(page)).some(dispatch =>
      dispatch.barrier === 'target-synchronization' && dispatch.epoch > epoch,
    )).toBe(true)
  })
}

for (const role of ['left', 'right'] as const) {
test(`holds the exact prior pair through every private and common-tier frame when ${role} invalidates`, async ({ page }) => {
  const pair = await start(page, 70)
  const initial = await waitForPair(pair)
  for (const role of await initial.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
  const priorPresentation = await coordinatedPresentationSnapshot(pair)

  await holdFrames(page)
  await page.getByTestId(`coordination-toggle-${role}-density`).click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)
  let heldFrames = 0
  let replaced = false
  for (let frame = 0; frame < 24; frame += 1) {
    const queued = await page.evaluate(() => {
      return (window as typeof window & {
        __autofitCoordinationFrames?: FrameRequestCallback[]
      }).__autofitCoordinationFrames?.length ?? 0
    })
    if (queued === 0)
      break
    expect(await coordinatedPresentationSnapshot(pair)).toEqual(priorPresentation)
    heldFrames += 1
    await releaseOneFrame(page)
    const snapshot = await coordinatedPresentationSnapshot(pair)
    if (JSON.stringify(snapshot) === JSON.stringify(priorPresentation)) {
      continue
    }
    replaced = true
    for (const root of await (await roles(pair)).all())
      await expect(root).toHaveAttribute('data-autofit-tier', '-4')
    break
  }
  expect(heldFrames).toBeGreaterThan(0)
  expect(replaced).toBe(true)
  await restoreFrames(page)
  const replacement = await waitForPair(pair)
  for (const role of await replacement.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
})
}

test('cancels the shared pair on unmount and starts cleanly after remount', async ({ page }) => {
  const pair = await start(page, 70)
  await waitForPair(pair)
  await waitForAutofitLifecycleIdle(page)
  await page.evaluate(() => {
    (window as typeof window & {
      __slidevAutofitDebug?: { reset(): void }
    }).__slidevAutofitDebug?.reset()
  })
  await holdFrames(page)
  await page.getByTestId('coordination-toggle-left-density').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)
  await page.getByTestId('coordination-unmount').click()
  await expect(pair).toHaveCount(0)
  await restoreFrames(page)
  await page.waitForTimeout(30)
  const discardedAfterUnmount = await page.evaluate(() => {
    return (window as typeof window & {
      __slidevAutofitDebug?: {
        readonly snapshot: {
          readonly batchCount: number
          readonly discardedJobCount: number
          readonly candidateMeasurements: readonly unknown[]
        }
      }
    }).__slidevAutofitDebug?.snapshot
  })
  expect(discardedAfterUnmount).toMatchObject({
    batchCount: 0,
    candidateMeasurements: [],
  })
  expect(discardedAfterUnmount?.discardedJobCount).toBeGreaterThanOrEqual(2)
  await page.getByTestId('coordination-remount').click()
  const remounted = page.locator('[data-testid="coordination-harness"]:visible')
  const result = await waitForPair(remounted)
  for (const role of await result.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
})

test('supersedes both active coordinated jobs and prevents held old callbacks from committing', async ({ page }) => {
  const pair = await start(page, 70)
  await waitForPair(pair)
  await page.evaluate(() => {
    (window as typeof window & {
      __slidevAutofitDebug?: { reset(): void }
    }).__slidevAutofitDebug?.reset()
  })
  await holdFrames(page)
  await page.getByTestId('coordination-toggle-left-density').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)
  await page.getByTestId('coordination-toggle-right-density').click()
  await restoreFrames(page)
  const replacement = await waitForPair(pair)
  for (const role of await replacement.all()) {
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
    await expect(role).toHaveAttribute('data-autofit-state', 'overflow')
  }
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __slidevAutofitDebug?: {
        readonly snapshot: { readonly discardedJobCount: number }
      }
    }).__slidevAutofitDebug?.snapshot.discardedJobCount ?? 0
  })).toBeGreaterThanOrEqual(2)
})

test('hides both coordinated viewports for an incompatible topology replacement', async ({ page }) => {
  const pair = await start(page, 70)
  await waitForPair(pair)
  await holdFrames(page)
  await page.getByTestId('coordination-toggle-topology').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)
  for (const role of await (await roles(pair)).all())
    await expect(role.locator('.autofit__viewport')).toHaveCSS('visibility', 'hidden')
  await restoreFrames(page)
  const replacement = await waitForPair(pair)
  for (const role of await replacement.all())
    await expect(role.locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
})

for (const [terminal, state] of [
  ['empty', 'fit'],
  ['unsupported', 'unsupported'],
] as const) {
  test(`hides both viewports before atomically publishing a nonempty-to-${terminal} topology terminal`, async ({ page }) => {
    const pair = await start(page, 70)
    await waitForPair(pair)
    await holdFrames(page)
    await page.getByTestId(`coordination-toggle-left-${terminal}`).click()
    await expect.poll(() => page.evaluate(() => {
      return (window as typeof window & {
        __autofitCoordinationFrames?: FrameRequestCallback[]
      }).__autofitCoordinationFrames?.length ?? 0
    })).toBeGreaterThan(0)
    for (const role of await (await roles(pair)).all())
      await expect(role.locator('.autofit__viewport')).toHaveCSS('visibility', 'hidden')
    await expect(page.locator('[data-testid="start-coordination"]:visible')).toBeVisible()
    await expect(page.locator(`[data-testid="coordination-toggle-left-${terminal}"]:visible`)).toBeVisible()

    await restoreFrames(page)
    const result = await waitForPair(pair)
    await expect(result.nth(0)).toHaveAttribute('data-autofit-state', state)
    if (terminal === 'empty')
      await expect(result.nth(0)).toHaveAttribute('data-autofit-empty', 'true')
    else
      await expect(result.nth(0)).toHaveAttribute('data-autofit-unsupported-reason')
    await expect(result.nth(1)).toHaveAttribute('data-autofit-state', 'fit')
    await expect(result.nth(1)).toHaveAttribute('data-autofit-tier', '0')
  })
}

test('retains the compatible pair after deferred common-tier work and recovers on a later epoch', async ({ page }) => {
  const pair = await start(page, 70)
  await waitForPair(pair)
  await holdFrames(page)
  await page.getByTestId('coordination-toggle-left-density').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)

  let privatePairReady = false
  for (let frame = 0; frame < 12; frame += 1) {
    await releaseOneFrame(page)
    const privateTiers = await (await roles(pair)).evaluateAll(roots =>
      roots.map(root => root.getAttribute('data-autofit-private-tier')),
    )
    if (privateTiers[0] === '-4' && privateTiers[1] === '0') {
      privatePairReady = true
      break
    }
  }
  expect(privatePairReady).toBe(true)

  await (await roles(pair)).nth(1).locator('.autofit__viewport').evaluate((viewport) => {
    const original = viewport.getBoundingClientRect.bind(viewport)
    Object.assign(viewport, { __autofitOriginalRect: original })
    viewport.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
  })
  await releaseOneFrame(page)
  await page.waitForTimeout(20)
  for (const role of await (await roles(pair)).all()) {
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
    await expect(role.locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
  }

  await (await roles(pair)).nth(1).locator('.autofit__viewport').evaluate((viewport) => {
    const target = viewport as HTMLElement & {
      __autofitOriginalRect?: typeof viewport.getBoundingClientRect
    }
    viewport.getBoundingClientRect = target.__autofitOriginalRect!
    delete target.__autofitOriginalRect
  })
  await restoreFrames(page)
  await page.getByTestId('coordination-toggle-right-density').click()
  const replacement = await waitForPair(pair)
  for (const role of await replacement.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
})

test('discards prepared common-tier work for an unsupported discovery and publishes fallback', async ({ page }) => {
  const pair = await start(page, 70)
  await waitForPair(pair)
  await holdFrames(page)
  await page.getByTestId('coordination-toggle-left-density').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)

  let privatePairReady = false
  for (let frame = 0; frame < 12; frame += 1) {
    await releaseOneFrame(page)
    const privateTiers = await (await roles(pair)).evaluateAll(roots =>
      roots.map(root => root.getAttribute('data-autofit-private-tier')),
    )
    if (privateTiers[0] === '-4' && privateTiers[1] === '0') {
      privatePairReady = true
      break
    }
  }
  expect(privatePairReady).toBe(true)
  await (await roles(pair)).nth(1).evaluate((root) => {
    root.setAttribute('data-autofit-test-force-unsupported', 'base-gap-verification')
  })
  await restoreFrames(page)

  const result = await waitForPair(pair)
  await expect(result.nth(0)).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(result.nth(0)).toHaveAttribute('data-autofit-tier', '-4')
  await expect(result.nth(1)).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(result.nth(1)).not.toHaveAttribute('data-autofit-tier')
})

test('retains the compatible pair after a measured common-tier non-fit without retrying', async ({ page }) => {
  const pair = await start(page, 70)
  await waitForPair(pair)
  await holdFrames(page)
  await page.getByTestId('coordination-toggle-left-density').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)

  let privatePairReady = false
  for (let frame = 0; frame < 12; frame += 1) {
    await releaseOneFrame(page)
    const privateTiers = await (await roles(pair)).evaluateAll(roots =>
      roots.map(root => root.getAttribute('data-autofit-private-tier')),
    )
    if (privateTiers[0] === '-4' && privateTiers[1] === '0') {
      privatePairReady = true
      break
    }
  }
  expect(privatePairReady).toBe(true)

  await (await roles(pair)).nth(1).locator('.autofit__flow').evaluate((flow) => {
    const original = Object.getOwnPropertyDescriptor(flow, 'scrollHeight')
    Object.defineProperty(flow, 'scrollHeight', { configurable: true, get: () => 10_000 })
    Object.assign(flow, { __autofitOriginalScrollHeight: original })
  })
  await releaseOneFrame(page)
  await page.waitForTimeout(40)
  for (const role of await (await roles(pair)).all())
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
  await page.waitForTimeout(100)
  for (const role of await (await roles(pair)).all())
    await expect(role).toHaveAttribute('data-autofit-tier', '0')

  await (await roles(pair)).nth(1).locator('.autofit__flow').evaluate((flow) => {
    const target = flow as HTMLElement & {
      __autofitOriginalScrollHeight?: PropertyDescriptor
    }
    if (target.__autofitOriginalScrollHeight)
      Object.defineProperty(flow, 'scrollHeight', target.__autofitOriginalScrollHeight)
    else
      delete (flow as { scrollHeight?: number }).scrollHeight
    delete target.__autofitOriginalScrollHeight
  })
  await restoreFrames(page)
  await page.getByTestId('coordination-toggle-right-density').click()
  const recovery = await waitForPair(pair)
  for (const role of await recovery.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
})

test('rejects a cached common-tier non-fit while retaining a compatible pair and recovers only after invalidation', async ({ page }) => {
  const pair = await start(page, 70)
  await waitForPair(pair)
  await waitForAutofitLifecycleIdle(page)
  await page.evaluate(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCachedTierNonFit: (viewport: HTMLElement, tier: number) =>
          viewport.closest<HTMLElement>('.autofit')?.getAttribute('data-autofit-role') === 'left'
          && tier === -4,
      },
    })
  })

  await page.getByTestId('coordination-toggle-left-density').click()
  const retained = await waitForPair(pair)
  for (const role of await retained.all()) {
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
    await expect(role.locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
  }
  const noRetry = await page.evaluate(() => {
    return (window as typeof window & {
      __slidevAutofitDebug?: { readonly snapshot: { readonly batchCount: number } }
    }).__slidevAutofitDebug?.snapshot.batchCount
  })
  await waitForAnimationFrames(page, 2)
  expect(await page.evaluate(() => {
    return (window as typeof window & {
      __slidevAutofitDebug?: { readonly snapshot: { readonly batchCount: number } }
    }).__slidevAutofitDebug?.snapshot.batchCount
  })).toBe(noRetry)

  await page.evaluate(() => {
    delete (window as typeof window & { __slidevAutofitTestHooks?: unknown })
      .__slidevAutofitTestHooks
  })
  await page.getByTestId('coordination-toggle-right-density').click()
  const recovery = await waitForPair(pair)
  for (const role of await recovery.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
})

test('keeps a first-layout cached common-tier non-fit hidden without retry and recovers on supersession', async ({ page }) => {
  await page.goto('/65')
  await holdFrames(page)
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitCachedCommonTierNonFitCalls?: number
    }
    target.__autofitCachedCommonTierNonFitCalls = 0
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceCachedTierNonFit: (viewport: HTMLElement, tier: number) => {
          const matches = viewport.closest<HTMLElement>('.autofit')
            ?.getAttribute('data-autofit-role') === 'right'
            && tier === -2
          if (matches)
            target.__autofitCachedCommonTierNonFitCalls! += 1
          return matches
        },
      },
    })
  })
  await page.locator('[data-testid="start-coordination"]:visible').click()
  const pair = page.locator('[data-testid="coordination-harness"]:visible')
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)

  let noRetry: CachedCommonTierNonFitSnapshot | null = null
  for (let frame = 0; frame < 12; frame += 1) {
    const queued = await page.evaluate(() => {
      return (window as typeof window & {
        __autofitCoordinationFrames?: FrameRequestCallback[]
      }).__autofitCoordinationFrames?.length ?? 0
    })
    if (queued === 0)
      break
    await expectPrivatePairHidden(pair)
    await releaseOneFrame(page)
    const snapshot = await cachedCommonTierNonFitSnapshot(page)
    if (snapshot.cachedNonFitCalls === 1) {
      noRetry = snapshot
      break
    }
  }
  expect(noRetry).not.toBeNull()
  expect(noRetry).toMatchObject({
    cachedNonFitCalls: 1,
  })
  expect(noRetry?.candidateMeasurements).toContain(4)

  // Drain any peer callback that was queued before the forced cached non-fit
  // terminal. It must not create a pass or retry.
  const heldFrameCount = await page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })
  if (heldFrameCount > 0)
    await releaseHeldFrames(page)
  await expectPrivatePairHidden(pair)
  expect(await cachedCommonTierNonFitSnapshot(page)).toEqual(noRetry)
  expect(await page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBe(0)

  await page.evaluate(() => {
    delete (window as typeof window & { __slidevAutofitTestHooks?: unknown })
      .__slidevAutofitTestHooks
  })
  await restoreFrames(page)
  await page.locator('[data-autofit-role="left"]').dispatchEvent('slidev-autofit-test-supersede')
  const recovery = await waitForPair(pair)
  for (const role of await recovery.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '-2')
})

test('discards a private result made stale at its lifecycle barrier before a fresh sibling can join it', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __autofitCoordinationBarrierArmed: false,
      __autofitCoordinationBarrierMutations: 0,
      __slidevAutofitTestHooks: {
        afterIntrinsicCandidateWrite(viewport: HTMLElement): void {
          const target = window as typeof window & {
            __autofitCoordinationBarrierArmed?: boolean
            __autofitCoordinationBarrierMutations?: number
          }
          const root = viewport.closest<HTMLElement>('.autofit')
          if (
            !target.__autofitCoordinationBarrierArmed
            || root?.getAttribute('data-autofit-role') !== 'left'
          ) {
            return
          }

          target.__autofitCoordinationBarrierArmed = false
          target.__autofitCoordinationBarrierMutations
            = (target.__autofitCoordinationBarrierMutations ?? 0) + 1
          root.querySelector<HTMLElement>('[data-testid="coordination-left-copy"]')!
            .firstChild!.textContent = 'Changed at the private lifecycle barrier'
        },
      },
    })
  })
  const pair = await start(page, 70)
  await waitForPair(pair)
  await holdFrames(page)
  await page.evaluate(() => {
    (window as typeof window & {
      __autofitCoordinationBarrierArmed?: boolean
    }).__autofitCoordinationBarrierArmed = true
  })
  await page.getByTestId('coordination-toggle-left-density').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationFrames?: FrameRequestCallback[]
    }).__autofitCoordinationFrames?.length ?? 0
  })).toBeGreaterThan(0)

  for (let frame = 0; frame < 8; frame += 1) {
    const held = await page.evaluate(() => {
      return (window as typeof window & {
        __autofitCoordinationFrames?: FrameRequestCallback[]
      }).__autofitCoordinationFrames?.length ?? 0
    })
    if (held === 0)
      break
    await releaseOneFrame(page)
    const mutations = await page.evaluate(() => {
      return (window as typeof window & {
        __autofitCoordinationBarrierMutations?: number
      }).__autofitCoordinationBarrierMutations ?? 0
    })
    if (mutations > 0 && frame >= 3)
      break
  }
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitCoordinationBarrierMutations?: number
    }).__autofitCoordinationBarrierMutations ?? 0
  })).toBe(1)

  for (const role of await (await roles(pair)).all()) {
    await expect(role).toHaveAttribute('data-autofit-tier', '0')
    await expect(role.locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
    await expect(role).not.toHaveAttribute('data-autofit-private-tier')
  }

  await restoreFrames(page)
  await page.getByTestId('coordination-toggle-right-density').click()
  const recovery = await waitForPair(pair)
  for (const role of await recovery.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '-4')
})
