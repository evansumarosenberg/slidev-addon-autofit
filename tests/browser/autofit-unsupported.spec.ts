import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const REASONS = [
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

async function gotoHarness(page: Page) {
  await page.goto('/39')
  await expect(page.getByTestId('unsupported-harness')).toBeVisible()
}

async function choose(page: Page, reason: string) {
  await page.getByTestId(`unsupported-mode-${reason}`).click()
}

async function expectUnsupported(root: Locator, reason: string) {
  await expect(root).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(root).toHaveAttribute('data-autofit-unsupported-reason', reason)
  await expect(root).toHaveClass(/autofit--unsupported/)
  await expect(root).not.toHaveAttribute('data-autofit-tier')
  await expect(root).not.toHaveAttribute('data-autofit-scale')
  await expect(root).toHaveAttribute('data-autofit-effective-alignment', 'top')
  await expect(root.locator('.autofit__unsupported-badge')).toHaveText(
    'AUTOFIT UNSUPPORTED',
  )
  await expect(root).toHaveAttribute('data-autofit-measure-count', '0')
  await expect(root.locator('.autofit__viewport')).toHaveCSS('visibility', 'visible')
}

test('reports every reviewed unsupported reason with classification/measurement attribute rules and recovery', async ({ page }) => {
  await gotoHarness(page)
  const root = page.getByTestId('unsupported-autofit')

  for (const reason of REASONS) {
    await choose(page, reason)
    await expectUnsupported(root, reason)
    if (REASONS.indexOf(reason) <= 3) {
      await expect(root).not.toHaveAttribute('data-autofit-full-gaps')
      await expect(root).not.toHaveAttribute('data-autofit-half-gaps')
    }
    else {
      await expect(root).toHaveAttribute('data-autofit-full-gaps')
      await expect(root).toHaveAttribute('data-autofit-half-gaps')
    }
  }

  await choose(page, 'valid')
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  await expect(root).not.toHaveClass(/autofit--unsupported/)
  await expect(root).not.toHaveAttribute('data-autofit-unsupported-reason')
})

test('warns only on entry or reason change, and warns after recovery and re-entry', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTOFIT UNSUPPORTED'))
      warnings.push(message.text())
  })
  await gotoHarness(page)
  const root = page.getByTestId('unsupported-autofit')

  await choose(page, 'root-text')
  await expectUnsupported(root, 'root-text')
  await expect.poll(() => warnings.length).toBe(1)
  await page.getByTestId('unsupported-mode-root-text').click()
  await page.waitForTimeout(100)
  expect(warnings).toHaveLength(1)

  await choose(page, 'visual-rect-missing')
  await expectUnsupported(root, 'visual-rect-missing')
  await expect.poll(() => warnings.length).toBe(2)
  await choose(page, 'valid')
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  await choose(page, 'visual-rect-missing')
  await expect.poll(() => warnings.length).toBe(3)
})

test('settles unsupported neutral presentation without self-invalidating', async ({ page }) => {
  await gotoHarness(page)
  const root = page.getByTestId('unsupported-autofit')
  await choose(page, 'base-gap-verification')
  await expectUnsupported(root, 'base-gap-verification')
  await page.getByTestId('unsupported-force-base').click()
  await expectUnsupported(root, 'base-gap-verification')
  await page.waitForTimeout(700)

  const before = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __slidevAutofitDebug?: {
        readonly snapshot: {
          readonly batchCount: number
          readonly candidateMeasurements: readonly { readonly count: number }[]
        }
      }
    }).__slidevAutofitDebug!
    return debug.snapshot
  })
  expect(await root.evaluate((element) => {
    const flow = element.querySelector<HTMLElement>('.autofit__flow')!
    const units = [...flow.querySelectorAll<HTMLElement>('p')]
    return {
      paddingBefore: flow.style.paddingBlockStart,
      paddingAfter: flow.style.paddingBlockEnd,
      fontSizes: units.map(unit => unit.style.fontSize),
      margins: units.map(unit => unit.style.marginBlockStart),
    }
  })).toEqual({
    paddingBefore: '',
    paddingAfter: '',
    fontSizes: ['', ''],
    margins: ['', ''],
  })

  await page.waitForTimeout(350)
  const after = await page.evaluate(() => {
    const debug = (window as typeof window & {
      __slidevAutofitDebug?: {
        readonly snapshot: {
          readonly batchCount: number
          readonly candidateMeasurements: readonly { readonly count: number }[]
        }
      }
    }).__slidevAutofitDebug!
    return debug.snapshot
  })
  expect(after.batchCount).toBe(before.batchCount)
  expect(after.candidateMeasurements).toEqual(before.candidateMeasurements)

  await choose(page, 'valid')
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  await expect(root.locator('.autofit__unsupported-badge')).toHaveCount(0)
  await page.waitForTimeout(250)
  const recovered = await page.evaluate(() => {
    return (window as typeof window & {
      __slidevAutofitDebug?: {
        readonly snapshot: {
          readonly batchCount: number
          readonly candidateMeasurements: readonly { readonly count: number }[]
        }
      }
    }).__slidevAutofitDebug!.snapshot
  })
  await page.waitForTimeout(350)
  const recoveredAfterDiagnosticsRemoval = await page.evaluate(() => {
    return (window as typeof window & {
      __slidevAutofitDebug?: {
        readonly snapshot: {
          readonly batchCount: number
          readonly candidateMeasurements: readonly { readonly count: number }[]
        }
      }
    }).__slidevAutofitDebug!.snapshot
  })
  expect(recoveredAfterDiagnosticsRemoval.batchCount)
    .toBe(recovered.batchCount)
  expect(recoveredAfterDiagnosticsRemoval.candidateMeasurements)
    .toEqual(recovered.candidateMeasurements)
})

