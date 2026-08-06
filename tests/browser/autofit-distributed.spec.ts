import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  waitForAutofitPublication,
  waitForPageAssets,
} from './helpers/autofit-settle'

interface CarrierExpectation {
  readonly testId: string
  readonly kind: 'full' | 'half'
}

interface GapCountExpectation {
  readonly full: number
  readonly half: number
}

const GEOMETRY_TOLERANCE = 0.75

async function gotoSlide(page: Page, slide: number, marker: string) {
  await page.goto(`/${slide}`)
  await expect(page.getByTestId(marker)).toBeVisible()
  await waitForPageAssets(page)
}

async function waitForStable(locator: Locator) {
  await waitForAutofitPublication(locator)
}

async function readDistribution(
  locator: Locator,
) {
  return locator.evaluate((root) => {
    const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    const viewportStyle = getComputedStyle(viewport)
    const flowStyle = getComputedStyle(flow)
    const viewportRect = viewport.getBoundingClientRect()
    const viewportBlockSize = Number.parseFloat(viewportStyle.height)
    const blockScale = viewportBlockSize > 0
      ? viewportRect.height / viewportBlockSize
      : 1

    let minBlock = 0
    let maxBlock = flow.scrollHeight
    for (const descendant of flow.querySelectorAll<HTMLElement>('*')) {
      if (descendant.getClientRects().length === 0)
        continue

      const rectangle = descendant.getBoundingClientRect()
      const top = (rectangle.top - viewportRect.top) / blockScale
      const bottom = (rectangle.bottom - viewportRect.top) / blockScale
      minBlock = Math.min(minBlock, top)
      maxBlock = Math.max(maxBlock, bottom)
    }

    const units = [...root.querySelectorAll<HTMLElement>('[data-visual-unit]')]
    const edges = units.map((unit) => {
      if (unit.dataset.visualUnit === 'atomic') {
        const rectangle = unit.getBoundingClientRect()
        return {
          leading: (rectangle.top - viewportRect.top) / blockScale,
          trailing: (rectangle.bottom - viewportRect.top) / blockScale,
        }
      }

      const rectangles: DOMRect[] = []
      const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node.parentElement?.closest('[data-visual-unit]') ?? null) !== unit)
          continue
        if ((node as Text).data.trim() === '')
          continue
        const range = document.createRange()
        range.selectNodeContents(node)
        rectangles.push(...range.getClientRects())
      }
      for (const media of unit.querySelectorAll<HTMLElement>(
        'audio, canvas, embed, iframe, img, object, picture, svg, video',
      )) {
        if (media.closest('[data-visual-unit]') !== unit)
          continue
        rectangles.push(...media.getClientRects())
      }
      if (rectangles.length === 0)
        throw new Error('independent distributed measurement found no rectangles')
      return {
        leading: Math.min(...rectangles.map(rectangle =>
          (rectangle.top - viewportRect.top) / blockScale)),
        trailing: Math.max(...rectangles.map(rectangle =>
          (rectangle.bottom - viewportRect.top) / blockScale)),
      }
    })
    const flowRect = flow.getBoundingClientRect()

    return {
      paddingBefore: Number.parseFloat(flowStyle.paddingBlockStart),
      paddingAfter: Number.parseFloat(flowStyle.paddingBlockEnd),
      gaps: edges.slice(1).map((edge, index) =>
        edge.leading - edges[index].trailing),
      kinds: units.slice(1).map(unit => unit.dataset.gapKind),
      margins: units.slice(1).map(unit =>
        Number.parseFloat(getComputedStyle(unit).marginBlockStart)),
      baseSpacing: Number.parseFloat(
        getComputedStyle(root).getPropertyValue('--slidev-autofit-base-spacing'),
      ),
      scale: Number(root.getAttribute('data-autofit-scale')),
      minBlock,
      maxBlock,
      viewportBlockSize,
      flowRemainder: viewportBlockSize - flowRect.height / blockScale,
    }
  })
}

