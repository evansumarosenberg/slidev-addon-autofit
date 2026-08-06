import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  waitForAnimationFrames,
  waitForAutofitLifecycleIdle,
  waitForPageAssets,
} from './helpers/autofit-settle'

interface DebugSnapshot {
  readonly batchCount: number
  readonly discardedJobCount: number
  readonly batches: readonly {
    readonly batchId: number
    readonly intrinsicWritePhaseCount: number
    readonly intrinsicReadPhaseCount: number
    readonly compensatedWritePhaseCount: number
    readonly finalReadPhaseCount: number
    readonly jobs: readonly {
      readonly instanceId: string
      readonly passId: number
    }[]
  }[]
  readonly candidateMeasurements: readonly {
    readonly instanceId: string
    readonly passId: number
    readonly count: number
  }[]
}

async function gotoSlide(page: Page, slide: number, marker: string): Promise<void> {
  await page.goto(`/${slide}`)
  await expect(page.getByTestId(marker)).toBeAttached()
}

async function waitForStable(locator: Locator): Promise<void> {
  await expect(locator).toHaveAttribute('data-autofit-state', /^(fit|overflow)$/)
  await expect(locator).not.toHaveClass(/autofit--pending/)
}

async function waitForLifecycleIdle(page: Page): Promise<void> {
  await waitForPageAssets(page)
  await waitForAutofitLifecycleIdle(page)
}

async function debugSnapshot(page: Page): Promise<DebugSnapshot> {
  return page.evaluate(() => {
    const debug = (window as typeof window & {
      __slidevAutofitDebug?: { readonly snapshot: DebugSnapshot }
    }).__slidevAutofitDebug
    if (!debug)
      throw new Error('development autofit diagnostics are not installed')
    return debug.snapshot
  })
}

async function resetDebug(page: Page): Promise<void> {
  await page.evaluate(() => {
    const debug = (window as typeof window & {
      __slidevAutofitDebug?: { reset(): void }
    }).__slidevAutofitDebug
    if (!debug)
      throw new Error('development autofit diagnostics are not installed')
    debug.reset()
  })
}

async function batchId(locator: Locator): Promise<number> {
  return Number(await locator.getAttribute('data-autofit-batch-id'))
}

async function measureCount(locator: Locator): Promise<number> {
  return Number(await locator.getAttribute('data-autofit-measure-count'))
}

async function retainedPresentation(locator: Locator): Promise<unknown> {
  return locator.evaluate((root) => {
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
    const attributes = [
      'data-autofit-state',
      'data-autofit-tier',
      'data-autofit-scale',
      'data-autofit-effective-alignment',
      'data-autofit-full-gaps',
      'data-autofit-half-gaps',
      'data-autofit-empty',
      'data-autofit-unsupported-reason',
    ].map(name => [name, root.getAttribute(name)])
    const presentation = (element: HTMLElement) => ({
      className: element.className,
      style: [...element.style]
        .filter(name => !name.startsWith('transition'))
        .map(name => [
          name,
          element.style.getPropertyValue(name),
          element.style.getPropertyPriority(name),
        ]),
      fontSize: getComputedStyle(element).fontSize,
      lineHeight: getComputedStyle(element).lineHeight,
      marginBlockStart: getComputedStyle(element).marginBlockStart,
      marginBlockEnd: getComputedStyle(element).marginBlockEnd,
    })
    return {
      attributes: [
        ['class', [...root.classList]
          .filter(name => name === 'autofit' || name.startsWith('autofit--'))
          .sort()
          .join(' ')],
        ...attributes,
      ],
      viewportVisibility: getComputedStyle(viewport).visibility,
      diagnostic: root.querySelector('.autofit__diagnostics')?.textContent?.trim(),
      flow: presentation(flow),
      content: [...flow.children].map(element => presentation(element as HTMLElement)),
    }
  })
}

async function textVisualGap(
  page: Page,
  firstTestId: string,
  secondTestId: string,
): Promise<number> {
  return page.evaluate(([firstId, secondId]) => {
    function edges(testId: string) {
      const element = document.querySelector(`[data-testid="${testId}"]`)!
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const rectangles: DOMRect[] = []
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node as Text).data.trim() === '')
          continue
        const range = document.createRange()
        range.selectNodeContents(node)
        rectangles.push(...range.getClientRects())
      }
      return {
        top: Math.min(...rectangles.map(rectangle => rectangle.top)),
        bottom: Math.max(...rectangles.map(rectangle => rectangle.bottom)),
      }
    }
    const first = edges(firstId)
    const second = edges(secondId)
    const viewport = document.querySelector(
      `[data-testid="${firstId}"]`,
    )!.closest('.autofit')!.querySelector<HTMLElement>('.autofit__viewport')!
    const rectangle = viewport.getBoundingClientRect()
    const scale = rectangle.height
      / Number.parseFloat(getComputedStyle(viewport).height)
    return (second.top - first.bottom) / scale
  }, [firstTestId, secondTestId] as const)
}

test('shares initial batches and exposes bounded development diagnostics', async ({ page }) => {
  await gotoSlide(page, 32, 'lifecycle-harness')

  const first = page.getByTestId('shared-batch-a')
  const second = page.getByTestId('shared-batch-b')
  await waitForStable(first)
  await waitForStable(second)
  await waitForLifecycleIdle(page)

  expect(await measureCount(first)).toBeGreaterThan(0)
  expect(await measureCount(first)).toBeLessThanOrEqual(4)
  expect(await measureCount(second)).toBeLessThanOrEqual(4)

  const snapshot = await debugSnapshot(page)
  const sharedRound = snapshot.batches.find(batch => batch.jobs.length >= 2)
  expect(sharedRound).toBeDefined()
  expect(sharedRound).toMatchObject({
    intrinsicWritePhaseCount: 1,
    intrinsicReadPhaseCount: 1,
    compensatedWritePhaseCount: 1,
    finalReadPhaseCount: 1,
  })
})

test('keeps a prior stable result visible while resize and prop passes replace it', async ({ page }) => {
  await gotoSlide(page, 32, 'lifecycle-harness')

  const resized = page.getByTestId('shared-batch-a')
  const propReactive = page.getByTestId('prop-reactive')
  await waitForStable(resized)
  await waitForStable(propReactive)
  await waitForLifecycleIdle(page)

  const originalBatch = await batchId(resized)
  const originalTier = await resized.getAttribute('data-autofit-tier')

  await page.evaluate(() => {
    const heldFrames: FrameRequestCallback[] = []
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    Object.assign(window, {
      __autofitHeldFrames: heldFrames,
      __autofitOriginalRequestFrame: originalRequestFrame,
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 100_000 + heldFrames.length
    }
  })
  await page.getByTestId('shrink-shared-instance').click()
  await page.waitForTimeout(20)

  await expect(resized).toHaveAttribute('data-autofit-state', 'fit')
  await expect(resized).toHaveAttribute('data-autofit-tier', originalTier!)
  await expect(resized.locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
  expect(await batchId(resized)).toBe(originalBatch)

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    const frames = target.__autofitHeldFrames ?? []
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of frames.splice(0))
      callback(performance.now())
  })

  await expect.poll(() => batchId(resized)).not.toBe(originalBatch)
  await expect(resized).toHaveAttribute('data-autofit-tier', /-[1-4]/)

  const originalPropBatch = await batchId(propReactive)
  const originalPropTier = await propReactive.getAttribute('data-autofit-tier')
  const originalPropFont = await page.getByTestId('prop-reactive-copy')
    .evaluate(element => getComputedStyle(element).fontSize)
  await page.evaluate(() => {
    const heldFrames: FrameRequestCallback[] = []
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    Object.assign(window, {
      __autofitHeldFrames: heldFrames,
      __autofitOriginalRequestFrame: originalRequestFrame,
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 150_000 + heldFrames.length
    }
  })
  await page.getByTestId('expand-tier-range').click()
  await page.waitForTimeout(20)
  await expect(page.getByTestId('prop-reactive-copy')).toHaveCSS(
    'font-size',
    originalPropFont,
  )
  for (let round = 0; round < 2; round += 1) {
    await page.evaluate(() => {
      const target = window as typeof window & {
        __autofitHeldFrames?: FrameRequestCallback[]
      }
      const callback = target.__autofitHeldFrames?.shift()
      if (!callback)
        throw new Error('expected a held autofit measurement frame')
      callback(performance.now())
    })
    await page.waitForTimeout(20)
  }

  await expect(propReactive).toHaveAttribute('data-autofit-tier', originalPropTier!)
  await expect(page.getByTestId('prop-reactive-copy')).toHaveCSS(
    'font-size',
    originalPropFont,
  )
  await expect(propReactive.locator('.autofit__viewport')).toHaveCSS(
    'visibility',
    'visible',
  )

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    const frames = target.__autofitHeldFrames ?? []
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of frames.splice(0))
      callback(performance.now())
  })
  await expect.poll(() => batchId(propReactive)).not.toBe(originalPropBatch)
  await expect(propReactive).toHaveAttribute('data-autofit-tier', '2')
  await expect(page.getByTestId('prop-reactive-copy')).toHaveCSS('font-size', '120px')
})

