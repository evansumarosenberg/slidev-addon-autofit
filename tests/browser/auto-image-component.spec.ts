import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const HARNESS_SLIDE = 103
const TRANSITION_HARNESS_SLIDE = 160

async function gotoHarness(page: Page): Promise<() => void> {
  let releasePending!: () => void
  const pendingRelease = new Promise<void>(resolve => {
    releasePending = resolve
  })
  await page.route('**/auto-image-pending.svg', async route => {
    await pendingRelease
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="purple"/></svg>',
    })
  })
  await page.route('**/auto-image-error.svg', route => route.abort())
  await page.addInitScript(() => {
    const hooks = {
      activeInstances: 0,
      invalidations: [] as string[],
      afterUpdateCallbacks: new Set<() => void>(),
      fontReadyCallbacks: new Set<() => void>(),
      triggerAfterUpdate() {
        for (const callback of hooks.afterUpdateCallbacks)
          callback()
      },
      triggerFontReady() {
        for (const callback of hooks.fontReadyCallbacks)
          callback()
      },
    }
    Object.assign(window, { __slidevAutoImageTestHooks: hooks })
  })
  await page.goto(`/${HARNESS_SLIDE}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('auto-image-harness')).toBeVisible()
  return releasePending
}

async function waitForState(root: Locator, state: string): Promise<void> {
  await expect(root).toHaveAttribute('data-auto-image-state', state)
}

async function groupGeometry(root: Locator): Promise<{
  readonly viewport: { readonly width: number; readonly height: number }
  readonly flow: { readonly width: number; readonly height: number }
  readonly image: { readonly left: number; readonly top: number; readonly width: number; readonly height: number }
  readonly imageWrapper: { readonly left: number; readonly top: number; readonly width: number; readonly height: number } | null
  readonly caption: { readonly left: number; readonly top: number; readonly width: number; readonly height: number } | null
}> {
  return root.evaluate((element) => {
    const rectangle = (target: Element) => {
      const value = target.getBoundingClientRect()
      return { left: value.left, top: value.top, width: value.width, height: value.height }
    }
    const viewport = element.querySelector('.auto-image__viewport')!
    const flow = element.querySelector('.auto-image__flow')!
    const image = element.querySelector('img')!
    const imageWrapper = image.parentElement?.matches('p') ? image.parentElement : null
    const caption = element.querySelector('.auto-image__managed-caption')
    return {
      viewport: rectangle(viewport),
      flow: rectangle(flow),
      image: rectangle(image),
      imageWrapper: imageWrapper ? rectangle(imageWrapper) : null,
      caption: caption ? rectangle(caption) : null,
    }
  })
}

async function measureCount(root: Locator): Promise<number> {
  return Number(await root.getAttribute('data-auto-image-measure-count'))
}

async function waitForNextMeasure(root: Locator, previous: number): Promise<number> {
  await expect.poll(() => measureCount(root)).toBeGreaterThan(previous)
  return measureCount(root)
}

async function waitForInitialMeasure(root: Locator): Promise<number> {
  return waitForNextMeasure(root, 0)
}

async function cssScale(root: Locator): Promise<number> {
  return root.evaluate(element => {
    const rectangle = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const width = Number.parseFloat(style.width)
    const height = Number.parseFloat(style.height)
    return width > 0 ? rectangle.width / width : rectangle.height / height
  })
}

async function expectStableMeasureCount(root: Locator): Promise<void> {
  await root.evaluate(() => new Promise<void>((resolve) => {
    let frames = 4
    const next = () => {
      frames -= 1
      if (frames === 0)
        resolve()
      else
        requestAnimationFrame(next)
    }
    requestAnimationFrame(next)
  }))
  const initial = await measureCount(root)
  await root.evaluate(() => new Promise<void>((resolve) => {
    let frames = 4
    const next = () => {
      frames -= 1
      if (frames === 0)
        resolve()
      else
        requestAnimationFrame(next)
    }
    requestAnimationFrame(next)
  }))
  expect(await measureCount(root)).toBe(initial)
}

async function installNonFiniteViewportProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageOriginalGetComputedStyle?: typeof getComputedStyle
      __autoImageOriginalSetProperty?: typeof CSSStyleDeclaration.prototype.setProperty
      __autoImageNonFiniteMeasurement?: {
        readonly testId: string
        readonly kind: 'viewport' | 'caption'
      } | null
      __autoImageManagedWrites?: string[]
    }
    target.__autoImageOriginalGetComputedStyle = window.getComputedStyle.bind(window)
    target.__autoImageOriginalSetProperty = CSSStyleDeclaration.prototype.setProperty
    target.__autoImageNonFiniteMeasurement = null
    target.__autoImageManagedWrites = []
    window.getComputedStyle = ((element: Element, pseudoElement?: string | null) => {
      const computed = target.__autoImageOriginalGetComputedStyle!(element, pseudoElement)
      const measurement = target.__autoImageNonFiniteMeasurement
      const root = element instanceof HTMLElement ? element.closest('[data-testid]') : null
      if (!measurement || root?.getAttribute('data-testid') !== measurement.testId) {
        return computed
      }
      return new Proxy(computed, {
        get(source, property) {
          if (measurement.kind === 'viewport'
            && element instanceof HTMLElement
            && element.classList.contains('auto-image__viewport')
            && property === 'width') {
            return 'not-a-number'
          }
          if (measurement.kind === 'caption'
            && element instanceof HTMLElement
            && element.classList.contains('auto-image__managed-caption')
            && property === 'height') {
            return 'not-a-number'
          }
          const value = Reflect.get(source, property, source)
          return typeof value === 'function' ? value.bind(source) : value
        },
      })
    }) as typeof getComputedStyle

    CSSStyleDeclaration.prototype.setProperty = function (name: string, value: string, priority?: string): void {
      if (name.startsWith('--slidev-auto-image-'))
        target.__autoImageManagedWrites?.push(value)
      target.__autoImageOriginalSetProperty!.call(this, name, value, priority)
    }
  })
}

async function cleanupNonFiniteViewportProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageOriginalGetComputedStyle?: typeof getComputedStyle
      __autoImageOriginalSetProperty?: typeof CSSStyleDeclaration.prototype.setProperty
      __autoImageNonFiniteMeasurement?: unknown
      __autoImageManagedWrites?: unknown
    }
    if (target.__autoImageOriginalGetComputedStyle)
      window.getComputedStyle = target.__autoImageOriginalGetComputedStyle
    if (target.__autoImageOriginalSetProperty)
      CSSStyleDeclaration.prototype.setProperty = target.__autoImageOriginalSetProperty
    delete target.__autoImageOriginalGetComputedStyle
    delete target.__autoImageOriginalSetProperty
    delete target.__autoImageNonFiniteMeasurement
    delete target.__autoImageManagedWrites
  })
}

async function setNonFiniteMeasurement(
  page: Page,
  testId: string | null,
  kind: 'viewport' | 'caption' = 'viewport',
): Promise<void> {
  await page.evaluate((next) => {
    ;(window as typeof window & {
      __autoImageNonFiniteMeasurement?: {
        readonly testId: string
        readonly kind: 'viewport' | 'caption'
      } | null
    }).__autoImageNonFiniteMeasurement = next
  }, testId === null ? null : { testId, kind })
}

async function managedPresentation(root: Locator): Promise<unknown> {
  return root.evaluate((element) => {
    const root = element as HTMLElement
    const properties = [
      '--slidev-auto-image-image-inline-size',
      '--slidev-auto-image-image-block-size',
      '--slidev-auto-image-image-inline-offset',
      '--slidev-auto-image-image-block-offset',
      '--slidev-auto-image-caption-inline-size',
      '--slidev-auto-image-caption-inline-offset',
      '--slidev-auto-image-caption-block-offset',
    ]
    return {
      state: root.getAttribute('data-auto-image-state'),
      reason: root.getAttribute('data-auto-image-overflow-reason'),
      unsupported: root.getAttribute('data-auto-image-unsupported-reason'),
      items: Array.from(root.querySelectorAll<HTMLElement>('.auto-image__managed-item')).map(item => ({
        className: item.className,
        index: item.getAttribute('data-auto-image-item-index'),
        role: item.getAttribute('data-auto-image-managed-role'),
        properties: properties.map(property => [property, item.style.getPropertyValue(property)]),
      })),
    }
  })
}

async function retainedPresentation(root: Locator): Promise<unknown> {
  return root.evaluate((element) => {
    const root = element as HTMLElement
    const properties = [
      '--slidev-auto-image-image-inline-size',
      '--slidev-auto-image-image-block-size',
      '--slidev-auto-image-image-inline-offset',
      '--slidev-auto-image-image-block-offset',
      '--slidev-auto-image-caption-inline-size',
      '--slidev-auto-image-caption-inline-offset',
      '--slidev-auto-image-caption-block-offset',
    ]
    const geometry = (target: HTMLElement) => {
      const computed = getComputedStyle(target)
      return {
        width: computed.width,
        height: computed.height,
        inlineSize: computed.inlineSize,
        blockSize: computed.blockSize,
        left: computed.left,
        top: computed.top,
        right: computed.right,
        bottom: computed.bottom,
        display: computed.display,
        position: computed.position,
        visibility: computed.visibility,
      }
    }
    return {
      root: {
        classes: [...root.classList]
          .filter(name => name === 'auto-image' || name.startsWith('auto-image--'))
          .sort(),
        markers: [
          'data-auto-image-state',
          'data-auto-image-overflow-reason',
          'data-auto-image-unsupported-reason',
        ].map(name => [name, root.getAttribute(name)]),
        geometry: geometry(root),
      },
      items: Array.from(root.querySelectorAll<HTMLElement>('img, p')).map((item, index) => ({
        index,
        tagName: item.tagName,
        classes: [...item.classList].filter(name => name.startsWith('auto-image__')).sort(),
        markers: [
          'data-auto-image-item-index',
          'data-auto-image-managed-role',
        ].map(name => [name, item.getAttribute(name)]),
        omitted: item.classList.contains('auto-image__omitted-item'),
        properties: properties.map(property => [property, item.style.getPropertyValue(property)]),
        geometry: geometry(item),
      })),
    }
  })
}

test.afterEach(async ({ page }) => {
  await cleanupNonFiniteViewportProbe(page)
})

test('retains terminal AutoImage presentation through a Vue leave transition', async ({ page }) => {
  await page.route('**/auto-image-transition-error.svg', route => route.abort())
  await page.goto(`/${TRANSITION_HARNESS_SLIDE}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('autofit-transition-unmount-harness')).toBeVisible()

  const fit = page.getByTestId('auto-image-transition-fit')
  const overflow = page.getByTestId('auto-image-transition-overflow')
  const unsupported = page.getByTestId('auto-image-transition-unsupported')
  await waitForState(fit, 'fit')
  await waitForState(overflow, 'overflow')
  await waitForState(unsupported, 'unsupported')
  await expect(unsupported).toHaveAttribute('data-auto-image-unsupported-reason', 'image-unavailable')
  await expect(unsupported.locator('.auto-image__managed-image')).toHaveCount(1)
  await expect(unsupported.locator('.auto-image__omitted-item')).toHaveCount(3)

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageHeldFrames?: FrameRequestCallback[]
      __autoImageOriginalRequestFrame?: typeof requestAnimationFrame
    }
    const heldFrames: FrameRequestCallback[] = []
    target.__autoImageHeldFrames = heldFrames
    target.__autoImageOriginalRequestFrame = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 720_000 + heldFrames.length
    }
    for (const root of document.querySelectorAll<HTMLElement>(
      '[data-testid="auto-image-transition-fit"], [data-testid="auto-image-transition-overflow"], [data-testid="auto-image-transition-unsupported"]',
    )) {
      root.style.width = `${Number.parseFloat(root.style.width) + 1}px`
    }
  })
  await expect.poll(() => page.evaluate(() => {
    return (window as typeof window & {
      __autoImageHeldFrames?: FrameRequestCallback[]
    }).__autoImageHeldFrames?.length ?? 0
  })).toBeGreaterThan(0)

  const before = await Promise.all([
    retainedPresentation(fit),
    retainedPresentation(overflow),
    retainedPresentation(unsupported),
  ])
  await page.getByTestId('auto-image-transition-remove-fit').click()
  await page.getByTestId('auto-image-transition-remove-overflow').click()
  await page.getByTestId('auto-image-transition-remove-unsupported').click()

  await expect(fit).toBeAttached()
  await expect(overflow).toBeAttached()
  await expect(unsupported).toBeAttached()
  await expect(Promise.all([
    retainedPresentation(fit),
    retainedPresentation(overflow),
    retainedPresentation(unsupported),
  ])).resolves.toEqual(before)

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageHeldFrames?: FrameRequestCallback[]
      __autoImageOriginalRequestFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autoImageOriginalRequestFrame!
    for (const callback of target.__autoImageHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await page.waitForTimeout(50)
  await expect(Promise.all([
    retainedPresentation(fit),
    retainedPresentation(overflow),
    retainedPresentation(unsupported),
  ])).resolves.toEqual(before)
})