async function assertDistributed(
  locator: Locator,
  gaps: GapCountExpectation,
  carriers: readonly CarrierExpectation[],
) {
  await waitForStable(locator)
  await expect(locator).toHaveAttribute('data-autofit-state', 'fit')
  await expect(locator).toHaveAttribute('data-autofit-tier', '0')
  await expect(locator).toHaveAttribute('data-autofit-scale', '1')
  await expect(locator).toHaveAttribute(
    'data-autofit-effective-alignment',
    'distributed',
  )
  await expect(locator).toHaveAttribute('data-autofit-full-gaps', String(gaps.full))
  await expect(locator).toHaveAttribute('data-autofit-half-gaps', String(gaps.half))

  const measured = await readDistribution(locator)
  expect(measured.paddingBefore).toBeGreaterThan(0)
  expect(measured.paddingBefore).toBeCloseTo(measured.paddingAfter, 5)

  expect(measured.kinds).toEqual(carriers.map(carrier => carrier.kind))
  measured.gaps.forEach((gap, index) => {
    const fullTarget = measured.baseSpacing * measured.scale
      + measured.paddingBefore
    const target = measured.kinds[index] === 'half'
      ? fullTarget * 0.5
      : fullTarget
    expect(
      Math.abs(gap - target),
      `distributed boundary ${index}: ${JSON.stringify(measured)}`,
    ).toBeLessThanOrEqual(0.5)
  })

  expect(measured.minBlock).toBeGreaterThanOrEqual(-GEOMETRY_TOLERANCE)
  expect(measured.maxBlock).toBeLessThanOrEqual(
    measured.viewportBlockSize + GEOMETRY_TOLERANCE,
  )
  expect(measured.flowRemainder).toBeGreaterThanOrEqual(-GEOMETRY_TOLERANCE)
  expect(measured.flowRemainder).toBeLessThanOrEqual(
    2 * GEOMETRY_TOLERANCE + 0.5,
  )
}

test('realizes distributed targets at positive, neutral, and negative selected tiers with signed adjustments', async ({ page }) => {
  await gotoSlide(page, 21, 'distributed-positive-tier')

  for (const [testId, tierDirection] of [
    ['distributed-positive-tier', 1],
    ['distributed-negative-tier', -1],
    ['distributed-mixed-media', 0],
  ] as const) {
    const autofit = page.getByTestId(testId)
    await waitForStable(autofit)
    await expect(autofit).toHaveAttribute(
      'data-autofit-effective-alignment',
      'distributed',
    )
    const tier = Number(await autofit.getAttribute('data-autofit-tier'))
    if (tierDirection > 0)
      expect(tier).toBeGreaterThan(0)
    else if (tierDirection < 0)
      expect(tier).toBeLessThan(0)
    else
      expect(tier).toBe(0)

    const measured = await readDistribution(autofit)
    measured.gaps.forEach((gap, index) => {
      const fullTarget = measured.baseSpacing * measured.scale
        + measured.paddingBefore
      const target = measured.kinds[index] === 'half'
        ? fullTarget * 0.5
        : fullTarget
      expect(
        Math.abs(gap - target),
        `${testId} boundary ${index}: ${JSON.stringify(measured)}`,
      ).toBeLessThanOrEqual(0.5)
    })
    expect(measured.paddingBefore).toBeCloseTo(measured.paddingAfter, 5)
    expect(measured.maxBlock).toBeLessThanOrEqual(
      measured.viewportBlockSize + GEOMETRY_TOLERANCE,
    )
    if (tierDirection < 0)
      expect(measured.margins.some(margin => margin < 0)).toBe(true)
  }
})

test('distributes standalone, heading-associated, deeply nested, and grouped text structures', async ({ page }) => {
  await gotoSlide(page, 27, 'distributed-standalone')

  await assertDistributed(
    page.getByTestId('distributed-standalone'),
    { full: 2, half: 0 },
    [
      { testId: 'distributed-standalone-second', kind: 'full' },
      { testId: 'distributed-standalone-third', kind: 'full' },
    ],
  )
  await assertDistributed(
    page.getByTestId('distributed-heading-list'),
    { full: 0, half: 2 },
    [
      { testId: 'distributed-heading-list-carrier', kind: 'half' },
      { testId: 'distributed-heading-list-second', kind: 'half' },
    ],
  )
  await assertDistributed(
    page.getByTestId('distributed-deep-list'),
    { full: 1, half: 4 },
    [
      { testId: 'distributed-deep-level-two', kind: 'half' },
      { testId: 'distributed-deep-level-three', kind: 'half' },
      { testId: 'distributed-deep-level-three-second', kind: 'half' },
      { testId: 'distributed-deep-level-two-second', kind: 'half' },
      { testId: 'distributed-deep-root-second', kind: 'full' },
    ],
  )
  await assertDistributed(
    page.getByTestId('distributed-grouped-paragraphs'),
    { full: 1, half: 3 },
    [
      { testId: 'distributed-grouped-copy-one', kind: 'half' },
      { testId: 'distributed-grouped-copy-two', kind: 'half' },
      { testId: 'distributed-grouped-second-heading', kind: 'full' },
      { testId: 'distributed-grouped-copy-three', kind: 'half' },
    ],
  )
})