test('reacts to text, media, font, theme, and base-spacing invalidations without compounding', async ({ page }) => {
  await gotoSlide(page, 35, 'reactive-dom-slide')

  const textFit = page.getByTestId('text-reactive')
  const mediaFit = page.getByTestId('media-reactive')
  const themeFit = page.getByTestId('theme-reactive')
  const spacingFit = page.getByTestId('spacing-reactive')
  for (const locator of [textFit, mediaFit, themeFit, spacingFit])
    await waitForStable(locator)

  const textBatch = await batchId(textFit)
  await page.getByTestId('text-reactive-copy').evaluate((element) => {
    element.textContent = 'This replacement is deliberately long enough to wrap onto several lines.'
  })
  await expect.poll(() => batchId(textFit)).not.toBe(textBatch)
  await expect(textFit).toHaveAttribute('data-autofit-tier', /-[1-4]/)

  const mediaBatch = await batchId(mediaFit)
  await page.getByTestId('media-reactive-image').evaluate((element) => {
    const image = element as HTMLImageElement
    image.style.width = '220px'
    image.style.height = '140px'
    image.dispatchEvent(new Event('load'))
  })
  await expect.poll(() => batchId(mediaFit)).not.toBe(mediaBatch)
  await expect(mediaFit).toHaveAttribute('data-autofit-state', 'overflow')
  await waitForLifecycleIdle(page)

  const mediaNoopBatch = await batchId(mediaFit)
  const mediaNoopDebug = (await debugSnapshot(page)).batchCount
  for (let eventIndex = 0; eventIndex < 2; eventIndex += 1) {
    await page.getByTestId('media-reactive-image').evaluate((element) => {
      element.dispatchEvent(new Event('load'))
    })
    await waitForAnimationFrames(page, 2)
    expect(await batchId(mediaFit)).toBe(mediaNoopBatch)
    expect((await debugSnapshot(page)).batchCount).toBe(mediaNoopDebug)
  }

  const themeBatch = await batchId(themeFit)
  await page.evaluate(() => {
    const style = document.createElement('style')
    style.dataset.autofitReactiveTheme = 'true'
    style.textContent = '.autofit-reactive-theme-copy { font-size: 30px !important; line-height: 36px !important; }'
    document.head.append(style)
  })
  await expect.poll(() => batchId(themeFit)).not.toBe(themeBatch)
  const themeScale = Number(await themeFit.getAttribute('data-autofit-scale'))
  const themeFont = await page.getByTestId('theme-reactive-copy').evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize))
  expect(themeFont).toBeCloseTo(30 * themeScale, 5)

  const spacingBatch = await batchId(spacingFit)
  const spacingCopy = page.getByTestId('spacing-reactive-copy')
  const fontBeforeSpacing = await spacingCopy.evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize))
  await page.evaluate(() => {
    const style = document.querySelector<HTMLStyleElement>(
      'style[data-autofit-reactive-theme]',
    )!
    style.textContent += `
      [data-testid="spacing-reactive"] {
        --slidev-autofit-base-spacing: 24px !important;
      }
    `
  })
  await expect.poll(() => batchId(spacingFit)).not.toBe(spacingBatch)
  await expect.poll(() => page.getByTestId('spacing-reactive-second')
    .evaluate(element => Number.parseFloat(getComputedStyle(element).marginBlockStart)))
    .toBeGreaterThan(20)
  const fontAfterSpacing = await spacingCopy.evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize))
  const spacingScale = Number(await spacingFit.getAttribute('data-autofit-scale'))
  expect(fontAfterSpacing).toBeCloseTo(10 * spacingScale, 5)
  expect(fontAfterSpacing).toBeLessThanOrEqual(fontBeforeSpacing)
  const spacingGap = await textVisualGap(
    page,
    'spacing-reactive-copy',
    'spacing-reactive-second',
  )
  expect(spacingGap).toBeCloseTo(24 * spacingScale, 1)

  await waitForLifecycleIdle(page)
  const fontNoopBatch = await batchId(themeFit)
  const fontNoopDebug = (await debugSnapshot(page)).batchCount
  for (let eventIndex = 0; eventIndex < 2; eventIndex += 1) {
    await page.evaluate(() => {
      document.fonts.dispatchEvent(new Event('loadingdone'))
    })
    await waitForAnimationFrames(page, 2)
    expect(await batchId(themeFit)).toBe(fontNoopBatch)
    expect((await debugSnapshot(page)).batchCount).toBe(fontNoopDebug)
  }

  const fontCompletionScale = Number(await themeFit.getAttribute('data-autofit-scale'))
  const fontCompletionSize = await page.getByTestId('theme-reactive-copy')
    .evaluate(element => Number.parseFloat(getComputedStyle(element).fontSize))
  expect(fontCompletionSize).toBeCloseTo(30 * fontCompletionScale, 5)
})

test('recaptures class-driven typography and base spacing without treating reveal classes as style changes', async ({ page }) => {
  await gotoSlide(page, 35, 'reactive-dom-slide')

  const context = page.getByTestId('class-context')
  const autofit = page.getByTestId('class-context-reactive')
  const copy = page.getByTestId('class-context-copy')
  await waitForStable(autofit)
  await waitForLifecycleIdle(page)
  await page.waitForTimeout(250)
  await resetDebug(page)

  const initialBatch = await batchId(autofit)
  await context.evaluate(element => element.classList.add('autofit-class-context--large'))
  await expect.poll(() => batchId(autofit)).not.toBe(initialBatch)

  const typographyScale = Number(await autofit.getAttribute('data-autofit-scale'))
  const fontSize = await copy.evaluate(element =>
    Number.parseFloat(getComputedStyle(element).fontSize))
  expect(fontSize).toBeCloseTo(20 * typographyScale, 5)

  const typographyBatch = await batchId(autofit)
  await context.evaluate(element => element.classList.add('autofit-class-context--spaced'))
  await expect.poll(() => batchId(autofit)).not.toBe(typographyBatch)
  const spacingScale = Number(await autofit.getAttribute('data-autofit-scale'))
  const gap = await textVisualGap(
    page,
    'class-context-copy',
    'class-context-second',
  )
  expect(gap).toBeCloseTo(24 * spacingScale, 1)

  await waitForLifecycleIdle(page)
  await resetDebug(page)
  const stableBatch = await batchId(autofit)
  await context.evaluate((element) => {
    element.classList.add('autofit-class-context-reveal-noop')
  })
  await page.waitForTimeout(250)
  expect(await batchId(autofit)).toBe(stableBatch)
  expect((await debugSnapshot(page)).batchCount).toBe(0)
})