test('keeps non-finite observations pending or retains the complete current presentation', async ({ page }) => {
  await gotoHarness(page)
  await installNonFiniteViewportProbe(page)
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTO IMAGE OVERFLOW'))
      warnings.push(message.text())
  })

  await setNonFiniteMeasurement(page, 'auto-image-finite-initial')
  await page.getByTestId('auto-image-finite-initial-control').click()
  const initial = page.getByTestId('auto-image-finite-initial')
  await waitForInitialMeasure(initial)
  await expect(initial).toHaveAttribute('data-auto-image-state', 'pending')
  await expect(initial.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')
  await expect(initial).not.toHaveAttribute('data-auto-image-overflow-reason')
  await expect(initial).not.toHaveAttribute('data-auto-image-unsupported-reason')

  const initialRecoveryMeasure = await measureCount(initial)
  await setNonFiniteMeasurement(page, null)
  await initial.evaluate(element => element.classList.toggle('finite-recovery'))
  await waitForNextMeasure(initial, initialRecoveryMeasure)
  await waitForState(initial, 'fit')

  const root = page.getByTestId('auto-image-finite-commit')
  await waitForState(root, 'fit')
  const fitPresentation = await managedPresentation(root)
  const fitObservationMeasure = await measureCount(root)
  await setNonFiniteMeasurement(page, 'auto-image-finite-commit')
  await root.evaluate(element => element.classList.toggle('finite-observation'))
  await waitForNextMeasure(root, fitObservationMeasure)
  expect(await managedPresentation(root)).toEqual(fitPresentation)
  expect(warnings).toHaveLength(0)

  const overflowMeasure = await measureCount(root)
  await setNonFiniteMeasurement(page, null)
  await root.locator('.auto-image__viewport').evaluate(element => { element.style.width = '0px' })
  await waitForNextMeasure(root, overflowMeasure)
  await waitForState(root, 'overflow')
  await expect(root).toHaveAttribute('data-auto-image-overflow-reason', 'zero-inline-space')
  await expect.poll(() => warnings.length).toBe(1)
  const overflowPresentation = await managedPresentation(root)
  const overflowObservationMeasure = await measureCount(root)
  await setNonFiniteMeasurement(page, 'auto-image-finite-commit')
  await root.evaluate(element => element.classList.toggle('finite-overflow-observation'))
  await waitForNextMeasure(root, overflowObservationMeasure)
  expect(await managedPresentation(root)).toEqual(overflowPresentation)
  expect(warnings).toHaveLength(1)

  const finiteReasonTransitionMeasure = await measureCount(root)
  await setNonFiniteMeasurement(page, null)
  await root.locator('.auto-image__viewport').evaluate(element => {
    element.style.removeProperty('width')
    element.style.height = '0px'
  })
  await waitForNextMeasure(root, finiteReasonTransitionMeasure)
  await waitForState(root, 'overflow')
  await expect(root).toHaveAttribute('data-auto-image-overflow-reason', 'zero-block-space')
  await expect.poll(() => warnings.length).toBe(2)
  expect(warnings[0]).toContain('zero-inline-space')
  expect(warnings[1]).toContain('zero-block-space')

  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __autoImageManagedWrites?: string[] })
      .__autoImageManagedWrites?.some(value => /(?:NaN|Infinity)/.test(value)) ?? false,
  )).toBe(false)
})