test('distributes grouped lists, mixed atomic blocks, a single unit, and unequal-height units', async ({ page }) => {
  await gotoSlide(page, 28, 'distributed-grouped-lists')

  await assertDistributed(
    page.getByTestId('distributed-grouped-lists'),
    { full: 0, half: 4 },
    [
      { testId: 'distributed-grouped-list-one', kind: 'half' },
      { testId: 'distributed-grouped-list-one-second', kind: 'half' },
      { testId: 'distributed-grouped-list-two', kind: 'half' },
      { testId: 'distributed-grouped-list-two-second', kind: 'half' },
    ],
  )
  await assertDistributed(
    page.getByTestId('distributed-atomic'),
    { full: 3, half: 0 },
    [
      { testId: 'distributed-atomic-quote', kind: 'full' },
      { testId: 'distributed-atomic-code', kind: 'full' },
      { testId: 'distributed-atomic-table', kind: 'full' },
    ],
  )
  await assertDistributed(
    page.getByTestId('distributed-single'),
    { full: 0, half: 0 },
    [],
  )
  await assertDistributed(
    page.getByTestId('distributed-unequal'),
    { full: 2, half: 0 },
    [
      { testId: 'distributed-unequal-tall', kind: 'full' },
      { testId: 'distributed-unequal-last', kind: 'full' },
    ],
  )
})

test('preserves the original v-clicks list and list-item DOM as the gap carriers', async ({ page }) => {
  await gotoSlide(page, 29, 'distributed-v-clicks')
  const autofit = page.getByTestId('distributed-v-clicks')

  await waitForStable(autofit)
  await page.waitForTimeout(150)
  await assertDistributed(
    autofit,
    { full: 2, half: 0 },
    [
      { testId: 'distributed-v-clicks-two', kind: 'full' },
      { testId: 'distributed-v-clicks-three', kind: 'full' },
    ],
  )

  const identity = await autofit.evaluate((root) => {
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    const list = root.querySelector<HTMLElement>('[data-testid="distributed-v-clicks-list"]')!
    const items = [
      'distributed-v-clicks-one',
      'distributed-v-clicks-two',
      'distributed-v-clicks-three',
    ].map(testId => root.querySelector<HTMLElement>(`[data-testid="${testId}"]`))

    const semanticRoots = [...flow.children].filter(element =>
      element.localName !== 'v-click-gap'
      && !element.hasAttribute('data-slidev-v-click-gap'),
    )

    return {
      semanticRootCount: semanticRoots.length,
      semanticRootIsOriginalList: semanticRoots[0] === list,
      listParentIsFlow: list.parentElement === flow,
      allItemsRemainDirectChildren: items.every(item => item?.parentElement === list),
      itemCount: list.querySelectorAll(':scope > li').length,
      clickTargetCount: items.filter(item =>
        item?.classList.contains('slidev-vclick-target'),
      ).length,
      transitionProperties: items.map(item =>
        item ? getComputedStyle(item).transitionProperty : null,
      ),
      transitionDurations: items.map(item =>
        item ? getComputedStyle(item).transitionDuration : null,
      ),
      inlineTransitionProperties: items.map(item =>
        item?.style.getPropertyValue('transition-property') ?? null,
      ),
    }
  })

  expect(identity).toEqual({
    semanticRootCount: 1,
    semanticRootIsOriginalList: true,
    listParentIsFlow: true,
    allItemsRemainDirectChildren: true,
    itemCount: 3,
    clickTargetCount: 3,
    transitionProperties: ['all', 'all', 'all'],
    transitionDurations: ['0.1s', '0.1s', '0.1s'],
    inlineTransitionProperties: ['', '', ''],
  })
})