test('restores the last stable presentation when a replacement pass defers', async ({ page }) => {
  await gotoSlide(page, 32, 'lifecycle-harness')

  const autofit = page.getByTestId('deferred-reactive')
  const copy = page.getByTestId('deferred-reactive-copy')
  await waitForStable(autofit)
  await waitForLifecycleIdle(page)

  const stableTier = await autofit.getAttribute('data-autofit-tier')
  const stableState = await autofit.getAttribute('data-autofit-state')
  const stableBatch = await batchId(autofit)
  const stableFont = await copy.evaluate(element => getComputedStyle(element).fontSize)
  expect(stableTier).toMatch(/^-[1-4]$/)

  await autofit.evaluate((root) => {
    const original = root.getBoundingClientRect.bind(root)
    Object.assign(root, { __autofitOriginalRect: original })
    root.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
  })
  await copy.evaluate((element) => {
    element.textContent = 'Deferred replacement'
  })
  await page.waitForTimeout(250)

  await expect(autofit).toHaveAttribute('data-autofit-state', stableState!)
  await expect(autofit).toHaveAttribute('data-autofit-tier', stableTier!)
  await expect(copy).toHaveCSS('font-size', stableFont)
  expect(await batchId(autofit)).toBe(stableBatch)

  await resetDebug(page)
  await page.getByTestId('deferred-reactive-image').evaluate((element) => {
    element.dispatchEvent(new Event('load'))
  })
  await page.evaluate(() => {
    document.fonts.dispatchEvent(new Event('loadingdone'))
  })
  await page.waitForTimeout(250)
  expect(await batchId(autofit)).toBe(stableBatch)
  expect((await debugSnapshot(page)).batchCount).toBe(0)

  await autofit.evaluate((root) => {
    const target = root as HTMLElement & {
      __autofitOriginalRect?: typeof root.getBoundingClientRect
    }
    root.getBoundingClientRect = target.__autofitOriginalRect!
  })
  await copy.evaluate((element) => {
    element.textContent = 'Recovered replacement'
  })
  await expect.poll(() => batchId(autofit)).not.toBe(stableBatch)
})

test('preserves an author mutation interleaved with generated style writes', async ({ page }) => {
  await gotoSlide(page, 32, 'lifecycle-harness')

  const autofit = page.getByTestId('prop-reactive')
  const copy = page.getByTestId('prop-reactive-copy')
  await waitForStable(autofit)
  await waitForLifecycleIdle(page)
  await resetDebug(page)

  await copy.evaluate((element) => {
    const copyElement = element as HTMLElement
    const style = copyElement.style
    const originalSetProperty = style.setProperty.bind(style)
    let mutated = false
    style.setProperty = (
      property: string,
      value: string | null,
      priority?: string,
    ): void => {
      originalSetProperty(property, value, priority)
      if (!mutated && property === 'font-size') {
        mutated = true
        copyElement.textContent
          = 'An author replacement interleaved with an autofit generated write.'
      }
    }
  })

  await page.getByTestId('expand-tier-range').click()
  await expect(copy).toContainText('author replacement interleaved')
  await expect.poll(async () => (await debugSnapshot(page)).discardedJobCount)
    .toBeGreaterThan(0)
  await waitForStable(autofit)
})

test('defers a non-rendered instance without candidate measurements and recovers once visible', async ({ page }) => {
  await gotoSlide(page, 33, 'hidden-autofit-host')

  const hiddenHost = page.getByTestId('hidden-autofit-host')
  const autofit = page.getByTestId('hidden-autofit')
  await expect(autofit).toHaveAttribute('data-autofit-state', 'pending')
  await expect(autofit).toHaveAttribute('data-autofit-measure-count', '0')
  await expect(autofit).toHaveAttribute('data-autofit-batch-id', '0')
  await expect(autofit.locator('.autofit__viewport')).toHaveCSS('visibility', 'hidden')

  const before = await debugSnapshot(page)
  expect(before.candidateMeasurements.every(entry => entry.count > 0)).toBe(true)

  await hiddenHost.evaluate((element) => {
    ;(element as HTMLElement).style.display = 'block'
  })
  await waitForStable(autofit)
  expect(await measureCount(autofit)).toBeGreaterThan(0)
  expect(await batchId(autofit)).toBeGreaterThan(0)
  await expect(autofit.locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
})

test('ignores reveal-only and repeated no-op class mutations but remeasures display removal', async ({ page }) => {
  await gotoSlide(page, 34, 'reveal-autofit')

  const autofit = page.getByTestId('reveal-autofit')
  await waitForStable(autofit)
  await waitForLifecycleIdle(page)
  await resetDebug(page)

  const before = await autofit.evaluate((root) => {
    const ids = ['single-reveal', 'multi-reveal-one', 'multi-reveal-two']
    return {
      tier: root.getAttribute('data-autofit-tier'),
      fullGaps: root.getAttribute('data-autofit-full-gaps'),
      halfGaps: root.getAttribute('data-autofit-half-gaps'),
      batch: root.getAttribute('data-autofit-batch-id'),
      measureCount: root.getAttribute('data-autofit-measure-count'),
      rectangles: ids.map((id) => {
        const rect = root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!
          .getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      }),
    }
  })

  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('single-reveal').evaluate((element) => {
    for (let index = 0; index < 6; index += 1)
      element.classList.toggle('autofit-noop-opacity')
  })
  await page.waitForTimeout(100)

  const after = await autofit.evaluate((root) => {
    const ids = ['single-reveal', 'multi-reveal-one', 'multi-reveal-two']
    return {
      tier: root.getAttribute('data-autofit-tier'),
      fullGaps: root.getAttribute('data-autofit-full-gaps'),
      halfGaps: root.getAttribute('data-autofit-half-gaps'),
      batch: root.getAttribute('data-autofit-batch-id'),
      measureCount: root.getAttribute('data-autofit-measure-count'),
      rectangles: ids.map((id) => {
        const rect = root.querySelector<HTMLElement>(`[data-testid="${id}"]`)!
          .getBoundingClientRect()
        return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
      }),
    }
  })
  expect(after).toEqual(before)
  expect((await debugSnapshot(page)).batchCount).toBe(0)

  await page.getByTestId('geometry-removing-reveal').evaluate((element) => {
    ;(element as HTMLElement).style.display = 'none'
  })
  await expect(autofit).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(autofit).toHaveAttribute(
    'data-autofit-unsupported-reason',
    'visual-rect-missing',
  )
})

test('supersedes stale work and removes observers and queued work on unmount', async ({ page }) => {
  await gotoSlide(page, 36, 'unmount-harness')

  const target = page.getByTestId('unmount-isolated')
  await waitForStable(target)
  await waitForLifecycleIdle(page)
  await resetDebug(page)

  await page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(
      '[data-testid="unmount-isolated"]',
    )!
    Object.assign(window, {
      __autofitDetachedRoot: root,
      __autofitDetachedCopy: root.querySelector<HTMLElement>(
        '[data-testid="unmount-isolated-copy"]',
      ),
      __autofitDetachedImage: root.querySelector<HTMLImageElement>(
        '[data-testid="unmount-isolated-image"]',
      ),
    })
  })

  await page.evaluate(() => {
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    const heldFrames: FrameRequestCallback[] = []
    Object.assign(window, {
      __autofitHeldFrames: heldFrames,
      __autofitOriginalRequestFrame: originalRequestFrame,
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 200_000 + heldFrames.length
    }
  })
  const targetCopy = page.getByTestId('unmount-isolated-copy')
  await targetCopy.evaluate((element) => {
    element.textContent = 'First queued replacement'
  })
  await page.waitForTimeout(20)
  await targetCopy.evaluate((element) => {
    element.textContent = 'Second superseding replacement'
  })
  await page.waitForTimeout(20)
  await page.getByTestId('unmount-isolated-target').click()
  await expect(target).toHaveCount(0)

  await page.evaluate(() => {
    const targetWindow = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = targetWindow.__autofitOriginalRequestFrame!
    for (const callback of targetWindow.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await page.waitForTimeout(100)

  const snapshot = await debugSnapshot(page)
  expect(snapshot.discardedJobCount).toBeGreaterThan(0)

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitDetachedRoot?: HTMLElement
      __autofitDetachedCopy?: HTMLElement
      __autofitDetachedImage?: HTMLImageElement
    }
    target.__autofitDetachedCopy!.textContent = 'Detached author mutation'
    target.__autofitDetachedRoot!.style.width = '90px'
    target.__autofitDetachedImage!.dispatchEvent(new Event('load'))
    window.dispatchEvent(new Event('resize'))
    document.fonts.dispatchEvent(new Event('loadingdone'))

    const style = document.createElement('style')
    style.textContent = '.detached-autofit-cleanup-probe { font-size: 99px; }'
    document.head.append(style)
  })
  await page.waitForTimeout(500)

  expect(await debugSnapshot(page)).toEqual(snapshot)
})