test('keeps coordinated row and column candidate-caption measurements pending or retained', async ({ page }) => {
  await gotoHarness(page)
  await installNonFiniteViewportProbe(page)

  for (const [testId, control] of [
    ['auto-image-finite-row-initial', 'auto-image-finite-row-initial-control'],
    ['auto-image-finite-column-initial', 'auto-image-finite-column-initial-control'],
  ] as const) {
    await setNonFiniteMeasurement(page, testId, 'caption')
    await page.getByTestId(control).click()
    const root = page.getByTestId(testId)
    await waitForInitialMeasure(root)
    await expect(root).toHaveAttribute('data-auto-image-state', 'pending')
    await expect(root.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')
    await expect(root).not.toHaveAttribute('data-auto-image-overflow-reason')
    await expect(root).not.toHaveAttribute('data-auto-image-unsupported-reason')

    const recoveryMeasure = await measureCount(root)
    await setNonFiniteMeasurement(page, null)
    await root.evaluate(element => element.classList.toggle('finite-candidate-recovery'))
    await waitForNextMeasure(root, recoveryMeasure)
    await waitForState(root, 'fit')
  }

  for (const testId of ['auto-image-multiple', 'auto-image-multiple-column'] as const) {
    const root = page.getByTestId(testId)
    await waitForState(root, 'fit')
    const fitPresentation = await managedPresentation(root)
    const fitObservationMeasure = await measureCount(root)
    await setNonFiniteMeasurement(page, testId, 'caption')
    await root.evaluate(element => element.classList.toggle('finite-candidate-fit-observation'))
    await waitForNextMeasure(root, fitObservationMeasure)
    expect(await managedPresentation(root)).toEqual(fitPresentation)

    const overflowMeasure = await measureCount(root)
    await setNonFiniteMeasurement(page, null)
    await root.locator('.auto-image__viewport').evaluate(element => { element.style.width = '0px' })
    await waitForNextMeasure(root, overflowMeasure)
    await waitForState(root, 'overflow')
    const overflowPresentation = await managedPresentation(root)

    const overflowObservationMeasure = await measureCount(root)
    await setNonFiniteMeasurement(page, testId, 'caption')
    await root.evaluate(element => element.classList.toggle('finite-candidate-overflow-observation'))
    await waitForNextMeasure(root, overflowObservationMeasure)
    expect(await managedPresentation(root)).toEqual(overflowPresentation)

    const restoreMeasure = await measureCount(root)
    await setNonFiniteMeasurement(page, null)
    await root.locator('.auto-image__viewport').evaluate(element => element.style.removeProperty('width'))
    await waitForNextMeasure(root, restoreMeasure)
    await waitForState(root, 'fit')
  }
})

test('drops a retained presentation when its position or live item association changes', async ({ page }) => {
  await gotoHarness(page)
  await installNonFiniteViewportProbe(page)
  const root = page.getByTestId('auto-image-finite-commit')
  await waitForState(root, 'fit')

  await setNonFiniteMeasurement(page, 'auto-image-finite-commit')
  await page.getByTestId('auto-image-finite-position-control').click()
  await expect(root).toHaveAttribute('data-auto-image-state', 'pending')
  await expect(root.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')

  await setNonFiniteMeasurement(page, null)
  await root.evaluate(element => element.classList.toggle('finite-position-recovery'))
  await waitForState(root, 'fit')

  await setNonFiniteMeasurement(page, 'auto-image-finite-commit')
  await root.locator('.auto-image__flow').evaluate((flow, source) => {
    flow.innerHTML = `<p><img src="${source}" alt="Replacement finite fixture"></p><p>Replacement caption.</p>`
  }, await root.locator('img').getAttribute('src'))
  await expect(root).toHaveAttribute('data-auto-image-state', 'pending')
  await expect(root.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')

  await setNonFiniteMeasurement(page, null)
  await root.evaluate(element => element.classList.toggle('finite-replacement-recovery'))
  await waitForState(root, 'fit')

  await setNonFiniteMeasurement(page, 'auto-image-finite-commit')
  await root.locator('img').evaluate(image => {
    image.setAttribute(
      'src',
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='400'%3E%3C/svg%3E",
    )
  })
  await expect(root).toHaveAttribute('data-auto-image-state', 'pending')
  await expect(root.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')

  await setNonFiniteMeasurement(page, null)
  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.innerHTML = '<p>Unsupported replacement structure.</p>'
  })
  await expect(root).toHaveAttribute('data-auto-image-state', 'unsupported')
  await expect(root.locator('.auto-image__managed-item')).toHaveCount(0)
})

test('fits direct and Markdown-wrapped images with authored dimensions overridden', async ({ page }) => {
  await gotoHarness(page)

  const direct = page.getByTestId('auto-image-direct')
  await waitForState(direct, 'fit')
  await expect(direct).toHaveClass(/auto-image--fit/)
  await expect(direct).not.toHaveAttribute('data-auto-image-overflow-reason')

  const directImage = page.getByTestId('auto-image-direct-image')
  const directGeometry = await groupGeometry(direct)
  expect(directGeometry.image.width).toBeCloseTo(directGeometry.viewport.width, 1)
  expect(directGeometry.image.height).toBeCloseTo(directGeometry.image.width / 2, 1)
  await expect(directImage).toHaveAttribute('alt', 'Landscape fixture')
  await expect(directImage).toHaveAttribute('aria-describedby', 'auto-image-direct-description')

  const captioned = page.getByTestId('auto-image-caption')
  await waitForState(captioned, 'fit')
  const caption = page.getByTestId('auto-image-caption-text')
  const captionGeometry = await groupGeometry(captioned)
  expect(captionGeometry.caption).not.toBeNull()
  expect(captionGeometry.image.width / captionGeometry.image.height).toBeCloseTo(0.5, 3)
  expect(captionGeometry.image.height).toBeLessThan(captionGeometry.viewport.height)
  expect(captionGeometry.caption!.width).toBeCloseTo(captionGeometry.viewport.width, 1)
  const captionGap = captionGeometry.caption!.top
    - (captionGeometry.image.top + captionGeometry.image.height)
  const captionScale = captionGeometry.viewport.width / 400
  expect(captionGap).toBeCloseTo(20 * captionScale, 1)
  const groupHeight = captionGeometry.image.height + captionGap + captionGeometry.caption!.height
  expect(captionGeometry.image.top - captionGeometry.viewport.top)
    .toBeCloseTo((captionGeometry.viewport.height - groupHeight) / 2, 1)
  await expect(caption).toHaveCSS('width', '400px')
  await expect(caption).toHaveCSS('text-align', 'center')
  await expect(caption).toHaveCSS('font-size', '14px')
  await expect(caption).toHaveCSS('line-height', '20px')
  await expect(caption).toHaveCSS('margin-top', '0px')
  await expect(captioned.locator('img')).toHaveAttribute('alt', 'Portrait fixture')
})

test('publishes exact overflow and structural fallback states', async ({ page }) => {
  await gotoHarness(page)

  for (const [testId, reason] of [
    ['auto-image-missing', 'missing-image'],
    ['auto-image-wrapper', 'unexpected-image-wrapper'],
    ['auto-image-before', 'unexpected-content'],
    ['auto-image-multiple-captions', 'multiple-captions'],
  ] as const) {
    const root = page.getByTestId(testId)
    await waitForState(root, 'unsupported')
    await expect(root).toHaveClass(/auto-image--unsupported/)
    await expect(root).toHaveAttribute('data-auto-image-unsupported-reason', reason)
    await expect(root).not.toHaveClass(/auto-image--fit/)
    await expect(root.locator('img')).toHaveCount(testId === 'auto-image-missing' ? 0 : 1)
  }

  const captionOverflow = page.getByTestId('auto-image-caption-overflow')
  await waitForState(captionOverflow, 'overflow')
  await expect(captionOverflow).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'caption-inline-overflow',
  )
  const captionOverflowGeometry = await groupGeometry(captionOverflow)
  expect(captionOverflowGeometry.image.width).toBeCloseTo(
    captionOverflowGeometry.viewport.width,
    1,
  )

  const zeroInline = page.getByTestId('auto-image-zero-inline')
  await waitForState(zeroInline, 'overflow')
  await expect(zeroInline).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'zero-inline-space',
  )
  await expect(zeroInline.locator('img')).toHaveCSS('width', '0px')

  for (const [testId, reason] of [
    ['auto-image-zero-block', 'zero-block-space'],
    ['auto-image-caption-block', 'caption-block-overflow'],
    ['auto-image-no-image-block', 'no-image-block-space'],
  ] as const) {
    const root = page.getByTestId(testId)
    await waitForState(root, 'overflow')
    await expect(root).toHaveAttribute('data-auto-image-overflow-reason', reason)
  }

  const tiny = page.getByTestId('auto-image-no-renderable')
  await waitForState(tiny, 'overflow')
  await expect(tiny).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'no-renderable-image-size',
  )

  const completeInvalid = page.getByTestId('auto-image-complete-invalid')
  await waitForState(completeInvalid, 'unsupported')
  await expect(completeInvalid).toHaveAttribute(
    'data-auto-image-unsupported-reason',
    'image-unavailable',
  )
})

test('coordinates ordered multiple image items in rows and columns', async ({ page }) => {
  await gotoHarness(page)

  const row = page.getByTestId('auto-image-multiple')
  await waitForState(row, 'fit')
  await expect(row.getByTestId('auto-image-multiple-first')).toHaveAttribute('data-auto-image-item-index', '0')
  await expect(row.getByTestId('auto-image-multiple-first-caption')).toHaveAttribute('data-auto-image-item-index', '0')
  await expect(row.getByTestId('auto-image-multiple-second')).toHaveAttribute('data-auto-image-item-index', '1')
  await expect(row.getByTestId('auto-image-multiple-second-caption')).toHaveAttribute('data-auto-image-item-index', '1')
  const rowGeometry = await row.evaluate((element) => {
    const rect = (selector: string) => (element.querySelector(selector) as HTMLElement).getBoundingClientRect().toJSON()
    return {
      first: rect('[data-testid="auto-image-multiple-first"]'),
      second: rect('[data-testid="auto-image-multiple-second"]'),
      firstCaption: rect('[data-testid="auto-image-multiple-first-caption"]'),
      secondCaption: rect('[data-testid="auto-image-multiple-second-caption"]'),
    }
  })
  expect(rowGeometry.first.height).toBeCloseTo(rowGeometry.second.height, 1)
  expect(rowGeometry.first.width / rowGeometry.first.height).toBeCloseTo(2, 2)
  expect(rowGeometry.second.width / rowGeometry.second.height).toBeCloseTo(1, 2)
  expect(rowGeometry.firstCaption.width).not.toBeCloseTo(rowGeometry.secondCaption.width, 1)
  expect(rowGeometry.firstCaption.y).toBeCloseTo(rowGeometry.secondCaption.y, 1)

  const column = page.getByTestId('auto-image-multiple-column')
  await waitForState(column, 'fit')
  const columnGeometry = await column.evaluate((element) => {
    const rect = (selector: string) => (element.querySelector(selector) as HTMLElement).getBoundingClientRect().toJSON()
    return {
      first: rect('[data-testid="auto-image-column-first"]'),
      second: rect('[data-testid="auto-image-column-second"]'),
      caption: rect('[data-testid="auto-image-column-first-caption"]'),
      viewport: (element.querySelector('.auto-image__viewport') as HTMLElement).getBoundingClientRect().toJSON(),
    }
  })
  expect(columnGeometry.first.width).toBeCloseTo(columnGeometry.second.width, 1)
  expect(columnGeometry.first.width / columnGeometry.first.height).toBeCloseTo(2, 2)
  expect(columnGeometry.second.width / columnGeometry.second.height).toBeCloseTo(0.5, 2)
  expect(columnGeometry.caption.width).toBeCloseTo(columnGeometry.viewport.width, 1)
})