test('uses middle through the inclusive 4px threshold and reserves the 0.5px distributed remainder above it', async ({ page }) => {
  await gotoSlide(page, 30, 'distributed-threshold')
  const threshold = page.getByTestId('distributed-threshold')
  const aboveThreshold = page.getByTestId('distributed-above-threshold')

  await waitForStable(threshold)
  await expect(threshold).toHaveAttribute('data-autofit-state', 'fit')
  await expect(threshold).toHaveAttribute(
    'data-autofit-effective-alignment',
    'middle',
  )
  const thresholdPadding = await readDistribution(threshold)
  expect(thresholdPadding.paddingBefore).toBeCloseTo(2, 5)
  expect(thresholdPadding.paddingAfter).toBeCloseTo(2, 5)

  await assertDistributed(aboveThreshold, { full: 0, half: 0 }, [])
  const distributed = await readDistribution(aboveThreshold)
  expect(distributed.paddingBefore).toBeCloseTo(2.25, 4)
  expect(distributed.paddingAfter).toBeCloseTo(2.25, 4)
  expect(distributed.flowRemainder).toBeCloseTo(0.5, 1)
})

test('falls back to middle at the valid tier when final distributed geometry crosses tolerance', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceDistributedVerificationFailure(viewport: HTMLElement): boolean {
          return viewport.closest('.autofit')
            ?.getAttribute('data-testid') === 'distributed-final-fallback'
        },
      },
    })
  })
  await gotoSlide(page, 31, 'distributed-final-fallback')
  const autofit = page.getByTestId('distributed-final-fallback')

  await waitForStable(autofit)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute('data-autofit-tier', '0')
  await expect(autofit).toHaveAttribute(
    'data-autofit-requested-alignment',
    'distributed',
  )
  await expect(autofit).toHaveAttribute(
    'data-autofit-effective-alignment',
    'middle',
  )
  await expect(autofit).toHaveAttribute('data-autofit-full-gaps', '1')
  await expect(autofit).toHaveAttribute('data-autofit-half-gaps', '1')

  const measured = await readDistribution(autofit)
  expect(measured.paddingBefore).toBeCloseTo(measured.paddingAfter, 5)
  expect(measured.paddingBefore * 2).toBeGreaterThan(4)
  expect(measured.kinds).toEqual(['half', 'full'])
  measured.gaps.forEach((gap, index) => {
    const target = measured.baseSpacing * measured.scale
      * (measured.kinds[index] === 'half' ? 0.5 : 1)
    expect(Math.abs(gap - target)).toBeLessThanOrEqual(0.5)
  })
  expect(measured.minBlock).toBeGreaterThanOrEqual(-GEOMETRY_TOLERANCE)
  expect(measured.maxBlock).toBeLessThanOrEqual(
    measured.viewportBlockSize + GEOMETRY_TOLERANCE,
  )
})

test('uses base-gap-verification only when the restored middle presentation also fails', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceDistributedVerificationFailure(viewport: HTMLElement): boolean {
          return viewport.closest('.autofit')
            ?.getAttribute('data-testid') === 'distributed-final-fallback'
        },
        forceRestoredBaseVerificationFailure(viewport: HTMLElement): boolean {
          return viewport.closest('.autofit')
            ?.getAttribute('data-testid') === 'distributed-final-fallback'
        },
      },
    })
  })
  await gotoSlide(page, 31, 'distributed-final-fallback')
  const autofit = page.getByTestId('distributed-final-fallback')

  await expect(autofit).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(autofit).toHaveAttribute(
    'data-autofit-unsupported-reason',
    'base-gap-verification',
  )
  await expect(autofit).not.toHaveAttribute('data-autofit-tier')
  await expect(autofit).not.toHaveAttribute('data-autofit-scale')
})