test('leaves a queued static-fit microtask fully inert after unmount', async ({ page }) => {
  await gotoSlide(page, 36, 'unmount-harness')

  const target = page.getByTestId('unmount-isolated')
  await waitForStable(target)
  await waitForLifecycleIdle(page)
  await resetDebug(page)

  await page.evaluate(() => {
    const heldMicrotasks: VoidFunction[] = []
    Object.assign(window, {
      __autofitHeldMicrotasks: heldMicrotasks,
      __autofitOriginalQueueMicrotask: window.queueMicrotask.bind(window),
      __autofitWarnings: [] as string[],
    })
    const originalWarn = console.warn.bind(console)
    console.warn = (...values: unknown[]): void => {
      ;(window as typeof window & { __autofitWarnings?: string[] })
        .__autofitWarnings?.push(values.map(String).join(' '))
      originalWarn(...values)
    }
    window.queueMicrotask = (callback: VoidFunction): void => {
      heldMicrotasks.push(callback)
    }
  })

  await page.getByTestId('invalidate-isolated-target').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitHeldMicrotasks?: VoidFunction[]
    }).__autofitHeldMicrotasks?.length ?? 0
  })).toBeGreaterThan(0)

  await target.evaluate((element) => {
    Object.assign(window, { __autofitQueuedDetachedRoot: element })
  })
  await page.getByTestId('unmount-isolated-target').click()
  await expect(target).toHaveCount(0)
  const debugBefore = await debugSnapshot(page)
  const detachedState = await page.evaluate(() => {
    const element = (window as typeof window & {
      __autofitQueuedDetachedRoot?: HTMLElement
    }).__autofitQueuedDetachedRoot!
    return {
      state: element.getAttribute('data-autofit-state'),
      tier: element.getAttribute('data-autofit-tier'),
      batch: element.getAttribute('data-autofit-batch-id'),
      measureCount: element.getAttribute('data-autofit-measure-count'),
    }
  })

  await page.evaluate(() => {
    const targetWindow = window as typeof window & {
      __autofitHeldMicrotasks?: VoidFunction[]
      __autofitOriginalQueueMicrotask?: typeof queueMicrotask
    }
    window.queueMicrotask = targetWindow.__autofitOriginalQueueMicrotask!
    for (const callback of targetWindow.__autofitHeldMicrotasks?.splice(0) ?? [])
      callback()
  })
  await page.waitForTimeout(100)

  const after = await page.evaluate(() => {
    const targetWindow = window as typeof window & {
      __autofitQueuedDetachedRoot?: HTMLElement
      __autofitWarnings?: string[]
    }
    const element = targetWindow.__autofitQueuedDetachedRoot!
    return {
      state: element.getAttribute('data-autofit-state'),
      tier: element.getAttribute('data-autofit-tier'),
      batch: element.getAttribute('data-autofit-batch-id'),
      measureCount: element.getAttribute('data-autofit-measure-count'),
      warnings: targetWindow.__autofitWarnings ?? [],
    }
  })
  expect(after).toMatchObject({ ...detachedState, warnings: [] })
  expect(await debugSnapshot(page)).toEqual(debugBefore)
})

test('retains the published AutoFit presentation through a Vue leave transition', async ({ page }) => {
  await gotoSlide(page, 160, 'autofit-transition-unmount-harness')

  const fit = page.getByTestId('autofit-transition-fit')
  const overflow = page.getByTestId('autofit-transition-overflow')
  const unsupported = page.getByTestId('autofit-transition-unsupported')
  const empty = page.getByTestId('autofit-transition-empty')
  const pending = page.getByTestId('autofit-transition-pending')
  await waitForStable(fit)
  await waitForStable(overflow)
  await waitForStable(unsupported)
  await expect(empty).toHaveAttribute('data-autofit-empty', 'true')

  const fitBefore = await retainedPresentation(fit)
  const overflowBefore = await retainedPresentation(overflow)
  const emptyBefore = await retainedPresentation(empty)

  await page.evaluate(() => {
    Object.assign(window, {
      __slidevAutofitTestHooks: {
        forceDistributedVerificationFailure: (viewport: HTMLElement): boolean => {
          return viewport.closest('[data-testid="autofit-transition-unsupported"]')
            ?.hasAttribute('data-autofit-test-force-unsupported') ?? false
        },
        forceRestoredBaseVerificationFailure: (viewport: HTMLElement): boolean => {
          return viewport.closest('[data-testid="autofit-transition-unsupported"]')
            ?.hasAttribute('data-autofit-test-force-unsupported') ?? false
        },
      },
    })
    document.querySelector<HTMLElement>(
      '[data-testid="autofit-transition-unsupported"]',
    )!.dispatchEvent(new Event('slidev-autofit-test-supersede'))
  })
  await page.getByTestId('autofit-transition-force-unsupported').click()
  await page.evaluate(() => {
    document.querySelector<HTMLElement>(
      '[data-testid="autofit-transition-unsupported"]',
    )!.dispatchEvent(new Event('slidev-autofit-test-supersede'))
  })
  await expect(unsupported).toHaveAttribute('data-autofit-state', 'unsupported')
  const unsupportedBefore = await retainedPresentation(unsupported)
  expect(unsupportedBefore).not.toEqual(fitBefore)

  await page.evaluate(() => {
    const heldFrames: FrameRequestCallback[] = []
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    Object.assign(window, {
      __autofitHeldFrames: heldFrames,
      __autofitOriginalRequestFrame: originalRequestFrame,
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 500_000 + heldFrames.length
    }
    for (const root of document.querySelectorAll<HTMLElement>(
      '[data-testid="autofit-transition-fit"], [data-testid="autofit-transition-overflow"]',
    )) {
      root.dispatchEvent(new Event('slidev-autofit-test-supersede'))
    }
  })
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
    }).__autofitHeldFrames?.length ?? 0
  })).toBeGreaterThan(0)

  await page.getByTestId('autofit-transition-remove-fit').click()
  await page.getByTestId('autofit-transition-remove-overflow').click()
  await page.getByTestId('autofit-transition-remove-empty').click()

  await expect(fit).toBeAttached()
  await expect(overflow).toBeAttached()
  await expect(empty).toBeAttached()
  expect(await retainedPresentation(fit)).toEqual(fitBefore)
  expect(await retainedPresentation(overflow)).toEqual(overflowBefore)
  expect(await retainedPresentation(empty)).toEqual(emptyBefore)

  await page.getByTestId('autofit-transition-remove-unsupported').click()
  await expect(unsupported).toBeAttached()
  expect(await retainedPresentation(unsupported)).toEqual(unsupportedBefore)

  await page.getByTestId('autofit-transition-start-pending').click()
  await expect(pending).toHaveAttribute('data-autofit-state', 'pending')
  const pendingBefore = await retainedPresentation(pending)
  await page.getByTestId('autofit-transition-remove-pending').click()
  await expect(pending).toBeAttached()
  expect(await retainedPresentation(pending)).toEqual(pendingBefore)
  await expect(pending.locator('.autofit__flow')).not.toHaveCSS(
    'transition-property',
    'none',
  )

  const beforeStaleFrames = await Promise.all([
    retainedPresentation(fit),
    retainedPresentation(overflow),
    retainedPresentation(unsupported),
    retainedPresentation(empty),
    retainedPresentation(pending),
  ])
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await page.waitForTimeout(50)
  await expect(fit).toBeAttached()
  await expect(overflow).toBeAttached()
  await expect(unsupported).toBeAttached()
  await expect(empty).toBeAttached()
  await expect(pending).toBeAttached()
  await expect(Promise.all([
    retainedPresentation(fit),
    retainedPresentation(overflow),
    retainedPresentation(unsupported),
    retainedPresentation(empty),
    retainedPresentation(pending),
  ])).resolves.toEqual(beforeStaleFrames)
})