test('uses row and column contracts for every orientation and three-item groups', async ({ page }) => {
  await gotoHarness(page)

  const top = page.getByTestId('auto-image-multiple-top')
  await waitForState(top, 'fit')
  const topGeometry = await top.evaluate((element) => {
    const rect = (testId: string) => (element.querySelector(`[data-testid="${testId}"]`) as HTMLElement)
      .getBoundingClientRect().toJSON()
    const style = (testId: string) => getComputedStyle(
      element.querySelector(`[data-testid="${testId}"]`) as HTMLElement,
    )
    return {
      first: rect('auto-image-top-first'),
      second: rect('auto-image-top-second'),
      third: rect('auto-image-top-third'),
      firstCaption: rect('auto-image-top-first-caption'),
      thirdCaption: rect('auto-image-top-third-caption'),
      firstOffset: Number.parseFloat(style('auto-image-top-first-caption')
        .getPropertyValue('--slidev-auto-image-caption-inline-offset')),
      thirdOffset: Number.parseFloat(style('auto-image-top-third-caption')
        .getPropertyValue('--slidev-auto-image-caption-inline-offset')),
    }
  })
  expect(topGeometry.first.height).toBeCloseTo(topGeometry.second.height, 1)
  expect(topGeometry.second.height).toBeCloseTo(topGeometry.third.height, 1)
  expect(topGeometry.first.top).toBeCloseTo(topGeometry.second.top, 1)
  expect(topGeometry.second.top).toBeCloseTo(topGeometry.third.top, 1)
  expect(topGeometry.firstCaption.top).toBeCloseTo(topGeometry.thirdCaption.top, 1)
  expect(topGeometry.firstCaption.width).not.toBeCloseTo(topGeometry.thirdCaption.width, 1)
  expect(topGeometry.first.left + topGeometry.first.width / 2)
    .toBeCloseTo(topGeometry.firstCaption.x + topGeometry.firstCaption.width / 2, 1)
  expect(topGeometry.third.left + topGeometry.third.width / 2)
    .toBeCloseTo(topGeometry.thirdCaption.x + topGeometry.thirdCaption.width / 2, 1)
  expect(topGeometry.thirdOffset).toBeGreaterThan(topGeometry.firstOffset)
  await expect(top.locator('.auto-image__managed-image')).toHaveCount(3)

  const bottom = page.getByTestId('auto-image-multiple-bottom')
  await waitForState(bottom, 'fit')
  const bottomGeometry = await bottom.evaluate((element) => Array.from(
    element.querySelectorAll('img'),
    image => image.getBoundingClientRect().toJSON(),
  ))
  expect(bottomGeometry).toHaveLength(3)
  expect(bottomGeometry[0]!.height).toBeCloseTo(bottomGeometry[1]!.height, 1)
  expect(bottomGeometry[1]!.height).toBeCloseTo(bottomGeometry[2]!.height, 1)
  expect(bottomGeometry[0]!.y).toBeCloseTo(bottomGeometry[2]!.y, 1)

  const right = page.getByTestId('auto-image-multiple-right')
  await waitForState(right, 'fit')
  const rightGeometry = await right.evaluate((element) => {
    const rect = (testId: string) => (element.querySelector(`[data-testid="${testId}"]`) as HTMLElement)
      .getBoundingClientRect().toJSON()
    return {
      viewport: (element.querySelector('.auto-image__viewport') as HTMLElement)
        .getBoundingClientRect().toJSON(),
      first: rect('auto-image-right-first'),
      firstCaption: rect('auto-image-right-first-caption'),
      second: rect('auto-image-right-second'),
      third: rect('auto-image-right-third'),
      thirdCaption: rect('auto-image-right-third-caption'),
    }
  })
  expect(rightGeometry.first.width).toBeCloseTo(rightGeometry.second.width, 1)
  expect(rightGeometry.second.width).toBeCloseTo(rightGeometry.third.width, 1)
  expect(rightGeometry.firstCaption.width).toBeCloseTo(rightGeometry.viewport.width, 1)
  expect(rightGeometry.thirdCaption.width).toBeCloseTo(rightGeometry.viewport.width, 1)
  const firstGap = rightGeometry.second.y - (rightGeometry.firstCaption.y + rightGeometry.firstCaption.height)
  const secondGap = rightGeometry.third.y - (rightGeometry.second.y + rightGeometry.second.height)
  expect(firstGap).toBeGreaterThanOrEqual(19)
  expect(secondGap).toBeCloseTo(firstGap, 1)
})

test('measures row candidates as one shared snapshot and stays idle after caption fitting', async ({ page }) => {
  await gotoHarness(page)

  const row = page.getByTestId('auto-image-multiple-top')
  const column = page.getByTestId('auto-image-multiple-right')
  await waitForState(row, 'fit')
  await waitForState(column, 'fit')
  await row.evaluate(element => { element.style.height = '100px' })
  await waitForState(row, 'fit')
  await expectStableMeasureCount(row)
  await expectStableMeasureCount(column)

  const initial = await measureCount(row)
  await row.evaluate((element) => {
    const captions = Array.from(element.querySelectorAll<HTMLElement>('.auto-image__managed-caption'))
    const scrollWidthDescriptor = (() => {
      for (let prototype: object | null = HTMLElement.prototype; prototype; prototype = Object.getPrototypeOf(prototype)) {
        const descriptor = Object.getOwnPropertyDescriptor(prototype, 'scrollWidth')
        if (descriptor?.get)
          return descriptor
      }
      throw new Error('scrollWidth getter not found')
    })()
    const snapshots: string[][] = []
    for (const caption of captions) {
      Object.defineProperty(caption, 'scrollWidth', {
        configurable: true,
        get() {
          snapshots.push(captions.map(target => target.style.getPropertyValue(
            '--slidev-auto-image-caption-inline-size',
          )))
          return scrollWidthDescriptor.get!.call(this)
        },
      })
      caption.style.removeProperty('--slidev-auto-image-caption-inline-size')
    }
    Object.assign(window, { __autoImageCandidateCaptionSnapshots: snapshots })
  })
  await waitForNextMeasure(row, initial)
  const snapshots = await page.evaluate(() => {
    const target = window as typeof window & { __autoImageCandidateCaptionSnapshots?: string[][] }
    const result = target.__autoImageCandidateCaptionSnapshots ?? []
    for (const caption of document.querySelectorAll('[data-testid="auto-image-multiple-top"] .auto-image__managed-caption'))
      delete (caption as HTMLElement & { scrollWidth?: number }).scrollWidth
    delete target.__autoImageCandidateCaptionSnapshots
    return result
  })
  expect(snapshots.length).toBeGreaterThan(0)
  expect(snapshots.every(snapshot => snapshot.every(value => value.endsWith('px')))).toBe(true)
  await expectStableMeasureCount(row)
})

test('publishes and recovers every multi-item geometry overflow reason', async ({ page }) => {
  await gotoHarness(page)

  const root = page.getByTestId('auto-image-multiple-overflow')
  const source = await root.locator('img').first().getAttribute('src')
  expect(source).toBeTruthy()

  async function setGroup(
    width: string,
    height: string,
    caption: 'none' | 'empty-first' | 'short' | 'long' | 'nowrap',
  ): Promise<void> {
    await root.evaluate((element, { width, height, caption, source }) => {
      const flow = element.querySelector('.auto-image__flow')!
      const viewport = element.querySelector<HTMLElement>('.auto-image__viewport')!
      viewport.style.width = width
      viewport.style.height = height
      const appendItem = (alt: string, index: number) => {
        const image = document.createElement('img')
        image.src = source
        image.alt = alt
        flow.append(image)
        if (caption === 'none' || (caption === 'empty-first' && index > 0))
          return
        const paragraph = document.createElement('p')
        if (caption === 'nowrap') {
          const span = document.createElement('span')
          span.style.whiteSpace = 'nowrap'
          span.textContent = 'A deliberately unbreakable multi-item caption.'
          paragraph.append(span)
        }
        else if (caption !== 'empty-first') {
          paragraph.textContent = caption === 'long'
            ? 'This multi-item caption wraps over enough lines to exceed its small region.'
            : 'Short caption.'
        }
        flow.append(paragraph)
      }
      flow.replaceChildren()
      appendItem('Overflow first', 0)
      appendItem('Overflow second', 1)
    }, { width, height, caption, source: source! })
  }

  for (const [width, height, caption, reason] of [
    ['0px', '200px', 'none', 'zero-inline-space'],
    ['200px', '0px', 'none', 'zero-block-space'],
    ['16px', '200px', 'none', 'item-gap-overflow'],
    ['200px', '200px', 'nowrap', 'caption-inline-overflow'],
    ['200px', '50px', 'long', 'caption-block-overflow'],
    ['200px', '8px', 'empty-first', 'no-image-block-space'],
    ['33px', '200px', 'none', 'no-renderable-image-size'],
  ] as const) {
    await test.step(reason, async () => {
      const before = await measureCount(root)
      await setGroup(width, height, caption)
      await waitForNextMeasure(root, before)
      await waitForState(root, 'overflow')
      await expect(root).toHaveAttribute('data-auto-image-overflow-reason', reason)
      if (reason === 'caption-inline-overflow')
        await expect(root.locator('img').first()).not.toHaveCSS('width', '0px')
      else
        await expect(root.locator('img').first()).toHaveCSS('width', '0px')
    })
  }

  await setGroup('260px', '180px', 'none')
  await waitForState(root, 'fit')
  await expect(root).not.toHaveAttribute('data-auto-image-overflow-reason')
})