test('synchronously discards and coalesces text, style, and signature mutations before distributed commit', async ({ page }) => {
  await page.addInitScript(() => {
    const calls: string[] = []
    Object.assign(window, {
      __autofitDistributionBarrierCalls: calls,
      __slidevAutofitTestHooks: {
        beforeDistributionCommitBarrier(viewport: HTMLElement): void {
          const root = viewport.closest<HTMLElement>('.autofit')
          if (calls.length >= 2)
            return
          if (
            root?.getAttribute('data-testid') !== 'distributed-final-fallback'
            || calls.length > 0
          ) {
            calls.push('verification')
            return
          }

          calls.push('mutated')
          const flow = root.querySelector<HTMLElement>('.autofit__flow')!
          const copy = root.querySelector<HTMLElement>(
            '[data-testid="distributed-final-fallback-list"]',
          )!
          copy.firstChild!.textContent = 'Changed before observer delivery'
          copy.classList.add('author-barrier-change')
          copy.style.fontSize = '11px'
          const appended = document.createElement('p')
          appended.dataset.visualUnit = 'text'
          appended.dataset.gapKind = 'full'
          appended.textContent = 'New signature unit'
          flow.append(appended)
        },
      },
    })
  })
  await gotoSlide(page, 31, 'distributed-final-fallback')
  const autofit = page.getByTestId('distributed-final-fallback')
  await waitForStable(autofit)

  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute(
    'data-autofit-effective-alignment',
    'distributed',
  )
  await expect(autofit).not.toHaveAttribute('data-autofit-unsupported-reason')
  await expect.poll(() => page.evaluate(() =>
    (window as Window & {
      __autofitDistributionBarrierCalls?: string[]
    }).__autofitDistributionBarrierCalls ?? [],
  )).toEqual(['mutated', 'verification'])

  const measured = await readDistribution(autofit)
  measured.gaps.forEach((gap, index) => {
    const fullTarget = measured.baseSpacing * measured.scale
      + measured.paddingBefore
    const target = measured.kinds[index] === 'half'
      ? fullTarget * 0.5
      : fullTarget
    expect(Math.abs(gap - target)).toBeLessThanOrEqual(0.5)
  })
})

test('drains pending candidate-write mutations before scheduler unsupported commit', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTOFIT UNSUPPORTED'))
      warnings.push(message.text())
  })
  await gotoSlide(page, 31, 'distributed-final-fallback')
  const autofit = page.getByTestId('distributed-final-fallback')
  await waitForStable(autofit)

  await autofit.evaluate((root) => {
    const states: string[] = []
    Object.assign(window, {
      __autofitUnsupportedWriteStates: states,
      __slidevAutofitTestHooks: {
        afterIntrinsicCandidateWrite(viewport: HTMLElement): void {
          const target = viewport.closest<HTMLElement>('.autofit')
          if (target?.dataset.testid !== 'distributed-final-fallback')
            return
          states.push(target.dataset.autofitState ?? '')
          if (states.length === 1) {
            target.dataset.autofitTestForceUnsupported
              = 'visual-target-nonfinite'
            target.querySelector<HTMLElement>(
              '[data-testid="distributed-final-fallback-list"]',
            )!.textContent = 'Pending author mutation before unsupported read'
          }
          else {
            delete target.dataset.autofitTestForceUnsupported
          }
        },
      },
    })
    root.querySelector<HTMLElement>(
      '[data-testid="distributed-final-fallback-list"]',
    )!.textContent = 'Trigger candidate-write stale pass'
  })

  await waitForStable(autofit)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute(
    'data-autofit-effective-alignment',
    'distributed',
  )
  await expect(autofit).not.toHaveAttribute('data-autofit-unsupported-reason')
  await expect.poll(() => page.evaluate(() =>
    (window as Window & {
      __autofitUnsupportedWriteStates?: string[]
    }).__autofitUnsupportedWriteStates ?? [],
  )).toEqual(['fit', 'fit'])
  expect(warnings).toEqual([])
})