test('prefers missing visual rectangles to invalid targets on the integrated path', async ({ page }) => {
  await gotoHarness(page)
  const root = page.getByTestId('unsupported-autofit')
  await root.evaluate((element) => {
    const flow = element.querySelector<HTMLElement>('.autofit__flow')!
    const original = window.getComputedStyle.bind(window)
    window.getComputedStyle = ((target: Element, pseudo?: string | null) => {
      const style = original(target, pseudo)
      if (target !== flow)
        return style
      return new Proxy(style, {
        get(current, key, receiver) {
          if (key === 'marginInlineStart')
            return 'NaNpx'
          return Reflect.get(current, key, receiver)
        },
      })
    }) as typeof window.getComputedStyle
  })

  await choose(page, 'visual-rect-missing')
  await expectUnsupported(root, 'visual-rect-missing')
})

test('retains an exact-signature stable presentation for recovery after unsupported completion', async ({ page }) => {
  await gotoHarness(page)
  const root = page.getByTestId('unsupported-autofit')
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  await page.waitForTimeout(150)
  const stable = await root.evaluate((element) => {
    const first = element.querySelector<HTMLElement>(
      '[data-testid="unsupported-valid-first"]',
    )!
    const second = element.querySelector<HTMLElement>(
      '[data-testid="unsupported-valid-second"]',
    )!
    const flow = element.querySelector<HTMLElement>('.autofit__flow')!
    return {
      firstFont: getComputedStyle(first).fontSize,
      secondMargin: getComputedStyle(second).marginBlockStart,
      paddingBefore: getComputedStyle(flow).paddingBlockStart,
      paddingAfter: getComputedStyle(flow).paddingBlockEnd,
    }
  })

  await page.getByTestId('unsupported-force-base').click()
  await expectUnsupported(root, 'base-gap-verification')

  await page.evaluate(() => {
    const frames: FrameRequestCallback[] = []
    Object.assign(window, {
      __autofitHeldFrames: frames,
      __autofitOriginalRequestFrame: window.requestAnimationFrame.bind(window),
    })
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      frames.push(callback)
      return 600_000 + frames.length
    }
  })
  await page.getByTestId('unsupported-clear-force').click()
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
    }).__autofitHeldFrames?.length ?? 0
  })).toBeGreaterThan(0)
  await expect(root).toHaveAttribute('data-autofit-state', 'unsupported')
  expect(await root.evaluate((element) => {
    const first = element.querySelector<HTMLElement>(
      '[data-testid="unsupported-valid-first"]',
    )!
    const second = element.querySelector<HTMLElement>(
      '[data-testid="unsupported-valid-second"]',
    )!
    const flow = element.querySelector<HTMLElement>('.autofit__flow')!
    return {
      firstFont: getComputedStyle(first).fontSize,
      secondMargin: getComputedStyle(second).marginBlockStart,
      paddingBefore: getComputedStyle(flow).paddingBlockStart,
      paddingAfter: getComputedStyle(flow).paddingBlockEnd,
    }
  })).toEqual(stable)

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autofitHeldFrames?: FrameRequestCallback[]
      __autofitOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autofitOriginalRequestFrame!
    for (const callback of target.__autofitHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
})

test('lets the fixed-region diagnostic remain visibly dominant', async ({ page }) => {
  await page.goto('/41')
  const layout = page.locator('.default-layout').filter({
    has: page.getByTestId('fixed-overflow-unsupported'),
  })
  const root = layout.locator('.autofit')

  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await expectUnsupported(root, 'list-item-missing-leading-content')
  await expect(root.locator('.autofit__unsupported-badge')).toBeHidden()
  await expect(layout.locator('.default-layout__overflow-badge')).toBeVisible()
  await expect(root).toHaveCSS('box-shadow', 'none')
})