test('keeps multi-item fallback, settlement, replacement, and recovery lifecycle-safe', async ({ page }) => {
  const releasePending = await gotoHarness(page)
  const root = page.getByTestId('auto-image-multiple-reactive')
  await waitForState(root, 'fit')
  const source = await root.locator('img').first().getAttribute('src')
  expect(source).toBeTruthy()

  const first = root.getByTestId('auto-image-reactive-first')
  await first.evaluate(element => {
    Object.assign(window, { __autoImageReplacedItem: element })
  })
  await root.locator('.auto-image__flow').evaluate((flow, source) => {
    flow.innerHTML = `<img src="${source}" alt="Valid first"><p>Valid caption.</p><p><img src="${source}" alt="Malformed first"><img src="${source}" alt="Malformed second"></p>`
  }, source!)
  await waitForState(root, 'unsupported')
  await expect(root).toHaveAttribute('data-auto-image-unsupported-reason', 'multiple-images')
  await expect(root.locator('.auto-image__managed-item')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => {
    const item = (window as typeof window & { __autoImageReplacedItem: HTMLElement })
      .__autoImageReplacedItem
    return item.className
  })).not.toContain('auto-image__managed')

  await root.locator('.auto-image__flow').evaluate((flow, source) => {
    flow.innerHTML = `<img src="${source}" alt="Reinserted first"><p>Reinserted first caption.</p><img src="${source}" alt="Reinserted second"><img src="${source}" alt="Reinserted third"><p>Reinserted third caption.</p>`
  }, source!)
  await waitForState(root, 'fit')
  await expect(root.locator('.auto-image__managed-image')).toHaveCount(3)
  await expect(root.locator('[data-auto-image-item-index="2"]')).toHaveCount(2)

  await root.locator('img').nth(1).evaluate((image) => {
    image.setAttribute('src', '/auto-image-pending.svg')
  })
  await waitForState(root, 'pending')
  await expect(root.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')
  releasePending()
  await waitForState(root, 'fit')
  await expect(root.locator('.auto-image__managed-image')).toHaveCount(3)

  await root.locator('img').nth(2).evaluate((image) => {
    image.setAttribute('src', '/auto-image-error.svg')
  })
  await waitForState(root, 'unsupported')
  await expect(root).toHaveAttribute('data-auto-image-unsupported-reason', 'image-unavailable')
  await expect(root.locator('.auto-image__managed-image')).toHaveCount(2)
  await expect(root.locator('img').nth(2)).toHaveClass(/auto-image__omitted-item/)

  await root.locator('.auto-image__viewport').evaluate(element => { element.style.width = '16px' })
  await expect(root).toHaveAttribute('data-auto-image-state', 'unsupported')
  await root.locator('img').nth(2).evaluate((image, source) => {
    image.setAttribute('src', source)
  }, source!)
  await waitForState(root, 'overflow')
  await expect(root).toHaveAttribute('data-auto-image-overflow-reason', 'item-gap-overflow')
  await expect(root.locator('.auto-image__managed-image')).toHaveCount(3)

  await root.locator('.auto-image__flow').evaluate((flow, source) => {
    const stale = document.createElement('img')
    stale.src = source
    stale.alt = 'Stale replacement outcome'
    Object.assign(window, { __autoImageStaleTarget: stale })
    flow.replaceChildren(stale)
    flow.innerHTML = `<img src="${source}" alt="Replacement first"><img src="${source}" alt="Replacement second">`
  }, source!)
  await waitForState(root, 'overflow')
  await expect(root).toHaveAttribute('data-auto-image-overflow-reason', 'item-gap-overflow')
  await page.evaluate(() => {
    const target = (window as typeof window & { __autoImageStaleTarget?: HTMLImageElement })
      .__autoImageStaleTarget
    target?.dispatchEvent(new Event('error'))
    delete (window as typeof window & { __autoImageStaleTarget?: HTMLImageElement })
      .__autoImageStaleTarget
  })
  await expectStableMeasureCount(root)

  await root.locator('.auto-image__viewport').evaluate(element => { element.style.width = '260px' })
  await waitForState(root, 'fit')
  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.innerHTML = '<img src="/auto-image-error.svg" alt="Legacy unavailable"><p>Legacy authored caption.</p>'
  })
  await waitForState(root, 'unsupported')
  await expect(root).toHaveAttribute('data-auto-image-unsupported-reason', 'image-unavailable')
  await expect(root.locator('img')).not.toHaveClass(/auto-image__omitted-item/)
  await expect(root.locator('p')).toHaveText('Legacy authored caption.')
})

test('retains multi-target markers and ignores detached media outcomes after unmount', async ({ page }) => {
  await gotoHarness(page)
  const root = page.getByTestId('auto-image-multiple-unmount')
  await waitForState(root, 'fit')
  await expect(root.locator('.auto-image__managed-image')).toHaveCount(3)
  const presentationBeforeUnmount = await managedPresentation(root)
  await root.evaluate(element => {
    Object.assign(window, { __autoImageDetachedMultiRoot: element })
  })
  await page.getByTestId('auto-image-multi-unmount-control').click()
  await expect(root).toHaveCount(0)
  const detached = await page.evaluate(() => {
    const root = (window as typeof window & { __autoImageDetachedMultiRoot: HTMLElement })
      .__autoImageDetachedMultiRoot
    const images = Array.from(root.querySelectorAll('img'))
    const before = root.getAttribute('data-auto-image-measure-count')
    for (const image of images) {
      image.dispatchEvent(new Event('load'))
      image.dispatchEvent(new Event('error'))
    }
    return {
      before,
      presentation: {
        state: root.getAttribute('data-auto-image-state'),
        reason: root.getAttribute('data-auto-image-overflow-reason'),
        unsupported: root.getAttribute('data-auto-image-unsupported-reason'),
        items: Array.from(root.querySelectorAll<HTMLElement>('.auto-image__managed-item')).map(item => ({
          className: item.className,
          index: item.getAttribute('data-auto-image-item-index'),
          role: item.getAttribute('data-auto-image-managed-role'),
          properties: [
            '--slidev-auto-image-image-inline-size',
            '--slidev-auto-image-image-block-size',
            '--slidev-auto-image-image-inline-offset',
            '--slidev-auto-image-image-block-offset',
            '--slidev-auto-image-caption-inline-size',
            '--slidev-auto-image-caption-inline-offset',
            '--slidev-auto-image-caption-block-offset',
          ].map(property => [property, item.style.getPropertyValue(property)]),
        })),
      },
    }
  })
  expect(detached.presentation).toEqual(presentationBeforeUnmount)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  expect(await page.evaluate(() => {
    const root = (window as typeof window & { __autoImageDetachedMultiRoot: HTMLElement })
      .__autoImageDetachedMultiRoot
    return root.getAttribute('data-auto-image-measure-count')
  })).toBe(detached.before)
})