test('supersedes the current session from distributed verification without a stale terminal commit', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTOFIT UNSUPPORTED'))
      warnings.push(message.text())
  })
  await gotoSlide(page, 31, 'distributed-final-fallback')
  const autofit = page.getByTestId('distributed-final-fallback')
  await waitForStable(autofit)
  await page.evaluate(() => {
    const debug = (window as Window & {
      __slidevAutofitDebug?: { reset(): void }
    }).__slidevAutofitDebug
    if (!debug)
      throw new Error('development autofit diagnostics are not installed')
    debug.reset()
  })

  await autofit.evaluate((root) => {
    const states: string[] = []
    Object.assign(window, {
      __autofitSupersessionVerificationStates: states,
      __slidevAutofitTestHooks: {
        beforeDistributionCommitBarrier(viewport: HTMLElement): void {
          const target = viewport.closest<HTMLElement>('.autofit')
          if (target?.dataset.testid !== 'distributed-final-fallback')
            return
          states.push([
            target.dataset.autofitState,
            target.dataset.autofitEffectiveAlignment,
          ].join(':'))
          if (states.length === 1) {
            target.dispatchEvent(
              new Event('slidev-autofit-test-supersede'),
            )
          }
        },
      },
    })
    root.querySelector<HTMLElement>(
      '[data-testid="distributed-final-fallback-list"]',
    )!.textContent = 'Trigger verification supersession'
  })

  await waitForStable(autofit)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute(
    'data-autofit-effective-alignment',
    'distributed',
  )
  await expect(autofit).not.toHaveAttribute('data-autofit-unsupported-reason')
  await expect.poll(() => page.evaluate(() =>
    (window as Window & {
      __autofitSupersessionVerificationStates?: string[]
    }).__autofitSupersessionVerificationStates ?? [],
  )).toEqual(['fit:distributed', 'fit:distributed'])
  await expect.poll(() => page.evaluate(() => {
    const snapshot = (window as Window & {
      __slidevAutofitDebug?: {
        readonly snapshot: {
          readonly batchCount: number
          readonly candidateMeasurements: readonly {
            readonly count: number
          }[]
        }
      }
    }).__slidevAutofitDebug!.snapshot
    return {
      batchCount: snapshot.batchCount,
      counts: snapshot.candidateMeasurements.map(entry => entry.count),
    }
  })).toEqual({
    batchCount: 2,
    counts: [1, 1],
  })
  expect(warnings).toEqual([])
})

test('does not commit a distributed terminal state when unmounted inside verification', async ({ page }) => {
  await gotoSlide(page, 31, 'distributed-final-fallback')
  const autofit = page.getByTestId('distributed-final-fallback')
  await waitForStable(autofit)

  const retainedState = await autofit.evaluate((root) => {
    Object.assign(window, {
      __autofitDistributedUnmountRoot: root,
      __slidevAutofitTestHooks: {
        beforeDistributionCommitBarrier(viewport: HTMLElement): void {
          const target = viewport.closest<HTMLElement>('.autofit')
          if (target?.getAttribute('data-testid')
            !== 'distributed-final-fallback') {
            return
          }
          const component = (target as HTMLElement & {
            __vueParentComponent?: {
              appContext?: { app?: { unmount(): void } }
            }
          }).__vueParentComponent
          component?.appContext?.app?.unmount()
        },
      },
    })
    return {
      state: root.getAttribute('data-autofit-state'),
      tier: root.getAttribute('data-autofit-tier'),
      alignment: root.getAttribute('data-autofit-effective-alignment'),
    }
  })

  await autofit.locator(
    '[data-testid="distributed-final-fallback-list"]',
  ).evaluate((copy) => {
    copy.textContent = 'Trigger distribution replacement before unmount'
  })
  await expect(autofit).toHaveCount(0)
  await page.waitForTimeout(100)

  expect(await page.evaluate(() => {
    const root = (window as Window & {
      __autofitDistributedUnmountRoot?: HTMLElement
    }).__autofitDistributedUnmountRoot!
    return {
      state: root.getAttribute('data-autofit-state'),
      tier: root.getAttribute('data-autofit-tier'),
      alignment: root.getAttribute('data-autofit-effective-alignment'),
    }
  })).toEqual(retainedState)
})

test('does not expose the distribution fallback through forwarded attributes', async ({ page }) => {
  await gotoSlide(page, 31, 'distributed-final-fallback')
  const autofit = page.getByTestId('distributed-final-fallback')
  await waitForStable(autofit)
  await expect(autofit).toHaveAttribute(
    'data-autofit-effective-alignment',
    'distributed',
  )

  await autofit.evaluate((root) => {
    root.setAttribute('data-autofit-test-force-distribution-fallback', '')
    const copy = root.querySelector<HTMLElement>(
      '[data-testid="distributed-final-fallback-list"]',
    )!
    copy.textContent = 'Grouped copy with an inert forwarded attribute'
  })
  await waitForStable(autofit)
  await expect(autofit).toHaveAttribute(
    'data-autofit-effective-alignment',
    'distributed',
  )
})