test('keeps content added to a stable empty slot hidden between candidate frames', async ({ page }) => {
  await gotoSlide(page, 37, 'empty-transition-harness')

  const autofit = page.getByTestId('empty-transition')
  await waitForStable(autofit)
  await expect(autofit).toHaveAttribute('data-autofit-empty', 'true')
  await expect(autofit).toHaveAttribute('data-autofit-batch-id', '0')

  await page.evaluate(() => {
    const heldFrames: FrameRequestCallback[] = []
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    Object.assign(window, {
      __autofitHeldFrames: heldFrames,
      __autofitOriginalRequestFrame: originalRequestFrame,
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 300_000 + heldFrames.length
    }
  })

  await page.getByTestId('add-empty-transition-content').click()
  const copy = page.getByTestId('empty-transition-copy')
  await expect(copy).toBeAttached()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
    }).__autofitHeldFrames?.length ?? 0
  })).toBeGreaterThan(0)

  await expect(autofit).toHaveAttribute('data-autofit-state', 'pending')
  await expect(autofit).not.toHaveAttribute('data-autofit-tier')
  await expect(autofit).not.toHaveAttribute('data-autofit-scale')
  await expect(autofit).not.toHaveAttribute('data-autofit-full-gaps')
  await expect(autofit).not.toHaveAttribute('data-autofit-half-gaps')
  await expect(autofit.locator('.autofit__viewport')).toHaveCSS(
    'visibility',
    'hidden',
  )

  for (let candidate = 0; candidate < 2; candidate += 1) {
    await page.evaluate(() => {
      const callback = (window as typeof window & {
        __autofitHeldFrames?: FrameRequestCallback[]
      }).__autofitHeldFrames?.shift()
      if (!callback)
        throw new Error('expected a held empty-transition candidate frame')
      callback(performance.now())
    })
    await page.waitForTimeout(20)
    await expect(autofit).toHaveAttribute('data-autofit-state', 'pending')
    await expect(autofit.locator('.autofit__viewport')).toHaveCSS(
      'visibility',
      'hidden',
    )
    await expect(autofit).toHaveAttribute('data-autofit-batch-id', '0')
  }

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })

  await waitForStable(autofit)
  await expect(autofit).not.toHaveAttribute('data-autofit-empty')
  expect(await batchId(autofit)).toBeGreaterThan(0)
  expect(await measureCount(autofit)).toBeGreaterThan(0)
  await expect(autofit.locator('.autofit__viewport')).toHaveCSS(
    'visibility',
    'visible',
  )
})

test('restores exact stable presentations only for matching topology and exposes incompatible neutral pending content', async ({ page }) => {
  await gotoSlide(page, 42, 'topology-harness')
  const autofit = page.getByTestId('topology-autofit')
  await waitForStable(autofit)
  await waitForLifecycleIdle(page)

  const stable = await autofit.evaluate((root) => ({
    tier: root.getAttribute('data-autofit-tier'),
    scale: root.getAttribute('data-autofit-scale'),
    effectiveAlignment: root.getAttribute('data-autofit-effective-alignment'),
    margins: [...root.querySelectorAll<HTMLElement>('.autofit__flow > p')]
      .map(element => getComputedStyle(element).marginBlockStart),
    padding: getComputedStyle(root.querySelector('.autofit__flow')!)
      .paddingBlockStart,
  }))

  await page.evaluate(() => {
    const frames: FrameRequestCallback[] = []
    Object.assign(window, {
      __autofitHeldFrames: frames,
      __autofitOriginalRequestFrame: window.requestAnimationFrame.bind(window),
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      frames.push(callback)
      return 400_000 + frames.length
    }
  })
  await page.getByTestId('topology-compatible').click()
  await page.waitForTimeout(20)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  expect(await autofit.evaluate((root) => ({
    tier: root.getAttribute('data-autofit-tier'),
    scale: root.getAttribute('data-autofit-scale'),
    effectiveAlignment: root.getAttribute('data-autofit-effective-alignment'),
    margins: [...root.querySelectorAll<HTMLElement>('.autofit__flow > p')]
      .map(element => getComputedStyle(element).marginBlockStart),
    padding: getComputedStyle(root.querySelector('.autofit__flow')!)
      .paddingBlockStart,
  }))).toEqual(stable)

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await waitForStable(autofit)

  for (const action of ['insert', 'reorder', 'replace', 'remove'] as const) {
    await page.evaluate(() => {
      const frames: FrameRequestCallback[] = []
      Object.assign(window, {
        __autofitHeldFrames: frames,
        __autofitOriginalRequestFrame: window.requestAnimationFrame.bind(window),
      })
      window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
        frames.push(callback)
        return 500_000 + frames.length
      }
    })
    await page.getByTestId(`topology-${action}`).click()
    await page.waitForTimeout(20)
    await expect(autofit).toHaveAttribute('data-autofit-state', 'pending')
    await expect(autofit).toHaveClass(/autofit--pending-visible/)
    await expect(autofit).not.toHaveAttribute('data-autofit-tier')
    await expect(autofit).not.toHaveAttribute('data-autofit-scale')
    await expect(autofit).not.toHaveAttribute('data-autofit-full-gaps')
    await expect(autofit).not.toHaveAttribute('data-autofit-half-gaps')
    await expect(autofit).toHaveAttribute(
      'data-autofit-effective-alignment',
      'top',
    )
    await expect(autofit.locator('.autofit__viewport')).toHaveCSS(
      'visibility',
      'visible',
    )
    const pendingStyles = await autofit.evaluate(root => ({
      margins: [...root.querySelectorAll<HTMLElement>('.autofit__flow > p')]
        .map(element => element.style.marginBlockStart),
      fontSizes: [...root.querySelectorAll<HTMLElement>('.autofit__flow > p')]
        .map(element => element.style.fontSize),
      padding: (root.querySelector<HTMLElement>('.autofit__flow')!)
        .style.paddingBlockStart,
    }))
    expect(pendingStyles.margins.every(value => value === '')).toBe(true)
    expect(pendingStyles.fontSizes.every(value => value === '14px')).toBe(true)
    expect(pendingStyles.padding).toBe('')

    await page.evaluate(() => {
      const target = window as typeof window & {
        __autofitHeldFrames?: FrameRequestCallback[]
        __autofitOriginalRequestFrame?: typeof requestAnimationFrame
      }
      window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
      for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
        callback(performance.now())
    })
    await waitForStable(autofit)
  }

  await autofit.evaluate((root) => {
    root.querySelector('.autofit__flow > p:last-child')?.remove()
    window.dispatchEvent(new Event('resize'))
  })
  await expect(autofit).not.toHaveAttribute('data-autofit-state', 'unsupported')
  await waitForStable(autofit)
})