test('gates multi-image rendering, omits settled failures, and recovers them', async ({ page }) => {
  const releasePending = await gotoHarness(page)

  const pending = page.getByTestId('auto-image-multiple-pending')
  await waitForState(pending, 'pending')
  await expect(pending.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')
  releasePending()
  await waitForState(pending, 'fit')

  const failed = page.getByTestId('auto-image-multiple-failure')
  await waitForState(failed, 'unsupported')
  await expect(failed).toHaveAttribute('data-auto-image-unsupported-reason', 'image-unavailable')
  await expect(failed.getByTestId('auto-image-multiple-failure-first')).toHaveClass(/auto-image__managed-image/)
  await expect(failed.getByTestId('auto-image-multiple-failure-first-caption')).toHaveCSS('width', '240px')
  await expect(failed.getByTestId('auto-image-multiple-failure-broken')).toHaveCSS('display', 'none')
  await expect(failed.getByTestId('auto-image-multiple-failure-broken-caption')).toHaveCSS('display', 'none')

  await failed.getByTestId('auto-image-multiple-failure-broken').evaluate((element) => {
    (element as HTMLImageElement).src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Crect width='300' height='300' fill='green'/%3E%3C/svg%3E"
  })
  await waitForState(failed, 'fit')
  await expect(failed.getByTestId('auto-image-multiple-failure-broken')).toHaveClass(/auto-image__managed-image/)
  await expect(failed.getByTestId('auto-image-multiple-failure-broken-caption')).toHaveClass(/auto-image__managed-caption/)

  const itemGapOverflow = page.getByTestId('auto-image-multiple-item-gap-overflow')
  await waitForState(itemGapOverflow, 'overflow')
  await expect(itemGapOverflow).toHaveAttribute('data-auto-image-overflow-reason', 'item-gap-overflow')
  await expect(itemGapOverflow.getByTestId('auto-image-multiple-item-gap-first')).toHaveCSS('width', '0px')
  await expect(itemGapOverflow.getByTestId('auto-image-multiple-item-gap-second')).toHaveCSS('width', '0px')

  const clampedGap = page.getByTestId('auto-image-multiple-item-gap-clamped')
  await waitForState(clampedGap, 'fit')
  const clampedOffsets = await clampedGap.evaluate((element) => {
    const offset = (testId: string) => Number.parseFloat(getComputedStyle(
      element.querySelector(`[data-testid="${testId}"]`)!,
    ).getPropertyValue('--slidev-auto-image-image-inline-offset'))
    const width = Number.parseFloat(getComputedStyle(
      element.querySelector('[data-testid="auto-image-multiple-item-gap-clamped-first"]')!,
    ).getPropertyValue('--slidev-auto-image-image-inline-size'))
    return {
      first: offset('auto-image-multiple-item-gap-clamped-first'),
      second: offset('auto-image-multiple-item-gap-clamped-second'),
      width,
    }
  })
  expect(clampedOffsets.second - clampedOffsets.first - clampedOffsets.width).toBeCloseTo(16, 3)

  const allFailed = page.getByTestId('auto-image-multiple-all-failed')
  await waitForState(allFailed, 'unsupported')
  await expect(allFailed).toHaveAttribute('data-auto-image-unsupported-reason', 'image-unavailable')
  await expect(allFailed.locator('.auto-image__managed-item')).toHaveCount(0)
  await expect(allFailed.getByTestId('auto-image-multiple-all-failed-first')).toHaveCSS('display', 'none')
  await expect(allFailed.getByTestId('auto-image-multiple-all-failed-second-caption')).toHaveCSS('display', 'none')
})

test('keeps valid loading pending, then reports error and recovers on a new source', async ({ page }) => {
  const warningMessages: string[] = []
  page.on('console', message => {
    if (
      message.type() === 'warning'
      && message.text().includes('AUTO IMAGE UNSUPPORTED (image-unavailable)')
    ) {
      warningMessages.push(message.text())
    }
  })
  const releasePending = await gotoHarness(page)

  const pending = page.getByTestId('auto-image-pending')
  await waitForState(pending, 'pending')
  await expect(pending).not.toHaveAttribute('data-auto-image-unsupported-reason')
  await expect(pending).not.toHaveClass(/auto-image--unsupported/)
  await expect(pending.locator('.auto-image__flow')).toHaveCSS('visibility', 'hidden')
  const warningsBeforeRecovery = warningMessages.length
  releasePending()
  await expect(pending).toHaveAttribute('data-auto-image-state', 'fit')

  const error = page.getByTestId('auto-image-error')
  await waitForState(error, 'unsupported')
  await expect(error).toHaveAttribute('data-auto-image-unsupported-reason', 'image-unavailable')
  await expect(error.locator('.auto-image__flow')).toHaveCSS('visibility', 'visible')
  await expect(error.locator('img')).toHaveAttribute('alt', 'Error fixture')
  await expect(page.getByTestId('auto-image-error-caption')).toHaveText('Authored error caption.')

  await page.getByTestId('auto-image-error').locator('img').evaluate((element) => {
    const image = element as HTMLImageElement
    image.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200'%3E%3Crect width='400' height='200' fill='green'/%3E%3C/svg%3E"
  })
  await waitForState(error, 'fit')
  await expect(error.locator('.auto-image__flow')).toHaveCSS('visibility', 'visible')
  await expect(error).not.toHaveAttribute('data-auto-image-unsupported-reason')
  await expect.poll(() => warningMessages.length).toBe(warningsBeforeRecovery)
})

test('applies component-local caption custom properties and color derivation', async ({ page }) => {
  await gotoHarness(page)

  const root = page.getByTestId('auto-image-custom-properties')
  await waitForState(root, 'fit')
  const caption = root.locator('p').last()
  await expect(caption).toHaveCSS('font-size', '20px')
  await expect(caption).toHaveCSS('line-height', '24px')
  await expect(caption).toHaveCSS('color', /(?:rgb|color\(srgb)/)
  const geometry = await groupGeometry(root)
  expect(geometry.image.width / geometry.image.height).toBeCloseTo(1, 3)
  expect(geometry.caption).not.toBeNull()
})

test('uses the viewport content box and preserves managed and authored semantics', async ({ page }) => {
  await gotoHarness(page)

  const contentBox = page.getByTestId('auto-image-content-box')
  await waitForState(contentBox, 'fit')
  const contentGeometry = await groupGeometry(contentBox)
  const contentMetrics = await contentBox.evaluate((element) => {
    const root = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    const scale = root.width / Number.parseFloat(style.width)
    const horizontalEdges = Number.parseFloat(style.paddingLeft)
      + Number.parseFloat(style.paddingRight)
      + Number.parseFloat(style.borderLeftWidth)
      + Number.parseFloat(style.borderRightWidth)
    const verticalEdges = Number.parseFloat(style.paddingTop)
      + Number.parseFloat(style.paddingBottom)
      + Number.parseFloat(style.borderTopWidth)
      + Number.parseFloat(style.borderBottomWidth)
    return {
      expectedWidth: (Number.parseFloat(style.width) - horizontalEdges) * scale,
      expectedHeight: (Number.parseFloat(style.height) - verticalEdges) * scale,
      scale,
    }
  })
  expect(contentGeometry.viewport.width).toBeCloseTo(contentMetrics.expectedWidth, 1)
  expect(contentGeometry.viewport.height).toBeCloseTo(contentMetrics.expectedHeight, 1)
  expect(contentGeometry.image.width).toBeCloseTo(contentGeometry.viewport.height, 1)
  expect(contentGeometry.image.height).toBeCloseTo(contentGeometry.viewport.height, 1)
  expect(contentGeometry.image.left - contentGeometry.viewport.left)
    .toBeCloseTo((contentGeometry.viewport.width - contentGeometry.image.width) / 2, 1)
  expect(contentGeometry.image.top - contentGeometry.viewport.top)
    .toBeCloseTo(0, 1)

  const managed = page.getByTestId('auto-image-accessible')
  await waitForState(managed, 'fit')
  const managedImage = page.getByTestId('auto-image-accessible-image')
  await expect(managedImage).toHaveAttribute('alt', 'Accessible fixture')
  await expect(managedImage).toHaveAttribute('title', 'Accessible title')
  await expect(managedImage).toHaveAttribute('role', 'img')
  await expect(managedImage).toHaveAttribute('aria-label', 'Accessible image')
  await expect(managedImage).toHaveAttribute(
    'aria-describedby',
    'auto-image-accessible-description',
  )
  await expect(managedImage).toHaveClass(/auto-image__managed-image/)
  const managedGeometry = await groupGeometry(managed)
  expect(managedGeometry.image.width).toBeCloseTo(managedGeometry.viewport.width, 1)
  expect(managedGeometry.image.height).toBeCloseTo(managedGeometry.image.width / 2, 1)
  await expect(managedImage).toHaveCSS('margin', '0px')
  await expect(page.getByTestId('auto-image-accessible-caption')).toHaveJSProperty(
    'tagName',
    'P',
  )
  await expect(managed.locator('.auto-image__managed-image-wrapper')).toHaveCSS(
    'margin',
    '0px',
  )
  await expect(page.getByTestId('auto-image-accessible-caption')).toHaveCSS(
    'margin',
    '0px',
  )

  const fallback = page.getByTestId('auto-image-authored-fallback')
  await waitForState(fallback, 'unsupported')
  await expect(fallback).toHaveAttribute(
    'data-auto-image-unsupported-reason',
    'unexpected-image-wrapper',
  )
  const fallbackImage = page.getByTestId('auto-image-fallback-image')
  await expect(fallbackImage).toHaveAttribute('alt', 'Fallback fixture')
  await expect(fallbackImage).toHaveAttribute('title', 'Fallback title')
  await expect(fallbackImage).toHaveAttribute('role', 'img')
  await expect(fallbackImage).toHaveAttribute('aria-label', 'Fallback image')
  await expect(fallbackImage).toHaveAttribute(
    'aria-describedby',
    'auto-image-fallback-description',
  )
  await expect(fallbackImage).not.toHaveClass(/auto-image__managed-image/)
  await expect(page.getByTestId('auto-image-fallback-caption')).toHaveJSProperty(
    'tagName',
    'P',
  )
  await expect(fallback.locator('.auto-image__flow')).toHaveCSS('visibility', 'visible')
})

test('publishes exact default custom properties and derives caption color in light and dark modes', async ({ page }) => {
  await gotoHarness(page)

  const root = page.getByTestId('auto-image-default-properties')
  await waitForState(root, 'fit')
  const properties = await root.evaluate((element) => {
    const caption = element.querySelector('.auto-image__managed-caption')!
    const style = getComputedStyle(element)
    return {
      regionGap: style.getPropertyValue('--slidev-auto-image-region-gap').trim(),
      itemGap: style.getPropertyValue('--slidev-auto-image-item-gap').trim(),
      captionGap: style.getPropertyValue('--slidev-auto-image-caption-gap').trim(),
      captionFontSize: style.getPropertyValue('--slidev-auto-image-caption-font-size').trim(),
      captionLineHeight: style.getPropertyValue('--slidev-auto-image-caption-line-height').trim(),
      captionColor: getComputedStyle(caption).color,
    }
  })
  expect(properties).toMatchObject({
    regionGap: '2rem',
    itemGap: '2rem',
    captionGap: '0.5rem',
    captionFontSize: '0.875rem',
    captionLineHeight: '1.25rem',
  })

  const expectedColor = await root.evaluate((element) => {
    const reference = document.createElement('span')
    reference.style.color = 'color-mix(in srgb, currentColor 70%, transparent)'
    element.append(reference)
    const color = getComputedStyle(reference).color
    reference.remove()
    return color
  })
  expect(properties.captionColor).toBe(expectedColor)

  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await expect.poll(() => root.evaluate((element) => {
    const caption = element.querySelector('.auto-image__managed-caption')!
    return getComputedStyle(caption).color
  })).not.toBe(properties.captionColor)
  const darkColor = await root.evaluate((element) => {
    const caption = element.querySelector('.auto-image__managed-caption')!
    const reference = document.createElement('span')
    reference.style.color = 'color-mix(in srgb, currentColor 70%, transparent)'
    element.append(reference)
    const result = {
      caption: getComputedStyle(caption).color,
      reference: getComputedStyle(reference).color,
    }
    reference.remove()
    return result
  })
  expect(darkColor.caption).toBe(darkColor.reference)
})

test('publishes every overflow reason with exact group geometry and precedence', async ({ page }) => {
  await gotoHarness(page)

  const zeroInline = page.getByTestId('auto-image-zero-inline')
  await waitForState(zeroInline, 'overflow')
  const zeroInlineGeometry = await groupGeometry(zeroInline)
  expect(zeroInlineGeometry.image).toMatchObject({ width: 0, height: 0 })
  expect(zeroInlineGeometry.image.top - zeroInlineGeometry.viewport.top)
    .toBeCloseTo(zeroInlineGeometry.viewport.height / 2, 1)
  expect(zeroInlineGeometry.caption).toBeNull()

  const zeroBlock = page.getByTestId('auto-image-zero-block')
  await waitForState(zeroBlock, 'overflow')
  const zeroBlockGeometry = await groupGeometry(zeroBlock)
  expect(zeroBlockGeometry.image).toMatchObject({ width: 0, height: 0 })
  expect(zeroBlockGeometry.image.top - zeroBlockGeometry.viewport.top)
    .toBeCloseTo(0, 1)

  const inline = page.getByTestId('auto-image-caption-overflow')
  await waitForState(inline, 'overflow')
  const inlineGeometry = await groupGeometry(inline)
  const inlineScale = await cssScale(inline)
  expect(inlineGeometry.caption).not.toBeNull()
  expect(inlineGeometry.image.width).toBeCloseTo(inlineGeometry.viewport.width, 1)
  expect(inlineGeometry.image.height).toBeGreaterThan(0)
  const inlineGap = inlineGeometry.caption!.top
    - (inlineGeometry.image.top + inlineGeometry.image.height)
  expect(inlineGap).toBeCloseTo(8 * inlineScale, 1)
  const inlineGroupHeight = inlineGeometry.image.height
    + inlineGap
    + inlineGeometry.caption!.height
  expect(inlineGeometry.image.top - inlineGeometry.viewport.top)
    .toBeCloseTo(Math.max(0, (inlineGeometry.viewport.height - inlineGroupHeight) / 2), 1)
  expect(inlineGeometry.caption!.width).toBeCloseTo(inlineGeometry.viewport.width, 1)

  const inlineNoSpace = page.getByTestId('auto-image-caption-inline-no-space')
  await waitForState(inlineNoSpace, 'overflow')
  await expect(inlineNoSpace).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'caption-inline-overflow',
  )
  const inlineNoSpaceGeometry = await groupGeometry(inlineNoSpace)
  const inlineNoSpaceScale = await cssScale(inlineNoSpace)
  expect(inlineNoSpaceGeometry.image).toMatchObject({ width: 0, height: 0 })
  expect(inlineNoSpaceGeometry.caption).not.toBeNull()
  expect(inlineNoSpaceGeometry.caption!.width).toBeCloseTo(inlineNoSpaceScale, 1)
  expect(inlineNoSpaceGeometry.caption!.top - inlineNoSpaceGeometry.image.top)
    .toBeCloseTo(8 * inlineNoSpaceScale, 1)
  expect(inlineNoSpaceGeometry.image.top - inlineNoSpaceGeometry.viewport.top)
    .toBeCloseTo(0, 1)

  const zeroInlinePrecedence = page.getByTestId('auto-image-zero-inline-precedence')
  await waitForState(zeroInlinePrecedence, 'overflow')
  await expect(zeroInlinePrecedence).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'zero-inline-space',
  )
  const zeroInlinePrecedenceGeometry = await groupGeometry(zeroInlinePrecedence)
  const zeroInlinePrecedenceScale = await cssScale(zeroInlinePrecedence)
  expect(zeroInlinePrecedenceGeometry.image).toMatchObject({ width: 0, height: 0 })
  expect(zeroInlinePrecedenceGeometry.caption).not.toBeNull()
  expect(zeroInlinePrecedenceGeometry.caption!.width).toBeCloseTo(0, 1)
  expect(zeroInlinePrecedenceGeometry.caption!.top - zeroInlinePrecedenceGeometry.image.top)
    .toBeCloseTo(8 * zeroInlinePrecedenceScale, 1)

  const captionBlock = page.getByTestId('auto-image-caption-block')
  await waitForState(captionBlock, 'overflow')
  const captionBlockGeometry = await groupGeometry(captionBlock)
  const captionBlockScale = await cssScale(captionBlock)
  expect(captionBlockGeometry.image).toMatchObject({ width: 0, height: 0 })
  expect(captionBlockGeometry.caption).not.toBeNull()
  expect(captionBlockGeometry.caption!.height).toBeGreaterThan(100)
  expect(captionBlockGeometry.caption!.top - captionBlockGeometry.viewport.top)
    .toBeCloseTo(8 * captionBlockScale, 1)
  expect(captionBlockGeometry.caption!.top - captionBlockGeometry.image.top)
    .toBeCloseTo(8 * captionBlockScale, 1)

  const noImageBlock = page.getByTestId('auto-image-no-image-block')
  await waitForState(noImageBlock, 'overflow')
  const noImageBlockGeometry = await groupGeometry(noImageBlock)
  const noImageBlockScale = await cssScale(noImageBlock)
  expect(noImageBlockGeometry.image).toMatchObject({ width: 0, height: 0 })
  expect(noImageBlockGeometry.caption).not.toBeNull()
  expect(noImageBlockGeometry.caption!.top - noImageBlockGeometry.image.top)
    .toBeCloseTo(8 * noImageBlockScale, 1)
  expect(noImageBlockGeometry.image.top - noImageBlockGeometry.viewport.top)
    .toBeCloseTo(0, 1)

  const noRenderable = page.getByTestId('auto-image-no-renderable')
  await waitForState(noRenderable, 'overflow')
  const noRenderableGeometry = await groupGeometry(noRenderable)
  expect(noRenderableGeometry.image).toMatchObject({ width: 0, height: 0 })
  expect(noRenderableGeometry.image.top - noRenderableGeometry.viewport.top)
    .toBeCloseTo(noRenderableGeometry.viewport.height / 2, 1)

  const tolerance = page.getByTestId('auto-image-tolerance')
  await waitForState(tolerance, 'overflow')
  await expect(tolerance).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'zero-inline-space',
  )
  await expect(tolerance.locator('img')).toHaveCSS('width', '0px')
  await expect(tolerance.locator('.auto-image__viewport')).toHaveCSS('overflow', 'hidden')
  await expect(tolerance.locator('.auto-image__flow')).toHaveCSS('overflow', 'hidden')

  const captionTolerance = page.getByTestId('auto-image-caption-tolerance')
  await waitForState(captionTolerance, 'fit')
  const captionToleranceCount = await measureCount(captionTolerance)
  await captionTolerance.locator('.auto-image__managed-caption').evaluate((element) => {
    Object.defineProperty(element, 'scrollWidth', {
      configurable: true,
      value: 180.4,
    })
    element.style.setProperty('letter-spacing', 'normal')
  })
  await waitForNextMeasure(captionTolerance, captionToleranceCount)
  await expect(captionTolerance).toHaveAttribute('data-auto-image-state', 'fit')
  const beyondToleranceCount = await measureCount(captionTolerance)
  await captionTolerance.locator('.auto-image__managed-caption').evaluate((element) => {
    Object.defineProperty(element, 'scrollWidth', {
      configurable: true,
      value: 180.6,
    })
    element.style.setProperty('letter-spacing', '0.001px')
  })
  await waitForNextMeasure(captionTolerance, beyondToleranceCount)
  await expect(captionTolerance).toHaveAttribute('data-auto-image-state', 'overflow')
  await expect(captionTolerance).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'caption-inline-overflow',
  )
})

test('remeasures for every approved invalidation source and suppresses stale frames', async ({ page }) => {
  await gotoHarness(page)

  const root = page.getByTestId('auto-image-reactive')
  const image = root.locator('img')
  const captionRoot = page.getByTestId('auto-image-reactive-caption')
  await waitForState(root, 'fit')
  await waitForState(captionRoot, 'fit')
  await expect.poll(() => measureCount(root)).toBeGreaterThan(0)

  async function trigger(action: () => Promise<void>): Promise<void> {
    const before = await measureCount(root)
    await action()
    await waitForNextMeasure(root, before)
  }

  async function triggerOn(target: Locator, action: () => Promise<void>): Promise<void> {
    const before = await measureCount(target)
    await action()
    await waitForNextMeasure(target, before)
  }

  await trigger(() => root.evaluate(element => { element.style.width = '220px' }))
  await trigger(() => root.locator('.auto-image__viewport').evaluate(element => {
    element.style.width = '210px'
  }))
  await trigger(() => root.locator('.auto-image__flow').evaluate(element => {
    element.style.height = '170px'
  }))
  await trigger(() => root.locator('.auto-image__viewport').evaluate(element => {
    element.style.width = ''
  }))
  await trigger(() => root.locator('.auto-image__flow').evaluate(element => {
    element.style.height = ''
  }))
  await trigger(() => image.evaluate(element => { element.classList.toggle('author-class') }))
  await trigger(() => image.evaluate(element => { element.setAttribute('height', '31') }))
  await trigger(() => image.evaluate(element => { element.hidden = true }))
  await trigger(() => image.evaluate(element => { element.hidden = false }))
  await trigger(() => image.evaluate(element => {
    element.style.setProperty('filter', 'none')
  }))
  await trigger(() => image.evaluate(element => { element.setAttribute('width', '37') }))
  await trigger(() => image.evaluate(element => {
    element.setAttribute(
      'src',
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='100'%3E%3C/svg%3E",
    )
  }))
  await waitForState(root, 'fit')
  await triggerOn(captionRoot, () => captionRoot.locator('.auto-image__managed-caption').evaluate(element => {
    element.firstChild!.textContent = 'Changed reactive caption.'
  }))
  await triggerOn(captionRoot, () => captionRoot.locator('.auto-image__managed-caption').evaluate(element => {
    element.append(document.createComment('reactive child-list probe'))
  }))
  await triggerOn(captionRoot, () => captionRoot.locator('.auto-image__managed-caption').evaluate(element => {
    element.style.fontSize = '20px'
  }))

  const ancestor = page.getByTestId('auto-image-harness')
  await trigger(() => ancestor.evaluate(element => { element.classList.toggle('ancestor-trigger') }))
  await trigger(() => ancestor.evaluate(element => { element.style.setProperty('color', 'inherit') }))
  await trigger(() => ancestor.evaluate(element => { element.hidden = true }))
  await trigger(() => ancestor.evaluate(element => { element.hidden = false }))

  await page.evaluate(() => {
    const style = document.createElement('style')
    style.dataset.autoImageLifecycleProbe = 'inserted'
    style.textContent = '[data-auto-image-lifecycle-probe] { color: inherit; }'
    document.head.append(style)
  })
  await waitForNextMeasure(root, await measureCount(root))
  await trigger(async () => {
    await page.evaluate(() => {
      const style = document.head.querySelector('style[data-auto-image-lifecycle-probe]')!
      style.textContent = '[data-auto-image-lifecycle-probe] { color: transparent; }'
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const link = document.createElement('link')
      link.dataset.autoImageLifecycleProbe = 'link'
      link.rel = 'stylesheet'
      link.href = 'data:text/css,[data-auto-image-lifecycle-probe]%7Bcolor:inherit%7D'
      document.head.append(link)
      link.dispatchEvent(new Event('load'))
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const link = document.querySelector<HTMLLinkElement>('link[data-auto-image-lifecycle-probe]')!
      link.media = 'screen'
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const link = document.querySelector<HTMLLinkElement>('link[data-auto-image-lifecycle-probe]')!
      link.rel = 'alternate stylesheet'
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const link = document.querySelector<HTMLLinkElement>('link[data-auto-image-lifecycle-probe]')!
      link.rel = 'stylesheet'
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const link = document.querySelector<HTMLLinkElement>('link[data-auto-image-lifecycle-probe]')!
      link.href = 'data:text/css,[data-auto-image-lifecycle-probe]%7Bcolor:transparent%7D'
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const link = document.querySelector<HTMLLinkElement>('link[data-auto-image-lifecycle-probe]')!
      link.dispatchEvent(new Event('load'))
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      document.head.querySelector('style[data-auto-image-lifecycle-probe]')!.remove()
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      document.head.querySelector('link[data-auto-image-lifecycle-probe]')!.remove()
    })
  })

  await trigger(async () => {
    await page.evaluate(() => document.fonts.dispatchEvent(new Event('loadingdone')))
  })
  await trigger(async () => {
    await page.evaluate(() => document.fonts.dispatchEvent(new Event('loadingerror')))
  })
  await trigger(async () => {
    await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  })
  await trigger(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const hooks = (window as typeof window & {
        __slidevAutoImageTestHooks: { triggerAfterUpdate(): void }
      }).__slidevAutoImageTestHooks
      hooks.triggerAfterUpdate()
    })
  })
  await trigger(async () => {
    await page.evaluate(() => {
      const hooks = (window as typeof window & {
        __slidevAutoImageTestHooks: { triggerFontReady(): void }
      }).__slidevAutoImageTestHooks
      hooks.triggerFontReady()
    })
  })

  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageHeldFrames?: FrameRequestCallback[]
      __autoImageOriginalRequestAnimationFrame?: typeof requestAnimationFrame
    }
    const heldFrames: FrameRequestCallback[] = []
    target.__autoImageHeldFrames = heldFrames
    target.__autoImageOriginalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 700_000 + heldFrames.length
    }
  })
  const beforeStaleFrame = await measureCount(root)
  await root.evaluate(element => {
    element.style.width = '80px'
    element.style.height = '80px'
  })
  await root.evaluate(element => {
    element.style.width = '320px'
    element.style.height = '100px'
  })
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { __autoImageHeldFrames?: FrameRequestCallback[] })
      .__autoImageHeldFrames?.length ?? 0,
  )).toBeGreaterThan(0)
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageHeldFrames?: FrameRequestCallback[]
      __autoImageOriginalRequestAnimationFrame?: typeof requestAnimationFrame
    }
    window.requestAnimationFrame = target.__autoImageOriginalRequestAnimationFrame!
    for (const callback of target.__autoImageHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await waitForNextMeasure(root, beforeStaleFrame)
  const staleGeometry = await groupGeometry(root)
  const staleScale = await cssScale(root)
  expect(staleGeometry.viewport.width).toBeCloseTo(320 * staleScale, 1)
  expect(staleGeometry.viewport.height).toBeCloseTo(100 * staleScale, 1)
  expect(staleGeometry.image.width).toBeCloseTo(200 * staleScale, 1)
  expect(staleGeometry.image.height).toBeCloseTo(100 * staleScale, 1)
})