test('drops an incompatible stable presentation before hidden deferral and cleans detached carriers', async ({ page }) => {
  await gotoSlide(page, 42, 'topology-harness')
  const harness = page.getByTestId('topology-harness')
  const autofit = page.getByTestId('topology-autofit')
  await waitForStable(autofit)

  await autofit.evaluate((root) => {
    const detached = root.querySelector<HTMLElement>('.autofit__flow > p:last-child')!
    ;(window as typeof window & {
      __autofitDetachedTopologyCarrier?: HTMLElement
    }).__autofitDetachedTopologyCarrier = detached
  })
  await harness.evaluate((element) => {
    element.style.display = 'none'
    element.querySelector('.autofit__flow > p:last-child')?.remove()
  })

  await expect(autofit).toHaveAttribute('data-autofit-state', 'pending')
  await expect(autofit).toHaveClass(/autofit--pending-visible/)
  await expect(autofit).not.toHaveAttribute('data-autofit-tier')
  await expect(autofit).not.toHaveAttribute('data-autofit-scale')
  await expect(autofit).not.toHaveAttribute('data-autofit-full-gaps')
  await expect(autofit).not.toHaveAttribute('data-autofit-half-gaps')
  await expect(autofit).toHaveAttribute('data-autofit-effective-alignment', 'top')
  expect(await autofit.evaluate((root) => {
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    const connected = flow.querySelector<HTMLElement>(':scope > p')!
    return {
      margin: connected.style.marginBlockStart,
      fontSize: connected.style.fontSize,
      paddingBefore: flow.style.paddingBlockStart,
      paddingAfter: flow.style.paddingBlockEnd,
    }
  })).toEqual({
    margin: '',
    fontSize: '14px',
    paddingBefore: '',
    paddingAfter: '',
  })
  expect(await page.evaluate(() => {
    const detached = (window as typeof window & {
      __autofitDetachedTopologyCarrier?: HTMLElement
    }).__autofitDetachedTopologyCarrier!
    return {
      connected: detached.isConnected,
      margin: detached.style.marginBlockStart,
      fontSize: detached.style.fontSize,
    }
  })).toEqual({
    connected: false,
    margin: '',
    fontSize: '14px',
  })

  await harness.evaluate((element) => {
    element.style.display = ''
    window.dispatchEvent(new Event('resize'))
  })
  await waitForStable(autofit)
})

test('keeps incompatible visible-pending content neutral and top-aligned through supersession', async ({ page }) => {
  await gotoSlide(page, 42, 'topology-harness')
  const autofit = page.getByTestId('topology-autofit')
  await waitForStable(autofit)

  await page.evaluate(() => {
    const frames: FrameRequestCallback[] = []
    Object.assign(window, {
      __autofitHeldFrames: frames,
      __autofitOriginalRequestFrame: window.requestAnimationFrame.bind(window),
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      frames.push(callback)
      return 700_000 + frames.length
    }
  })
  await page.getByTestId('topology-insert').click()
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
    }).__autofitHeldFrames?.length ?? 0,
  )).toBeGreaterThan(0)

  async function expectVisibleNeutralPending(): Promise<void> {
    await expect(autofit).toHaveAttribute('data-autofit-state', 'pending')
    await expect(autofit).toHaveClass(/autofit--pending-visible/)
    await expect(autofit).toHaveAttribute(
      'data-autofit-effective-alignment',
      'top',
    )
    await expect(autofit).not.toHaveAttribute('data-autofit-tier')
    await expect(autofit).not.toHaveAttribute('data-autofit-scale')
    await expect(autofit).not.toHaveAttribute('data-autofit-full-gaps')
    await expect(autofit).not.toHaveAttribute('data-autofit-half-gaps')
    expect(await autofit.evaluate((root) => {
      const flow = root.querySelector<HTMLElement>('.autofit__flow')!
      return {
        margins: [...flow.querySelectorAll<HTMLElement>(':scope > p')]
          .map(element => element.style.marginBlockStart),
        fonts: [...flow.querySelectorAll<HTMLElement>(':scope > p')]
          .map(element => element.style.fontSize),
        paddingBefore: flow.style.paddingBlockStart,
        paddingAfter: flow.style.paddingBlockEnd,
      }
    })).toEqual({
      margins: ['', '', ''],
      fonts: ['14px', '14px', '14px'],
      paddingBefore: '',
      paddingAfter: '',
    })
  }

  await expectVisibleNeutralPending()
  await page.getByTestId('topology-compatible').click()
  await page.waitForTimeout(30)
  await expectVisibleNeutralPending()

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await waitForStable(autofit)
})

test('re-suppresses authored transitions for every incompatible candidate round', async ({ page }) => {
  await gotoSlide(page, 42, 'topology-harness')
  const autofit = page.getByTestId('topology-autofit')
  await waitForStable(autofit)

  const authoredTransitions = await autofit.evaluate((root) => {
    const targets = [...root.querySelectorAll<HTMLElement>('.autofit__flow > p')]
    const reads: string[] = []
    const events: string[] = []
    const original = Range.prototype.getClientRects
    Range.prototype.getClientRects = function (): DOMRectList {
      reads.push(getComputedStyle(targets[0]).transitionProperty)
      return original.call(this)
    }
    for (const target of targets) {
      for (const name of ['transitionrun', 'transitionstart', 'transitionend'])
        target.addEventListener(name, () => events.push(name))
    }
    Object.assign(window, {
      __autofitTransitionReads: reads,
      __autofitTransitionEvents: events,
    })
    return targets.map(target => ({
      declaration: target.style.getPropertyValue('transition'),
      priority: target.style.getPropertyPriority('transition'),
    }))
  })
  await page.evaluate(() => {
    const frames: FrameRequestCallback[] = []
    Object.assign(window, {
      __autofitHeldFrames: frames,
      __autofitOriginalRequestFrame: window.requestAnimationFrame.bind(window),
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      frames.push(callback)
      return 800_000 + frames.length
    }
  })
  await page.getByTestId('topology-insert').click()
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
    }).__autofitHeldFrames?.length ?? 0,
  )).toBeGreaterThan(0)

  for (let round = 0; round < 2; round += 1) {
    const readsBefore = await page.evaluate(() =>
      (window as typeof window & {
        __autofitTransitionReads?: string[]
      }).__autofitTransitionReads?.length ?? 0,
    )
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await page.evaluate(() => {
        const callback = (window as typeof window & {
          __autofitHeldFrames?: FrameRequestCallback[]
        }).__autofitHeldFrames?.shift()
        if (!callback)
          throw new Error('expected a held frame before the next candidate')
        callback(performance.now())
      })
      await page.waitForTimeout(20)
      const readsNow = await page.evaluate(() =>
        (window as typeof window & {
          __autofitTransitionReads?: string[]
        }).__autofitTransitionReads?.length ?? 0,
      )
      if (readsNow > readsBefore)
        break
    }
    const roundState = await autofit.evaluate((root, start) => ({
      readTransitions: (window as typeof window & {
        __autofitTransitionReads?: string[]
      }).__autofitTransitionReads?.slice(start) ?? [],
      restoredTransitions: [
        ...root.querySelectorAll<HTMLElement>('.autofit__flow > p'),
      ].map(target => getComputedStyle(target).transitionProperty),
    }), readsBefore)
    expect(roundState.readTransitions.length).toBeGreaterThan(0)
    expect(roundState.readTransitions.every(value => value === 'none')).toBe(true)
    expect(roundState.restoredTransitions.every(value => value === 'all')).toBe(true)
  }

  expect(await page.evaluate(() =>
    (window as typeof window & {
      __autofitTransitionEvents?: string[]
    }).__autofitTransitionEvents ?? [],
  )).toEqual([])

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await waitForStable(autofit)
  await expect(autofit.locator('.autofit__flow > p').first()).toHaveCSS(
    'transition-property',
    'all',
  )
  expect(await autofit.evaluate(root =>
    [...root.querySelectorAll<HTMLElement>('.autofit__flow > p')]
      .slice(0, 2)
      .map(target => ({
        declaration: target.style.getPropertyValue('transition'),
        priority: target.style.getPropertyPriority('transition'),
      })),
  )).toEqual(authoredTransitions)
})