test('deduplicates stable warnings and follows reason-change, recovery, and re-entry policy', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', message => {
    if (message.type() === 'warning'
      && message.text().startsWith('[slidev-addon-autofit] AUTO IMAGE')) {
      warnings.push(message.text())
    }
  })
  await gotoHarness(page)

  const root = page.getByTestId('auto-image-transitions')
  await waitForState(root, 'fit')
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
  const beforeFirstTransition = warnings.length

  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.insertAdjacentHTML(
      'beforeend',
      '<p><span style="white-space: nowrap">An unbreakable transition caption.</span></p>',
    )
  })
  await waitForState(root, 'overflow')
  await expect(root).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'caption-inline-overflow',
  )
  await expect.poll(() => warnings.length).toBeGreaterThan(beforeFirstTransition)
  expect(warnings[warnings.length - 1]).toBe(
    '[slidev-addon-autofit] AUTO IMAGE OVERFLOW (caption-inline-overflow): managed image content exceeds its viewport.',
  )
  const afterFirstTransition = warnings.length

  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.lastElementChild!.classList.toggle('stable-author-change')
  })
  await expect.poll(() => measureCount(root)).toBeGreaterThan(0)
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
  expect(warnings.length).toBe(afterFirstTransition)

  await page.getByTestId('auto-image-transition-zero-block').click()
  await waitForState(root, 'overflow')
  await expect(root).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'zero-block-space',
  )
  await expect.poll(() => warnings.length).toBe(afterFirstTransition + 1)
  expect(warnings[warnings.length - 1]).toBe(
    '[slidev-addon-autofit] AUTO IMAGE OVERFLOW (zero-block-space): managed image content exceeds its viewport.',
  )

  await page.getByTestId('auto-image-transition-restore-block').click()
  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.replaceChildren(flow.querySelector('img')!)
  })
  await waitForState(root, 'fit')
  const beforeUnsupported = warnings.length

  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.innerHTML = '<p>Missing image.</p>'
  })
  await waitForState(root, 'unsupported')
  await expect(root).toHaveAttribute(
    'data-auto-image-unsupported-reason',
    'missing-image',
  )
  await expect.poll(() => warnings.length).toBe(beforeUnsupported + 1)
  expect(warnings[warnings.length - 1]).toBe(
    '[slidev-addon-autofit] AUTO IMAGE UNSUPPORTED (missing-image): authored image content is shown without managed sizing.',
  )
  const afterMissing = warnings.length

  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.innerHTML = '<a><img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'150\'%3E%3C/svg%3E" alt="wrapped"></a>'
  })
  await waitForState(root, 'unsupported')
  await expect(root).toHaveAttribute(
    'data-auto-image-unsupported-reason',
    'unexpected-image-wrapper',
  )
  await expect.poll(() => warnings.length).toBe(afterMissing + 1)
  expect(warnings[warnings.length - 1]).toBe(
    '[slidev-addon-autofit] AUTO IMAGE UNSUPPORTED (unexpected-image-wrapper): authored image content is shown without managed sizing.',
  )

  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.innerHTML = '<img src="data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'300\' height=\'150\'%3E%3C/svg%3E" alt="recovered">'
  })
  await waitForState(root, 'fit')
  const beforeReentry = warnings.length
  await root.locator('.auto-image__flow').evaluate(flow => {
    flow.innerHTML = '<p>Missing again.</p>'
  })
  await waitForState(root, 'unsupported')
  await expect(root).toHaveAttribute(
    'data-auto-image-unsupported-reason',
    'missing-image',
  )
  await expect.poll(() => warnings.length).toBe(beforeReentry + 1)
  expect(warnings[warnings.length - 1]).toBe(
    '[slidev-addon-autofit] AUTO IMAGE UNSUPPORTED (missing-image): authored image content is shown without managed sizing.',
  )
})

test('cleans lifecycle observers, listeners, frames, and test seams on unmount', async ({ page }) => {
  await gotoHarness(page)
  const hooks = () => page.evaluate(() => {
    const value = (window as typeof window & {
      __slidevAutoImageTestHooks?: {
        activeInstances: number
        invalidations: string[]
      }
    }).__slidevAutoImageTestHooks
    return {
      activeInstances: value?.activeInstances ?? -1,
      invalidations: value?.invalidations.length ?? -1,
    }
  })
  const before = await hooks()
  const unmount = page.getByTestId('auto-image-unmount')
  await waitForState(unmount, 'fit')
  await unmount.evaluate(element => {
    ;(window as typeof window & { __autoImageDetachedRoot?: HTMLElement })
      .__autoImageDetachedRoot = element
  })
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageHeldFrames?: FrameRequestCallback[]
      __autoImageOriginalRequestAnimationFrame?: typeof requestAnimationFrame
    }
    const heldFrames: FrameRequestCallback[] = []
    target.__autoImageHeldFrames = heldFrames
    target.__autoImageOriginalRequestAnimationFrame = window.requestAnimationFrame.bind(window)
    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      heldFrames.push(callback)
      return 710_000 + heldFrames.length
    }
  })
  await unmount.evaluate(element => { element.style.width = '100px' })
  await page.getByTestId('auto-image-unmount-control').click()
  await expect(unmount).toHaveCount(0)
  await expect.poll(async () => (await hooks()).activeInstances).toBe(before.activeInstances - 1)
  const detachedMeasureCountAfterUnmount = await page.evaluate(() => {
    const root = (window as typeof window & {
      __autoImageDetachedRoot?: HTMLElement
    }).__autoImageDetachedRoot!
    return root.getAttribute('data-auto-image-measure-count')
  })
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageDetachedRoot?: HTMLElement
      __slidevAutoImageTestHooks?: { triggerAfterUpdate(): void }
      __autoImageHeldFrames?: FrameRequestCallback[]
      __autoImageOriginalRequestAnimationFrame?: typeof requestAnimationFrame
    }
    target.__slidevAutoImageTestHooks?.triggerAfterUpdate()
    window.dispatchEvent(new Event('resize'))
    document.dispatchEvent(new Event('visibilitychange'))
    document.fonts.dispatchEvent(new Event('loadingdone'))
    target.__autoImageDetachedRoot
      ?.querySelector('img')
      ?.dispatchEvent(new Event('load'))
    window.requestAnimationFrame = target.__autoImageOriginalRequestAnimationFrame!
    for (const callback of target.__autoImageHeldFrames?.splice(0) ?? [])
      callback(performance.now())
  })
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
  expect(await hooks()).toMatchObject({
    activeInstances: before.activeInstances - 1,
  })
  expect(await page.evaluate(() => {
    const root = (window as typeof window & {
      __autoImageDetachedRoot?: HTMLElement
    }).__autoImageDetachedRoot!
    return root.getAttribute('data-auto-image-measure-count')
  })).toBe(detachedMeasureCountAfterUnmount)
})