test('keeps non-neutral root and whole-list reveals transition-safe with zero scheduler work', async ({ page }) => {
  await gotoSlide(page, 43, 'root-v-click-autofit')
  const rootReveal = page.getByTestId('root-v-click-autofit')
  const listReveal = page.getByTestId('whole-list-v-clicks-autofit')
  await waitForStable(rootReveal)
  await waitForStable(listReveal)
  await waitForLifecycleIdle(page)

  async function snapshot() {
    return page.evaluate(() => {
      function rootState(testId: string, targetIds: string[]) {
        const root = document.querySelector<HTMLElement>(
          `[data-testid="${testId}"]`,
        )!
        const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
        const clickRoot = root.querySelector<HTMLElement>(
          '[data-testid="root-v-click-target"]',
        ) ?? root
        const localScale = viewport.getBoundingClientRect().height
          / Number.parseFloat(getComputedStyle(viewport).height)
        const targets = targetIds.map((id) => {
          const target = document.querySelector<HTMLElement>(
            `[data-testid="${id}"]`,
          )!
          const rectangle = target.getBoundingClientRect()
          return {
            id,
            classes: [...target.classList],
            clickData: [...target.attributes]
              .filter(attribute =>
                attribute.name.includes('click')
                || attribute.name.startsWith('data-slidev'),
              )
              .map(attribute => [attribute.name, attribute.value]),
            opacity: getComputedStyle(target).opacity,
            pointerEvents: getComputedStyle(target).pointerEvents,
            transitionProperty: getComputedStyle(target).transitionProperty,
            transitionDuration: getComputedStyle(target).transitionDuration,
            authoredTransition: target.style.getPropertyValue('transition'),
            authoredTransitionPriority:
              target.style.getPropertyPriority('transition'),
            rectangle: {
              left: rectangle.left / localScale,
              top: rectangle.top / localScale,
              width: rectangle.width / localScale,
              height: rectangle.height / localScale,
            },
          }
        })
        return {
          tier: root.dataset.autofitTier,
          scale: root.dataset.autofitScale,
          alignment: root.dataset.autofitEffectiveAlignment,
          fullGaps: root.dataset.autofitFullGaps,
          halfGaps: root.dataset.autofitHalfGaps,
          rootClasses: [...clickRoot.classList],
          rootClickData: [...clickRoot.attributes]
            .filter(attribute =>
              attribute.name.includes('click')
              || attribute.name.startsWith('data-slidev'),
            )
            .map(attribute => [attribute.name, attribute.value]),
          rootOpacity: getComputedStyle(clickRoot).opacity,
          rootPointerEvents: getComputedStyle(clickRoot).pointerEvents,
          rootTransitionProperty:
            getComputedStyle(clickRoot).transitionProperty,
          rootTransitionDuration:
            getComputedStyle(clickRoot).transitionDuration,
          rootAuthoredTransition:
            clickRoot.style.getPropertyValue('transition'),
          rootAuthoredTransitionPriority:
            clickRoot.style.getPropertyPriority('transition'),
          targets,
        }
      }
      return {
        root: rootState('root-v-click-autofit', [
          'root-v-click-first',
          'root-v-click-second',
        ]),
        list: rootState('whole-list-v-clicks-autofit', [
          'whole-list-v-clicks-one',
          'whole-list-v-clicks-two',
          'whole-list-v-clicks-three',
        ]),
      }
    })
  }

  const before = await snapshot()
  async function gaps() {
    return {
      root: await textVisualGap(
        page,
        'root-v-click-first',
        'root-v-click-second',
      ),
      listFirst: await textVisualGap(
        page,
        'whole-list-v-clicks-one',
        'whole-list-v-clicks-two',
      ),
      listSecond: await textVisualGap(
        page,
        'whole-list-v-clicks-two',
        'whole-list-v-clicks-three',
      ),
    }
  }
  const beforeGaps = await gaps()
  expect(before.root.tier).toBe('-2')
  expect(before.list.tier).toBe('-3')
  expect(before.root.targets.every(
    target => target.transitionProperty === 'all'
      && target.transitionDuration === '0.37s',
  )).toBe(true)
  expect(before.list.targets.every(
    target => target.transitionProperty === 'all'
      && target.transitionDuration === '0.37s',
  )).toBe(true)
  expect([
    before.root.rootTransitionProperty,
    before.root.rootTransitionDuration,
  ]).toEqual(['all', '0.37s'])
  expect(before.root.rootClasses).toContain('slidev-vclick-hidden')
  expect(before.root.rootOpacity).toBe('0')
  expect(before.root.rootPointerEvents).toBe('none')
  expect(before.list.targets.every(
    target =>
      target.classes.includes('slidev-vclick-hidden')
      && target.opacity === '0'
      && target.pointerEvents === 'none',
  )).toBe(true)

  await resetDebug(page)
  function clickClasses(classes: readonly string[]): string[] {
    return classes
      .filter(className => className.startsWith('slidev-vclick-'))
      .sort()
  }
  function expectedClickClasses(
    baseline: readonly string[],
    state: 'current' | 'hidden' | 'prior',
  ): string[] {
    return [
      ...clickClasses(baseline).filter(className =>
        ![
          'slidev-vclick-current',
          'slidev-vclick-hidden',
          'slidev-vclick-prior',
        ].includes(className),
      ),
      `slidev-vclick-${state}`,
    ].sort()
  }

  for (let clickStep = 1; clickStep <= 4; clickStep += 1) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(450)
    const current = await snapshot()

    expect(current.root).toMatchObject({
      tier: before.root.tier,
      scale: before.root.scale,
      alignment: before.root.alignment,
      fullGaps: before.root.fullGaps,
      halfGaps: before.root.halfGaps,
      rootClickData: before.root.rootClickData,
      rootOpacity: '1',
      rootTransitionProperty: before.root.rootTransitionProperty,
      rootTransitionDuration: before.root.rootTransitionDuration,
      rootAuthoredTransition: before.root.rootAuthoredTransition,
      rootAuthoredTransitionPriority:
        before.root.rootAuthoredTransitionPriority,
    })
    expect(current.list).toMatchObject({
      tier: before.list.tier,
      scale: before.list.scale,
      alignment: before.list.alignment,
      fullGaps: before.list.fullGaps,
      halfGaps: before.list.halfGaps,
    })
    expect(current.root.rootPointerEvents).not.toBe('none')
    expect(clickClasses(current.root.rootClasses)).toEqual(
      expectedClickClasses(
        before.root.rootClasses,
        clickStep === 1 ? 'current' : 'prior',
      ),
    )
    expect(current.root.targets.map(target => target.rectangle))
      .toEqual(before.root.targets.map(target => target.rectangle))
    expect(current.list.targets.map(target => target.rectangle))
      .toEqual(before.list.targets.map(target => target.rectangle))
    expect(await gaps()).toEqual(beforeGaps)
    expect(current.root.targets.map(target => [
      target.transitionProperty,
      target.transitionDuration,
      target.authoredTransition,
      target.authoredTransitionPriority,
      target.clickData,
    ])).toEqual(before.root.targets.map(target => [
      target.transitionProperty,
      target.transitionDuration,
      target.authoredTransition,
      target.authoredTransitionPriority,
      target.clickData,
    ]))

    for (
      let itemIndex = 0;
      itemIndex < current.list.targets.length;
      itemIndex += 1
    ) {
      const target = current.list.targets[itemIndex]
      const baseline = before.list.targets[itemIndex]
      const state = clickStep === 1 || itemIndex > clickStep - 2
        ? 'hidden'
        : itemIndex === clickStep - 2
          ? 'current'
          : 'prior'
      expect(clickClasses(target.classes)).toEqual(
        expectedClickClasses(baseline.classes, state),
      )
      expect(target.clickData).toEqual(baseline.clickData)
      expect(target.opacity).toBe(state === 'hidden' ? '0' : '1')
      if (state === 'hidden')
        expect(target.pointerEvents).toBe('none')
      else
        expect(target.pointerEvents).not.toBe('none')
      expect([
        target.transitionProperty,
        target.transitionDuration,
        target.authoredTransition,
        target.authoredTransitionPriority,
      ]).toEqual([
        baseline.transitionProperty,
        baseline.transitionDuration,
        baseline.authoredTransition,
        baseline.authoredTransitionPriority,
      ])
    }

    const debug = await debugSnapshot(page)
    expect(debug.batchCount).toBe(0)
    expect(debug.candidateMeasurements).toEqual([])
  }
})

test('restores a complete stable presentation after probe failure and schedules one pass', async ({ page }) => {
  await gotoSlide(page, 44, 'probe-failure-autofit')
  const autofit = page.getByTestId('probe-failure-autofit')
  await waitForStable(autofit)
  await waitForLifecycleIdle(page)
  await resetDebug(page)

  const before = await autofit.evaluate((root) => {
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    return {
      tier: root.dataset.autofitTier,
      scale: root.dataset.autofitScale,
      alignment: root.dataset.autofitEffectiveAlignment,
      classes: [...root.classList],
      paddingStart: flow.style.getPropertyValue('padding-block-start'),
      paddingEnd: flow.style.getPropertyValue('padding-block-end'),
      targets: [...flow.querySelectorAll<HTMLElement>('p')].map(target => ({
        styleAttribute: target.getAttribute('style'),
        fontSize: target.style.getPropertyValue('font-size'),
        lineHeight: target.style.getPropertyValue('line-height'),
        marginStart: target.style.getPropertyValue('margin-block-start'),
        transition: target.style.getPropertyValue('transition'),
        transitionPriority: target.style.getPropertyPriority('transition'),
      })),
    }
  })
  expect(before.tier).not.toBe('0')

  await page.evaluate(() => {
    const heldFrames: FrameRequestCallback[] = []
    const originalRequestFrame = window.requestAnimationFrame.bind(window)
    Object.assign(window, {
      __autofitHeldFrames: heldFrames,
      __autofitOriginalRequestFrame: originalRequestFrame,
      __slidevAutofitTestHooks: {
        afterNeutralProbeRestore: (viewport: HTMLElement) => {
          const root = viewport.closest<HTMLElement>('.autofit')!
          const flow = root.querySelector<HTMLElement>('.autofit__flow')!
          Object.assign(window, {
            __autofitProbeRestoredSnapshot: {
              tier: root.dataset.autofitTier,
              scale: root.dataset.autofitScale,
              alignment: root.dataset.autofitEffectiveAlignment,
              classes: [...root.classList],
              paddingStart: flow.style.getPropertyValue('padding-block-start'),
              paddingEnd: flow.style.getPropertyValue('padding-block-end'),
              targets: [...flow.querySelectorAll<HTMLElement>('p')]
                .map(target => ({
                  styleAttribute: target.getAttribute('style'),
                  fontSize: target.style.getPropertyValue('font-size'),
                  lineHeight: target.style.getPropertyValue('line-height'),
                  marginStart:
                    target.style.getPropertyValue('margin-block-start'),
                  transition: target.style.getPropertyValue('transition'),
                  transitionPriority:
                    target.style.getPropertyPriority('transition'),
                  computedTransition:
                    getComputedStyle(target).transitionProperty,
                })),
            },
          })
        },
        forceNeutralProbeFailure: () => {
          const target = window as typeof window & {
            __autofitProbeFailureCalls?: number
          }
          target.__autofitProbeFailureCalls
            = (target.__autofitProbeFailureCalls ?? 0) + 1
          return true
        },
      },
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 900_000 + heldFrames.length
    }
  })
  await page.getByTestId('probe-failure-target').evaluate((target) => {
    target.classList.add('autofit-probe-failure-trigger')
  })
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
    }).__autofitHeldFrames?.length ?? 0,
  )).toBeGreaterThan(0)
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await page.evaluate(() => {
      const callback = (window as typeof window & {
        __autofitHeldFrames?: FrameRequestCallback[]
      }).__autofitHeldFrames?.shift()
      if (!callback)
        throw new Error('expected a held neutral-probe frame')
      callback(performance.now())
    })
    await page.waitForTimeout(20)
    const failureCalls = await page.evaluate(() =>
      (window as typeof window & {
        __autofitProbeFailureCalls?: number
      }).__autofitProbeFailureCalls ?? 0,
    )
    if (failureCalls > 0)
      break
  }

  const restored = await page.evaluate(() =>
    (window as typeof window & {
      __autofitProbeRestoredSnapshot?: typeof before
    }).__autofitProbeRestoredSnapshot,
  )
  expect(restored).toBeDefined()
  expect(restored).toMatchObject(before)
  expect(restored!.targets.every(
    target => target.computedTransition === 'all',
  )).toBe(true)
  expect(await page.evaluate(() =>
    (window as typeof window & {
      __autofitProbeFailureCalls?: number
    }).__autofitProbeFailureCalls ?? 0,
  )).toBe(1)
  expect((await debugSnapshot(page)).batchCount).toBe(0)

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
      __slidevAutofitTestHooks?: unknown
    }
    delete target.__slidevAutofitTestHooks
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await expect.poll(async () => (await debugSnapshot(page))
    .candidateMeasurements.length).toBe(1)
  await waitForStable(autofit)
  expect((await debugSnapshot(page)).candidateMeasurements).toHaveLength(1)
})

test('remeasures typography-changing and geometry-only reveal classes', async ({ page }) => {
  await gotoSlide(page, 44, 'typography-reveal-autofit')
  const typography = page.getByTestId('typography-reveal-autofit')
  const geometry = page.getByTestId('geometry-reveal-autofit')
  await waitForStable(typography)
  await waitForStable(geometry)
  await waitForLifecycleIdle(page)
  await resetDebug(page)

  const typographyBatch = await batchId(typography)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => batchId(typography)).not.toBe(typographyBatch)
  expect((await debugSnapshot(page)).candidateMeasurements.length)
    .toBeGreaterThan(0)

  await waitForLifecycleIdle(page)
  await resetDebug(page)
  const geometryBatch = await batchId(geometry)
  await page.keyboard.press('ArrowRight')
  await expect.poll(() => batchId(geometry)).not.toBe(geometryBatch)
  expect((await debugSnapshot(page)).candidateMeasurements.length)
    .toBeGreaterThan(0)
})

test('keeps accepted split-list reveal DOM as supported sibling lists without stitching', async ({ page }) => {
  await gotoSlide(page, 45, 'split-list-reveal-slide')
  const autofit = page.locator('.slidev-layout.default > .autofit')
  await waitForStable(autofit)
  await waitForLifecycleIdle(page)

  const before = await autofit.evaluate((root) => {
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    const roots = [...flow.children].filter(element => element.localName === 'ul')
    const allLists = [...flow.querySelectorAll('ul')]
    const nested = allLists.find(list =>
      list.textContent?.includes('Nested before'))!
    const after = allLists.find(list =>
      list.textContent?.includes('Emitted sibling list'))!
    Object.assign(window, {
      __autofitSplitRoots: roots,
      __autofitSplitNested: nested,
      __autofitSplitAfter: after,
    })
    return {
      state: root.dataset.autofitState,
      reason: root.dataset.autofitUnsupportedReason ?? null,
      rootCount: roots.length,
      nestedParent: nested.parentElement?.localName,
      afterIsRoot: after.parentElement === flow,
    }
  })
  expect(before).toMatchObject({
    state: 'fit',
    reason: null,
    rootCount: 3,
    nestedParent: 'div',
    afterIsRoot: true,
  })

  await resetDebug(page)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(300)
  const after = await autofit.evaluate((root) => {
    const target = window as typeof window & {
      __autofitSplitRoots?: Element[]
      __autofitSplitNested?: Element
      __autofitSplitAfter?: Element
    }
    const flow = root.querySelector<HTMLElement>('.autofit__flow')!
    const roots = [...flow.children].filter(element => element.localName === 'ul')
    const allLists = [...flow.querySelectorAll('ul')]
    return {
      state: root.dataset.autofitState,
      reason: root.dataset.autofitUnsupportedReason ?? null,
      sameRoots: roots.every((element, index) =>
        element === target.__autofitSplitRoots?.[index]),
      sameNested: allLists.find(list =>
        list.textContent?.includes('Nested before')) === target.__autofitSplitNested,
      sameAfter: allLists.find(list =>
        list.textContent?.includes('Emitted sibling list')) === target.__autofitSplitAfter,
      rootCount: roots.length,
    }
  })
  expect(after).toEqual({
    state: 'fit',
    reason: null,
    sameRoots: true,
    sameNested: true,
    sameAfter: true,
    rootCount: 3,
  })
  expect((await debugSnapshot(page)).batchCount).toBe(0)
})
