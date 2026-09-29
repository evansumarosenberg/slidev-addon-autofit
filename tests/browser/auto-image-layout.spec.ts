import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  waitForAnimationFrames,
  waitForAutofitLifecycleIdle,
  waitForAutofitPublication,
  waitForPageAssets,
} from './helpers/autofit-settle'

const EPSILON = 1
const RECT_KEYS = ['x', 'y', 'width', 'height'] as const

type Rect = Record<typeof RECT_KEYS[number], number>

async function openSlide(page: Page, slide: number, marker: string) {
  await page.goto(`/${slide}`)
  await expect(page.getByTestId(marker)).toBeVisible()
}

function layoutFor(page: Page, marker: string): Locator {
  return page.locator('.slidev-layout.auto-image').filter({
    has: page.getByTestId(marker),
  })
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  expect(value).not.toBeNull()
  return value!
}

async function splitMetrics(layout: Locator) {
  return layout.evaluate((element) => {
    const root = element as HTMLElement
    const stage = root.querySelector<HTMLElement>('.auto-image-layout__stage')!
    const image = root.querySelector<HTMLElement>('.auto-image-layout__image-track')!
    const auto = root.querySelector<HTMLElement>('.auto-image-layout__auto-track')!
    const rectangle = (target: HTMLElement) => {
      const rect = target.getBoundingClientRect()
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    const stageRect = stage.getBoundingClientRect()
    return {
      stage: rectangle(stage),
      image: rectangle(image),
      auto: rectangle(auto),
      scale: stageRect.width / stage.clientWidth,
      computedGap: getComputedStyle(stage)
        .getPropertyValue('--slidev-auto-image-region-gap')
        .trim(),
    }
  })
}

function closeTo(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(EPSILON)
}

function expectRectClose(actual: Rect, expected: Rect, context = 'rectangle') {
  for (const key of RECT_KEYS)
    expect(Math.abs(actual[key] - expected[key]), `${context} ${key}`).toBeLessThanOrEqual(EPSILON)
}

async function shellMetrics(layout: Locator, remainingSelector: string) {
  return layout.evaluate((element, selector) => {
    const root = element as HTMLElement
    const required = (query: string) => {
      const match = root.querySelector<HTMLElement>(query)
      if (!match)
        throw new Error(`Missing shell element: ${query}`)
      return match
    }
    const rect = (target: HTMLElement): Rect => {
      const value = target.getBoundingClientRect()
      return {
        x: value.x,
        y: value.y,
        width: value.width,
        height: value.height,
      }
    }
    const rootRect = root.getBoundingClientRect()
    const rootStyle = getComputedStyle(root)
    const inlineScale = rootRect.width / root.clientWidth
    const blockScale = rootRect.height / root.clientHeight

    return {
      root: rect(root),
      content: {
        left: rootRect.left + Number.parseFloat(rootStyle.paddingLeft) * inlineScale,
        top: rootRect.top + Number.parseFloat(rootStyle.paddingTop) * blockScale,
        right: rootRect.right - Number.parseFloat(rootStyle.paddingRight) * inlineScale,
        bottom: rootRect.bottom - Number.parseFloat(rootStyle.paddingBottom) * blockScale,
      },
      padding: {
        top: rootStyle.paddingTop,
        right: rootStyle.paddingRight,
        bottom: rootStyle.paddingBottom,
        left: rootStyle.paddingLeft,
      },
      main: rect(required('.auto-image-layout__main, .auto-default-layout__main')),
      remaining: rect(required(selector)),
      footer: rect(required('.auto-image-layout__footer, .auto-default-layout__footer')),
      overflow: rootStyle.overflow,
      remainingOverflow: getComputedStyle(required(selector)).overflow,
      rows: rootStyle.gridTemplateRows,
      columns: rootStyle.gridTemplateColumns,
    }
  }, remainingSelector)
}

async function headingStyles(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      fontSize: Number.parseFloat(style.fontSize),
      marginInlineStart: Number.parseFloat(style.marginInlineStart),
      textIndent: Number.parseFloat(style.textIndent),
    }
  })
}

const AUTO_IMAGE_REVEAL_SLIDE = 158
const AUTO_IMAGE_REVEAL_CLICKS = 42
const AUTO_IMAGE_RAW_CONFIG_HARNESS_SLIDE = 161

type RevealRect = { readonly x: number, readonly y: number, readonly width: number, readonly height: number }

interface AutoImageRevealSnapshot {
  readonly label: string
  readonly roots: readonly {
    readonly id: string
    readonly state: string | null
    readonly overflow: string | null
    readonly unsupported: string | null
    readonly flowVisibility: string
    readonly images: readonly RevealRect[]
    readonly captions: readonly {
      readonly id: string
      readonly tagName: string
      readonly text: string
      readonly managed: boolean
      readonly role: string | null
      readonly position: string
      readonly blockOffset: string
      readonly insetBlockStart: string
      readonly rect: RevealRect
    }[]
  }[]
}

async function installAutoImageRevealProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __autoImageRevealProbe?: {
        writes: string[]
        samples: unknown[]
        originalSetProperty: typeof CSSStyleDeclaration.prototype.setProperty
        capture(label: string): unknown
      }
    }
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty
    const probe = {
      writes: [] as string[],
      samples: [] as unknown[],
      originalSetProperty,
      capture(label: string) {
        const roots = [...document.querySelectorAll<HTMLElement>('.auto-image-reveal-harness .auto-image')]
        const snapshot = {
          label,
          roots: roots.map((root) => {
            const rect = (element: Element) => {
              const target = element as HTMLElement
              return {
                x: target.offsetLeft,
                y: target.offsetTop,
                width: target.offsetWidth,
                height: target.offsetHeight,
              }
            }
            return {
              id: root.dataset.testid ?? '',
              state: root.getAttribute('data-auto-image-state'),
              overflow: root.getAttribute('data-auto-image-overflow-reason'),
              unsupported: root.getAttribute('data-auto-image-unsupported-reason'),
              ...(() => {
                const flow = root.querySelector<HTMLElement>('.auto-image__flow')!
                const style = getComputedStyle(flow)
                return {
                  flowVisibility: style.visibility,
                }
              })(),
              images: [...root.querySelectorAll('img')].map(rect),
              captions: [...root.querySelectorAll<HTMLElement>('[data-auto-image-reveal-caption-id]')]
                .map((caption) => {
                  const style = getComputedStyle(caption)
                  const captionRect = rect(caption)
                  return {
                    id: caption.dataset.autoImageRevealCaptionId ?? '',
                    tagName: caption.tagName,
                    text: caption.textContent?.trim() ?? '',
                    managed: caption.classList.contains('auto-image__managed-caption'),
                    role: caption.getAttribute('data-auto-image-managed-role'),
                    position: style.position,
                    blockOffset: caption.style.getPropertyValue('--slidev-auto-image-caption-block-offset'),
                    insetBlockStart: style.insetBlockStart,
                    rect: captionRect,
                  }
                }),
            }
          }),
        }
        probe.samples.push(snapshot)
        return snapshot
      },
    }
    target.__autoImageRevealProbe = probe
    CSSStyleDeclaration.prototype.setProperty = function (name: string, value: string, priority?: string): void {
      if (name.startsWith('--slidev-auto-image-'))
        probe.writes.push(value)
      originalSetProperty.call(this, name, value, priority)
    }
  })
}

async function cleanupAutoImageRevealProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoImageRevealProbe?: {
        originalSetProperty: typeof CSSStyleDeclaration.prototype.setProperty
      }
    }
    if (target.__autoImageRevealProbe)
      CSSStyleDeclaration.prototype.setProperty = target.__autoImageRevealProbe.originalSetProperty
    delete target.__autoImageRevealProbe
  })
}

async function waitForAutoImageRevealSettled(page: Page): Promise<void> {
  await waitForAutoImageRevealFrames(page, 2)
  await expect.poll(() => page.locator('.auto-image-reveal-harness .auto-image').evaluateAll(roots =>
    roots.length === 11 && roots.every((root) => {
      if (root.getAttribute('data-auto-image-state') !== 'fit')
        return false
      return [...root.querySelectorAll<HTMLElement>('.auto-image__managed-caption')].every((caption) => {
        const target = Number.parseFloat(caption.style.getPropertyValue('--slidev-auto-image-caption-block-offset'))
        const current = Number.parseFloat(getComputedStyle(caption).insetBlockStart)
        return Number.isFinite(target) && Number.isFinite(current) && Math.abs(target - current) <= 0.5
      })
    }),
  )).toBe(true)
}

async function captureAutoImageRevealSnapshot(page: Page, label: string): Promise<AutoImageRevealSnapshot> {
  return page.evaluate((nextLabel) => {
    const probe = (window as typeof window & {
      __autoImageRevealProbe?: { capture(label: string): unknown }
    }).__autoImageRevealProbe
    if (!probe)
      throw new Error('AutoImage reveal probe was not installed.')
    return probe.capture(nextLabel)
  }, label) as Promise<AutoImageRevealSnapshot>
}

async function resetAutoImageRevealProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const probe = (window as typeof window & {
      __autoImageRevealProbe?: { writes: string[], samples: unknown[] }
    }).__autoImageRevealProbe
    if (!probe)
      throw new Error('AutoImage reveal probe was not installed.')
    probe.writes.length = 0
    probe.samples.length = 0
  })
}

async function waitForAutoImageRevealFrames(page: Page, frames: number): Promise<void> {
  await page.evaluate((frameCount) => new Promise<void>((resolve) => {
    let remaining = frameCount
    const next = () => {
      remaining -= 1
      if (remaining === 0)
        resolve()
      else
        requestAnimationFrame(next)
    }
    requestAnimationFrame(next)
  }), frames)
}

async function readAutoImageRevealProbe(page: Page): Promise<{
  readonly snapshots: readonly AutoImageRevealSnapshot[]
  readonly writes: readonly string[]
}> {
  return page.evaluate(() => {
    const probe = (window as typeof window & {
      __autoImageRevealProbe?: { writes: string[], samples: unknown[] }
    }).__autoImageRevealProbe
    if (!probe)
      throw new Error('AutoImage reveal probe was not installed.')
    return { snapshots: [...probe.samples], writes: [...probe.writes] }
  }) as Promise<{ readonly snapshots: readonly AutoImageRevealSnapshot[], readonly writes: readonly string[] }>
}

async function captureAutoImageRevealBoundaries(
  page: Page,
  label: string,
  action: () => Promise<void>,
): Promise<{ readonly snapshots: readonly AutoImageRevealSnapshot[], readonly writes: readonly string[] }> {
  await resetAutoImageRevealProbe(page)
  await action()
  const snapshots = [await captureAutoImageRevealSnapshot(page, `${label}:immediate`)]
  let observedFrames = 0
  for (const frame of [1, 2, 4]) {
    await waitForAutoImageRevealFrames(page, frame - observedFrames)
    snapshots.push(await captureAutoImageRevealSnapshot(page, `${label}:frame-${frame}`))
    observedFrames = frame
  }
  await waitForAutoImageRevealSettled(page)
  snapshots.push(await captureAutoImageRevealSnapshot(page, `${label}:settled`))
  const { writes } = await readAutoImageRevealProbe(page)
  return { snapshots, writes }
}

async function captureAutoImageRevealDirectEntry(
  page: Page,
  label: string,
): Promise<{ readonly snapshots: readonly AutoImageRevealSnapshot[], readonly writes: readonly string[] }> {
  await page.addInitScript((nextLabel) => {
    const target = window as typeof window & {
      __autoImageRevealProbe?: {
        writes: string[]
        samples: unknown[]
        capture(label: string): unknown
      }
    }
    const begin = () => {
      const probe = target.__autoImageRevealProbe
      if (!probe || document.querySelectorAll('.auto-image-reveal-harness .auto-image').length === 0)
        return false
      probe.writes.length = 0
      probe.samples.length = 0
      probe.capture(`${nextLabel}:immediate`)
      requestAnimationFrame(() => {
        probe.capture(`${nextLabel}:frame-1`)
        requestAnimationFrame(() => {
          probe.capture(`${nextLabel}:frame-2`)
          requestAnimationFrame(() => {
            requestAnimationFrame(() => probe.capture(`${nextLabel}:frame-4`))
          })
        })
      })
      return true
    }
    if (begin())
      return
    const observer = new MutationObserver(() => {
      if (begin())
        observer.disconnect()
    })
    observer.observe(document, { childList: true, subtree: true })
  }, label)
  await page.goto(`/${AUTO_IMAGE_REVEAL_SLIDE}?clicks=${AUTO_IMAGE_REVEAL_CLICKS}`, { waitUntil: 'commit' })
  await expect(page.getByTestId('auto-image-reveal-harness')).toBeVisible()
  await waitForAutoImageRevealSettled(page)
  await expect.poll(async () => (await readAutoImageRevealProbe(page)).snapshots.length).toBe(4)
  const direct = await readAutoImageRevealProbe(page)
  expect(direct.snapshots.map(snapshot => snapshot.label)).toEqual([
    `${label}:immediate`,
    `${label}:frame-1`,
    `${label}:frame-2`,
    `${label}:frame-4`,
  ])
  const settled = await captureAutoImageRevealSnapshot(page, `${label}:settled`)
  return { snapshots: [...direct.snapshots, settled], writes: direct.writes }
}

function assertFiniteAutoImageRevealSamples(
  snapshots: readonly AutoImageRevealSnapshot[],
  baseline: AutoImageRevealSnapshot,
  writes: readonly string[],
): void {
  expect(writes.every(value => !/(?:NaN|Infinity)/.test(value))).toBe(true)
  const baselineById = new Map(baseline.roots.map(root => [root.id, root]))
  for (const snapshot of snapshots) {
    expect(snapshot.roots.map(root => root.id)).toEqual(baseline.roots.map(root => root.id))
    for (const root of snapshot.roots) {
      const baselineRoot = baselineById.get(root.id)
      expect(baselineRoot).toBeDefined()
      expect(root.captions.map(caption => [caption.id, caption.tagName, caption.text])).toEqual(
        baselineRoot!.captions.map(caption => [caption.id, caption.tagName, caption.text]),
      )
      if (root.state === 'pending') {
        expect(root.flowVisibility).toBe('hidden')
        expect(root.overflow).toBeNull()
        expect(root.unsupported).toBeNull()
        continue
      }
      for (const caption of root.captions) {
        const context = `${snapshot.label} ${root.id} ${caption.id}`
        expect(caption.managed, `${context} remains managed`).toBe(true)
        expect(caption.role, `${context} retains its managed role`).toBe('caption')
        expect(caption.position, `${context} uses absolute positioning`).toBe('absolute')
        expect(Number.isFinite(Number.parseFloat(caption.blockOffset)), `${context} has a finite block offset`).toBe(true)
        expect(Number.isFinite(Number.parseFloat(caption.insetBlockStart)), `${context} has a finite computed inset`).toBe(true)
      }
    }
  }
}

test.afterEach(async ({ page }) => {
  await cleanupAutoImageRevealProbe(page)
})

test('uses the fixed default shell and places named slots independently of source order', async ({ page }) => {
  await openSlide(page, 104, 'auto-image-left-main')
  const layout = layoutFor(page, 'auto-image-left-main')
  const stage = await box(layout.locator('.auto-image-layout__stage'))
  const imageTrack = await box(layout.locator('.auto-image-layout__image-track'))
  const autofit = await box(layout.locator(':scope > .auto-image-layout__stage > .autofit'))
  const footer = await box(layout.locator('.auto-image-layout__footer'))
  const computed = await layout.locator('.auto-image-layout__stage').evaluate((element) => {
    const htmlElement = element as HTMLElement
    const style = getComputedStyle(element)
    return {
      gap: style.getPropertyValue('--slidev-auto-image-region-gap').trim(),
      columns: style.gridTemplateColumns,
      scale: element.getBoundingClientRect().width / htmlElement.clientWidth,
    }
  })

  closeTo(imageTrack.x, stage.x)
  closeTo(imageTrack.width / stage.width * 100, 35)
  closeTo(autofit.x - (imageTrack.x + imageTrack.width), 32 * computed.scale)
  closeTo(autofit.width, stage.width - imageTrack.width - 32 * computed.scale)
  closeTo(footer.y + footer.height, stage.y + stage.height + footer.height)
  expect(computed.gap).toBe('2rem')
  expect(computed.columns).toContain('32px')

  await layout.locator('.auto-image-layout__stage').evaluate((element) => {
    element.style.setProperty('--slidev-auto-image-region-gap', '2rem')
  })
  const overriddenAuto = await box(layout.locator(':scope > .auto-image-layout__stage > .autofit'))
  closeTo(
    overriddenAuto.x - (imageTrack.x + imageTrack.width),
    32 * computed.scale,
  )
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)

  await openSlide(page, 106, 'auto-image-right-main')
  const right = layoutFor(page, 'auto-image-right-main')
  const rightStage = await box(right.locator('.auto-image-layout__stage'))
  const rightImage = await box(right.locator('.auto-image-layout__image-track'))
  const rightAuto = await box(right.locator(':scope > .auto-image-layout__stage > .autofit'))
  const rightScale = await right.locator('.auto-image-layout__stage').evaluate((element) => (
    element.getBoundingClientRect().width / (element as HTMLElement).clientWidth
  ))
  closeTo(rightImage.x + rightImage.width, rightStage.x + rightStage.width)
  closeTo(rightImage.x - (rightAuto.x + rightAuto.width), 32 * rightScale)
})

test('uses block allocation for top and bottom positions', async ({ page }) => {
  await openSlide(page, 107, 'auto-image-top')
  const top = layoutFor(page, 'auto-image-top')
  const topMain = await box(top.locator('.auto-image-layout__main'))
  const topStage = await box(top.locator('.auto-image-layout__stage'))
  const topImage = await box(top.locator('.auto-image-layout__image-track'))
  const topAuto = await box(top.locator(':scope > .auto-image-layout__stage > .autofit'))
  const topScale = await top.locator('.auto-image-layout__stage').evaluate((element) => (
    element.getBoundingClientRect().height / (element as HTMLElement).clientHeight
  ))
  closeTo(topStage.y - (topMain.y + topMain.height), 10 * topScale)
  closeTo(topImage.height / topStage.height * 100, 40)
  closeTo(topAuto.y - (topImage.y + topImage.height), 32 * topScale)

  await openSlide(page, 108, 'auto-image-bottom')
  const bottom = layoutFor(page, 'auto-image-bottom')
  const bottomMain = await box(bottom.locator('.auto-image-layout__main'))
  const bottomStage = await box(bottom.locator('.auto-image-layout__stage'))
  const bottomImage = await box(bottom.locator('.auto-image-layout__image-track'))
  const bottomAuto = await box(bottom.locator(':scope > .auto-image-layout__stage > .autofit'))
  const bottomScale = await bottom.locator('.auto-image-layout__stage').evaluate((element) => (
    element.getBoundingClientRect().height / (element as HTMLElement).clientHeight
  ))
  closeTo(bottomStage.y, bottomMain.y + bottomMain.height)
  closeTo(bottomImage.height / bottomStage.height * 100, 40)
  closeTo(bottomImage.y - (bottomAuto.y + bottomAuto.height), 32 * bottomScale)
})

test('omitted auto keeps the image edge allocation without reserving a gap', async ({ page }) => {
  await openSlide(page, 109, 'auto-image-omitted')
  const layout = layoutFor(page, 'auto-image-omitted')
  const stage = await box(layout.locator('.auto-image-layout__stage'))
  const image = await box(layout.locator('.auto-image-layout__image-track'))
  await expect(layout.locator('.autofit')).toHaveCount(0)
  await expect(layout.locator('.auto-image-layout__diagnostics')).toHaveAttribute('aria-hidden', 'true')
  closeTo(image.width / stage.width * 100, 100)
  closeTo(image.x, stage.x)
  await expect(layout).not.toHaveAttribute('data-auto-image-layout-overflow')
})

test('reacts to default, auto, and footer slot presence changes', async ({ page }) => {
  await openSlide(page, 104, 'auto-image-left-main')
  const withSlots = layoutFor(page, 'auto-image-left-main')
  await expect(withSlots.locator('.auto-image-layout__main')).toHaveText('')
  await expect(withSlots.locator('.auto-image-layout__auto-track')).toHaveCount(1)
  await expect(withSlots.locator('.auto-image-layout__footer')).toHaveCount(1)

  await openSlide(page, 109, 'auto-image-omitted')
  const withoutSlots = layoutFor(page, 'auto-image-omitted')
  await expect(withoutSlots.locator('.auto-image-layout__main')).toContainText('No auto slot')
  await expect(withoutSlots.locator('.auto-image-layout__auto-track')).toHaveCount(0)
  await expect(withoutSlots.locator('.auto-image-layout__footer')).toHaveCount(0)

  const omittedGeometry = await Promise.all([
    box(withoutSlots.locator('.auto-image-layout__stage')),
    box(withoutSlots.locator('.auto-image-layout__image-track')),
  ])
  closeTo(omittedGeometry[1].width, omittedGeometry[0].width)

  await openSlide(page, 104, 'auto-image-left-main')
  const restored = layoutFor(page, 'auto-image-left-main')
  await expect(restored.locator('.auto-image-layout__main')).toHaveText('')
  await expect(restored.locator('.auto-image-layout__auto-track')).toHaveCount(1)
  await expect(restored.locator('.auto-image-layout__footer')).toHaveCount(1)
})

test('center places AutoFit below the centered image and above the footer', async ({ page }) => {
  await openSlide(page, 105, 'auto-image-center')
  const omitted = layoutFor(page, 'auto-image-center')
  const omittedMain = await box(omitted.locator('.auto-image-layout__main'))
  const stage = await box(omitted.locator('.auto-image-layout__stage'))
  const image = await box(omitted.locator('.auto-image-layout__image-track'))
  const omittedScale = await omitted.locator('.auto-image-layout__stage').evaluate((element) => (
    element.getBoundingClientRect().height / (element as HTMLElement).clientHeight
  ))
  await expect(omitted.locator('.autofit')).toHaveCount(0)
  closeTo(stage.y - (omittedMain.y + omittedMain.height), 10 * omittedScale)
  closeTo(image.width / stage.width * 100, 50)
  closeTo(image.x - stage.x, (stage.width - image.width) / 2)
  closeTo(image.height, stage.height)

  await openSlide(page, 110, 'auto-image-center-content')
  const layout = layoutFor(page, 'auto-image-center-content')
  const centerMain = await box(layout.locator('.auto-image-layout__main'))
  const centerStage = await box(layout.locator('.auto-image-layout__stage'))
  const centerImage = await box(layout.locator('.auto-image-layout__image-track'))
  const autofit = layout.locator('.auto-image-layout__auto-track')
  const centerAuto = await box(autofit)
  const footer = await box(layout.locator('.auto-image-layout__footer'))
  const scale = await layout.locator('.auto-image-layout__stage').evaluate((element) => (
    element.getBoundingClientRect().height / (element as HTMLElement).clientHeight
  ))
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(layout).not.toHaveAttribute('data-auto-image-layout-unsupported-reason')
  closeTo(centerStage.y - (centerMain.y + centerMain.height), 10 * scale)
  closeTo(centerImage.width / centerStage.width * 100, 40)
  closeTo(centerImage.height / centerStage.height * 100, 40)
  closeTo(centerImage.x - centerStage.x, (centerStage.width - centerImage.width) / 2)
  closeTo(centerAuto.x, centerStage.x)
  closeTo(centerAuto.width, centerStage.width)
  closeTo(centerAuto.y - (centerImage.y + centerImage.height), 32 * scale)
  closeTo(centerAuto.y + centerAuto.height, footer.y)
})

test('center reports normal split and AutoFit overflow when the image consumes the stage', async ({ page }) => {
  const overflowWarnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTOFIT OVERFLOW'))
      overflowWarnings.push(message.text())
  })
  await openSlide(page, 152, 'auto-image-layout-lifecycle-content')
  const layout = layoutFor(page, 'auto-image-layout-lifecycle-content')
  await page.getByTestId('auto-image-layout-set-center').click()
  await expect(layout.locator('.autofit')).toHaveAttribute('data-autofit-state', 'fit')
  await page.getByTestId('auto-image-layout-set-auto-overflow').click()
  await expect(layout).not.toHaveAttribute('data-auto-image-layout-overflow')
  await expect(layout.locator('.autofit')).toHaveAttribute('data-autofit-state', 'overflow')
  await expect.poll(() => overflowWarnings.length).toBeGreaterThan(0)
  await page.getByTestId('auto-image-layout-set-full').click()
  await expect(layout).toHaveAttribute('data-auto-image-layout-overflow-reason', 'region-gap')
  await expect(layout.locator('.autofit')).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(layout.locator('.autofit__overflow-badge')).toHaveText('AUTOFIT OVERFLOW')
  await expect(layout).not.toHaveAttribute('data-auto-image-layout-unsupported-reason')
})

test('explicitly empty auto mounts the existing bridge and reserves the region gap', async ({ page }) => {
  await openSlide(page, 111, 'auto-image-empty')
  const layout = layoutFor(page, 'auto-image-empty')
  const autofit = layout.locator(':scope > .auto-image-layout__stage > .autofit')
  await expect(autofit).toHaveAttribute('data-autofit-empty', 'true')
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
})

test('invalid image configuration is atomic and leaves only fixed content visible', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTO IMAGE CONFIGURATION ERROR'))
      warnings.push(message.text())
  })

  await openSlide(page, 112, 'auto-image-invalid-main')
  const layout = layoutFor(page, 'auto-image-invalid-main')
  await expect(layout).toHaveClass(/auto-image-layout--config-error/)
  await expect(layout).toHaveAttribute(
    'data-auto-image-config-error',
    'unknown-property,invalid-position-value,invalid-size-syntax',
  )
  await expect(layout.locator('.auto-image-layout__config-error-badge')).toHaveText('AUTO IMAGE CONFIGURATION ERROR')
  await expect(layout.locator('.auto-image')).toHaveCount(0)
  await expect(layout.locator('.autofit')).toHaveCount(0)
  await expect(layout.getByTestId('auto-image-invalid-footer')).toBeVisible()
  await expect.poll(() => warnings.length).toBe(1)
  expect(warnings[0]).toContain('[slidev-addon-autofit]')
  expect(warnings[0]).toContain('unknown-property')
  expect(warnings[0]).toContain('invalid-position-value')
  expect(warnings[0]).toContain('invalid-size-syntax')
})

test('non-center bridge forwards raw autofit configuration unchanged', async ({ page }) => {
  await openSlide(page, 113, 'auto-image-raw-config')
  const layout = layoutFor(page, 'auto-image-raw-config')
  const autofit = layout.locator('.autofit')
  await expect(autofit).toHaveAttribute('data-autofit-requested-alignment', 'distributed')
  await expect(autofit).toHaveAttribute('data-autofit-config-error', /invalid-small-tiers/)
  await expect(autofit).toHaveAttribute('data-autofit-tier', '4')
})

test('publishes split overflow and mirrors image diagnostics through the common host', async ({ page }) => {
  await openSlide(page, 114, 'auto-image-split-overflow')
  const split = layoutFor(page, 'auto-image-split-overflow')
  await expect(split).toHaveClass(/auto-image-layout--split-overflow/)
  await expect(split).toHaveAttribute('data-auto-image-layout-overflow', 'true')
  await expect(split).toHaveAttribute('data-auto-image-layout-overflow-reason', 'region-gap')
  await expect(split.locator('.auto-image-layout__overflow-badge')).toHaveText('AUTO IMAGE LAYOUT OVERFLOW')
  await expect(split.locator('.auto-image-layout__diagnostics')).toHaveAttribute('aria-hidden', 'true')
  await expect(split.locator('.auto-image-layout__auto-track')).toHaveCSS('height', '0px')

  await openSlide(page, 115, 'auto-image-unsupported-main')
  const unsupported = layoutFor(page, 'auto-image-unsupported-main')
  const image = unsupported.locator('.auto-image')
  await expect(image).toHaveAttribute('data-auto-image-state', 'unsupported')
  await expect(image).toHaveAttribute('data-auto-image-unsupported-reason', 'missing-image')
  await expect(unsupported.locator('.auto-image-layout__image-unsupported-badge')).toHaveText('AUTO IMAGE UNSUPPORTED')
  await expect(unsupported.getByTestId('auto-image-authored-fallback')).toBeVisible()
})

test('recomputes split overflow when only the layout region gap changes', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTO IMAGE LAYOUT OVERFLOW'))
      warnings.push(message.text())
  })

  await openSlide(page, 114, 'auto-image-split-overflow')
  const layout = layoutFor(page, 'auto-image-split-overflow')
  const stage = layout.locator('.auto-image-layout__stage')
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)
  const initialWarnings = warnings.length
  const initialTracks = await Promise.all([
    box(layout.locator('.auto-image-layout__image-track')),
    box(layout.locator('.auto-image-layout__auto-track')),
  ])

  await stage.evaluate((element) => {
    element.style.setProperty('--slidev-auto-image-region-gap', '0px')
  })
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)
  await expect(layout).not.toHaveAttribute('data-auto-image-layout-overflow')
  const recoveredTracks = await Promise.all([
    box(layout.locator('.auto-image-layout__image-track')),
    box(layout.locator('.auto-image-layout__auto-track')),
  ])
  const recoveredStage = await box(stage)
  const stageScale = await stage.evaluate((element) => (
    element.getBoundingClientRect().height / (element as HTMLElement).clientHeight
  ))
  closeTo(recoveredTracks[0].height, recoveredStage.height)
  closeTo(recoveredTracks[1].height, 0)
  closeTo(
    recoveredTracks[1].y,
    recoveredTracks[0].y + recoveredTracks[0].height,
  )

  await stage.evaluate((element) => {
    element.style.setProperty('--slidev-auto-image-region-gap', '1rem')
  })
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)
  await expect.poll(() => warnings.length).toBe(initialWarnings + 1)
  const reenteredTracks = await Promise.all([
    box(layout.locator('.auto-image-layout__image-track')),
    box(layout.locator('.auto-image-layout__auto-track')),
  ])
  closeTo(reenteredTracks[0].height, recoveredStage.height)
  closeTo(reenteredTracks[1].height, 0)
  closeTo(
    reenteredTracks[1].y,
    reenteredTracks[0].y + reenteredTracks[0].height + 16 * stageScale,
  )
  expect(warnings[warnings.length - 1]).toBe(
    '[slidev-addon-autofit] AUTO IMAGE LAYOUT OVERFLOW (region-gap): image allocation plus the required region gap exceeds the remaining stage.',
  )

  await stage.evaluate((element) => {
    element.style.setProperty('--slidev-auto-image-region-gap', '2rem')
  })
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)
  expect(warnings.length).toBe(initialWarnings + 1)
})

test('crosses the split boundary on precise subpixel geometry', async ({ page }) => {
  await openSlide(page, 153, 'auto-image-subpixel-threshold')
  await waitForPageAssets(page)
  const layout = layoutFor(page, 'auto-image-subpixel-threshold')
  const stage = layout.locator('.auto-image-layout__stage')
  let previousGeometry = ''
  let geometry = { preciseRemainder: 0, quantizedRemainder: 0 }
  await expect.poll(async () => {
    await waitForAnimationFrames(page)
    geometry = await stage.evaluate((element) => {
      const stageElement = element as HTMLElement
      const image = stageElement.querySelector<HTMLElement>('.auto-image-layout__image-track')!
      const stageInlineSize = Number.parseFloat(getComputedStyle(stageElement).width)
      return {
        preciseRemainder: stageInlineSize * 0.02,
        quantizedRemainder: stageElement.clientWidth - image.clientWidth,
      }
    })
    const currentGeometry = JSON.stringify(geometry)
    const stable = currentGeometry === previousGeometry
    previousGeometry = currentGeometry
    return stable
  }).toBe(true)

  expect(geometry.preciseRemainder - geometry.quantizedRemainder).toBeGreaterThan(0.05)
  const belowBoundary = (geometry.preciseRemainder + geometry.quantizedRemainder) / 2
  await stage.evaluate((element, gap) => {
    element.style.setProperty('--slidev-auto-image-region-gap', `${gap}px`)
  }, belowBoundary)
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)

  await stage.evaluate((element, gap) => {
    element.style.setProperty('--slidev-auto-image-region-gap', `${gap}px`)
  }, geometry.preciseRemainder + 0.05)
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)
  await expect(layout.locator('.auto-image-layout__auto-track')).toHaveCSS('width', '0px')
})

test('normalizes transformed region gaps for inline and block split axes', async ({ page }) => {
  await openSlide(page, 152, 'auto-image-layout-lifecycle-content')
  const layout = layoutFor(page, 'auto-image-layout-lifecycle-content')
  const stage = layout.locator('.auto-image-layout__stage')

  await stage.evaluate((element) => {
    element.style.transform = 'scale(0.5)'
    element.style.transformOrigin = 'top left'
  })

  await page.getByTestId('auto-image-layout-set-inline-boundary').click()
  await page.getByTestId('auto-image-layout-set-left').click()
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)

  await page.getByTestId('auto-image-layout-set-right').click()
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)

  await page.getByTestId('auto-image-layout-set-block-boundary').click()
  await page.getByTestId('auto-image-layout-set-top').click()
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)

  await page.getByTestId('auto-image-layout-set-bottom').click()
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)
})

test('observes layout style, font, visibility, resize, and HMR invalidations', async ({ page }) => {
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

  await openSlide(page, 104, 'auto-image-left-main')
  const layout = layoutFor(page, 'auto-image-left-main')
  const initial = await splitMetrics(layout)
  closeTo(initial.image.width / initial.stage.width * 100, 35)
  closeTo(
    initial.auto.x - (initial.image.x + initial.image.width),
    32 * initial.scale,
  )
  closeTo(
    initial.auto.width,
    initial.stage.width - initial.image.width - 32 * initial.scale,
  )

  await page.setViewportSize({ width: 1000, height: 700 })
  await expect.poll(async () => (await splitMetrics(layout)).stage.width)
    .not.toBeCloseTo(initial.stage.width, 0)
  const resized = await splitMetrics(layout)
  closeTo(resized.image.width / resized.stage.width * 100, 35)
  closeTo(
    resized.auto.width,
    resized.stage.width - resized.image.width - 32 * resized.scale,
  )

  await page.evaluate(() => {
    const layout = document.querySelector<HTMLElement>('.auto-image-layout')!
    layout.classList.add('auto-image-layout-lifecycle-dark')

    const stylesheet = document.createElement('style')
    stylesheet.textContent = '.auto-image-layout-lifecycle-dark .auto-image-layout__stage { --slidev-auto-image-region-gap: 2rem !important; }'
    stylesheet.dataset.autoImageLifecycle = 'style'
    document.head.append(stylesheet)
    stylesheet.textContent = '.auto-image-layout-lifecycle-dark .auto-image-layout__stage { --slidev-auto-image-region-gap: 2rem !important; }'
    const stylesheetLink = document.createElement('link')
    stylesheetLink.rel = 'stylesheet'
    stylesheetLink.href = 'data:text/css,'
    stylesheetLink.dataset.autoImageLifecycle = 'link'
    document.head.append(stylesheetLink)
    stylesheetLink.dispatchEvent(new Event('load'))
  })
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __slidevAutoImageTestHooks: { invalidations: string[] } }
  ).__slidevAutoImageTestHooks.invalidations)).toContain('layout:style')
  await expect(layout.locator('.auto-image-layout__stage')).toHaveCSS(
    '--slidev-auto-image-region-gap',
    '2rem',
  )
  const styled = await splitMetrics(layout)
  closeTo(
    styled.auto.x - (styled.image.x + styled.image.width),
    32 * styled.scale,
  )
  closeTo(
    styled.auto.width,
    styled.stage.width - styled.image.width - 32 * styled.scale,
  )

  await page.evaluate(() => {
    const stylesheet = document.querySelector<HTMLStyleElement>(
      'style[data-auto-image-lifecycle="style"]',
    )!
    stylesheet.textContent = '.auto-image-layout-lifecycle-dark .auto-image-layout__stage { --slidev-auto-image-region-gap: 1rem !important; }'
  })
  await expect.poll(async () => (await splitMetrics(layout)).computedGap).toBe('1rem')

  await page.evaluate(() => {
    document.documentElement.style.fontSize = '20px'
    window.dispatchEvent(new Event('resize'))
    document.dispatchEvent(new Event('visibilitychange'))
    document.fonts.dispatchEvent(new Event('loadingdone'))
    ;(window as typeof window & {
      __slidevAutoImageTestHooks: { triggerAfterUpdate(): void; triggerFontReady(): void }
    }).__slidevAutoImageTestHooks.triggerAfterUpdate()
    ;(window as typeof window & {
      __slidevAutoImageTestHooks: { triggerAfterUpdate(): void; triggerFontReady(): void }
    }).__slidevAutoImageTestHooks.triggerFontReady()
  })
  await expect.poll(() => page.evaluate(() => (
    window as typeof window & { __slidevAutoImageTestHooks: { invalidations: string[] } }
  ).__slidevAutoImageTestHooks.invalidations)).toEqual(expect.arrayContaining([
    'layout:geometry',
    'layout:visibility',
    'layout:font',
  ]))
  const fontMetrics = await splitMetrics(layout)
  expect(fontMetrics.computedGap).toBe('1rem')
  closeTo(
    fontMetrics.auto.x - (fontMetrics.image.x + fontMetrics.image.width),
    20 * fontMetrics.scale,
  )

  await page.evaluate(() => {
    const stylesheet = document.querySelector<HTMLStyleElement>(
      'style[data-auto-image-lifecycle="style"]',
    )!
    stylesheet.sheet!.insertRule(
      '.auto-image-layout-lifecycle-dark .auto-image-layout__stage { --slidev-auto-image-region-gap: 3rem !important; }',
      stylesheet.sheet!.cssRules.length,
    )
    ;(window as typeof window & {
      __slidevAutoImageTestHooks: { triggerAfterUpdate(): void }
    }).__slidevAutoImageTestHooks.triggerAfterUpdate()
  })
  await expect.poll(async () => (await splitMetrics(layout)).computedGap).toBe('3rem')
  const hmrMetrics = await splitMetrics(layout)
  closeTo(
    hmrMetrics.auto.x - (hmrMetrics.image.x + hmrMetrics.image.width),
    60 * hmrMetrics.scale,
  )
})

test('rebinds fixed overflow and preserves same-instance layout transitions', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning')
      warnings.push(message.text())
  })

  await openSlide(page, 152, 'auto-image-layout-lifecycle-content')
  const layout = layoutFor(page, 'auto-image-layout-lifecycle-content')
  const toggleFooter = page.getByTestId('auto-image-layout-toggle-footer')
  const setRight = page.getByTestId('auto-image-layout-set-right')
  const setFull = page.getByTestId('auto-image-layout-set-full')
  const setSplit = page.getByTestId('auto-image-layout-set-split')
  const toggleAuto = page.getByTestId('auto-image-layout-toggle-auto')
  const setInvalid = page.getByTestId('auto-image-layout-set-invalid')
  const setValid = page.getByTestId('auto-image-layout-set-valid')
  const stage = layout.locator('.auto-image-layout__stage')

  await expect(layout.locator('.auto-image-layout__footer')).toHaveCount(0)
  await expect(layout).not.toHaveAttribute('data-layout-overflow')

  await toggleFooter.click()
  await expect(layout.locator('.auto-image-layout__footer')).toHaveCount(1)
  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await expect(layout.locator('.auto-image-layout__fixed-overflow-badge')).toHaveText('LAYOUT OVERFLOW')

  await toggleFooter.click()
  await expect(layout.locator('.auto-image-layout__footer')).toHaveCount(0)
  await expect(layout).not.toHaveAttribute('data-layout-overflow')

  const initial = await splitMetrics(layout)
  await setRight.click()
  await expect.poll(async () => (await splitMetrics(layout)).image.x)
    .toBeGreaterThan(initial.image.x)
  const right = await splitMetrics(layout)
  closeTo(right.image.x + right.image.width, right.stage.x + right.stage.width)

  await toggleAuto.click()
  await expect(layout.locator('.auto-image-layout__auto-track')).toHaveCount(0)
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)

  await setFull.click()
  await expect.poll(async () => (await box(layout.locator('.auto-image-layout__image-track'))).width)
    .toBeCloseTo((await box(stage)).width, 0)
  await expect(layout).not.toHaveClass(/auto-image-layout--split-overflow/)

  await toggleAuto.click()
  await expect(layout.locator('.auto-image-layout__auto-track')).toHaveCount(1)
  await stage.evaluate((element) => {
    element.style.setProperty('--slidev-auto-image-region-gap', '1000px')
  })
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)

  await toggleFooter.click()
  await expect(layout).toHaveClass(/auto-image-layout--overflow/)
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)
  await expect(layout).toHaveAttribute('data-auto-image-layout-overflow', 'true')
  await expect(layout.locator('.auto-image-layout__overflow-badge')).toHaveCSS('display', 'none')
  await toggleFooter.click()
  await expect(layout).not.toHaveClass(/auto-image-layout--overflow/)
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)
  await expect(layout.locator('.auto-image-layout__overflow-badge')).toBeVisible()

  await setInvalid.click()
  await expect(layout).toHaveClass(/auto-image-layout--config-error/)
  await expect(layout.locator('.auto-image')).toHaveCount(0)
  await expect(layout.locator('.autofit')).toHaveCount(0)
  const configWarnings = warnings.filter(message => message.includes('AUTO IMAGE CONFIGURATION ERROR'))
  expect(configWarnings).toHaveLength(1)

  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await expect.poll(() => warnings.filter(message => message.includes('AUTO IMAGE CONFIGURATION ERROR')))
    .toHaveLength(1)

  await setValid.click()
  await expect(layout).not.toHaveClass(/auto-image-layout--config-error/)
  await expect(layout).toHaveClass(/auto-image-layout--split-overflow/)
})

test('clears stale image overflow while an invalid configuration recovers through pending', async ({ page }) => {
  const pendingReleases: Array<() => void> = []
  await page.route('**/auto-image-layout-pending.svg*', async (route) => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {
      release = resolve
    })
    pendingReleases.push(release)
    await pending
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="purple"/></svg>',
    })
  })

  await openSlide(page, 152, 'auto-image-layout-lifecycle-content')
  const layout = layoutFor(page, 'auto-image-layout-lifecycle-content')
  const image = layout.locator('.auto-image')

  await page.getByTestId('auto-image-layout-set-zero').click()
  await expect(image).toHaveAttribute('data-auto-image-state', 'overflow')
  await expect(layout.locator('.auto-image-layout__image-overflow-badge')).toBeVisible()

  await page.getByTestId('auto-image-layout-set-invalid').click()
  await expect(layout).toHaveClass(/auto-image-layout--config-error/)
  await page.getByTestId('auto-image-layout-set-pending-image').click()
  await page.getByTestId('auto-image-layout-set-split').click()
  await page.getByTestId('auto-image-layout-set-valid').click()
  await expect(image).toHaveAttribute('data-auto-image-state', 'pending')
  await expect(layout.locator('.auto-image-layout__image-overflow-badge')).toHaveCount(0)
  await expect(layout.locator('.auto-image-layout__image-unsupported-badge')).toHaveCount(0)

  await expect.poll(() => pendingReleases.length).toBe(1)
  pendingReleases.shift()!()
  await expect(image).toHaveAttribute('data-auto-image-state', 'fit')

  await page.getByTestId('auto-image-layout-set-unsupported-image').click()
  await expect(image).toHaveAttribute('data-auto-image-state', 'unsupported')
  await expect(layout.locator('.auto-image-layout__image-unsupported-badge')).toBeVisible()
})

test('clears stale image unsupported state while an invalid configuration recovers through pending', async ({ page }) => {
  const pendingReleases: Array<() => void> = []
  await page.route('**/auto-image-layout-pending.svg*', async (route) => {
    let release!: () => void
    const pending = new Promise<void>(resolve => {
      release = resolve
    })
    pendingReleases.push(release)
    await pending
    await route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="purple"/></svg>',
    })
  })

  await openSlide(page, 152, 'auto-image-layout-lifecycle-content')
  const layout = layoutFor(page, 'auto-image-layout-lifecycle-content')
  const image = layout.locator('.auto-image')

  await page.getByTestId('auto-image-layout-set-unsupported-image').click()
  await expect(image).toHaveAttribute('data-auto-image-state', 'unsupported')
  await expect(layout.locator('.auto-image-layout__image-unsupported-badge')).toBeVisible()

  await page.getByTestId('auto-image-layout-set-invalid').click()
  await expect(layout).toHaveClass(/auto-image-layout--config-error/)
  await page.getByTestId('auto-image-layout-set-pending-image').click()
  await page.getByTestId('auto-image-layout-set-valid').click()
  await expect(image).toHaveAttribute('data-auto-image-state', 'pending')
  await expect(layout.locator('.auto-image-layout__image-overflow-badge')).toHaveCount(0)
  await expect(layout.locator('.auto-image-layout__image-unsupported-badge')).toHaveCount(0)

  await expect.poll(() => pendingReleases.length).toBe(1)
  pendingReleases.shift()!()
  await expect(image).toHaveAttribute('data-auto-image-state', 'fit')

  await page.getByTestId('auto-image-layout-set-zero').click()
  await expect(image).toHaveAttribute('data-auto-image-state', 'overflow')
  await expect(layout.locator('.auto-image-layout__image-overflow-badge')).toBeVisible()
})

test('fixed main/footer overflow takes visual precedence without clearing inner state', async ({ page }) => {
  const cases = [
    {
      slide: 154,
      marker: 'auto-image-fixed-config-precedence',
      innerClass: 'auto-image-layout--config-error',
      innerAttribute: ['data-auto-image-config-error', 'invalid-size-syntax'],
      badge: '.auto-image-layout__config-error-badge',
    },
    {
      slide: 155,
      marker: 'auto-image-fixed-split-precedence',
      innerClass: 'auto-image-layout--split-overflow',
      innerAttribute: ['data-auto-image-layout-overflow', 'true'],
      badge: '.auto-image-layout__overflow-badge',
    },
    {
      slide: 157,
      marker: 'auto-image-fixed-inner-precedence',
      innerClass: 'auto-image-layout--overflow',
      innerAttribute: ['data-auto-image-layout-overflow', ''],
      badge: '.auto-image-layout__image-overflow-badge',
    },
  ] as const

  for (const fixture of cases) {
    await openSlide(page, fixture.slide, fixture.marker)
    const layout = layoutFor(page, fixture.marker)
    await expect(layout).toHaveClass(/auto-image-layout--overflow/)
    await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
    await expect(layout.locator('.auto-image-layout__fixed-overflow-badge')).toBeVisible()
    await expect(layout).toHaveClass(new RegExp(fixture.innerClass))
    if (fixture.innerAttribute[1]) {
      await expect(layout).toHaveAttribute(fixture.innerAttribute[0], fixture.innerAttribute[1])
    }
    await expect(layout.locator(fixture.badge)).toHaveCSS('display', 'none')
    await expect(layout.locator('.auto-image-layout__fixed-diagnostics')).toHaveAttribute('aria-hidden', 'true')
  }

  const inner = layoutFor(page, 'auto-image-fixed-inner-precedence')
  await expect(inner.locator('.auto-image')).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'zero-inline-space',
  )
  await expect(inner.locator('.autofit')).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(inner.locator('.autofit__overflow-badge')).toHaveCSS('display', 'none')
})

test('keeps the auto-image shell equivalent to the fixed default shell', async ({ page }) => {
  await openSlide(page, 117, 'auto-image-shell-h1')
  const layout = layoutFor(page, 'auto-image-shell-h1')
  const main = await box(layout.locator('.auto-image-layout__main'))
  const stage = await box(layout.locator('.auto-image-layout__stage'))
  const footer = await box(layout.locator('.auto-image-layout__footer'))
  const edges = await layout.evaluate((element) => {
    const root = element as HTMLElement
    const rect = root.getBoundingClientRect()
    const style = getComputedStyle(root)
    const inlineScale = rect.width / root.clientWidth
    const blockScale = rect.height / root.clientHeight
    return {
      top: rect.top + Number.parseFloat(style.paddingTop) * blockScale,
      bottom: rect.bottom - Number.parseFloat(style.paddingBottom) * blockScale,
      paddingBottom: style.paddingBottom,
      overflow: style.overflow,
      rows: style.gridTemplateRows,
      columns: style.gridTemplateColumns,
      inlineScale,
    }
  })

  closeTo(main.y, edges.top)
  closeTo(main.y + main.height, stage.y)
  closeTo(stage.y + stage.height, footer.y)
  closeTo(footer.y + footer.height, edges.bottom)
  expect(edges.paddingBottom).toBe('24px')
  expect(edges.overflow).toBe('hidden')
  expect(edges.rows.split(' ').length).toBe(3)
  expect(edges.columns.split(' ').length).toBe(1)
  for (const marker of ['auto-image-shell-h1', 'auto-image-shell-h6']) {
    const styles = await page.getByTestId(marker).evaluate((element) => {
      const style = getComputedStyle(element)
      return {
        margin: Number.parseFloat(style.marginInlineStart),
        indent: Number.parseFloat(style.textIndent),
        fontSize: Number.parseFloat(style.fontSize),
      }
    })
    expect(Math.abs(styles.margin)).toBeLessThanOrEqual(0.01)
    expect(styles.indent / styles.fontSize).toBeCloseTo(-0.05, 3)
  }
})

test('matches the default shell bounds, fixed tracks, clipping, and heading offsets', async ({ page }) => {
  await openSlide(page, 149, 'auto-image-shell-equivalent-main-h1')
  const autoLayout = layoutFor(page, 'auto-image-shell-equivalent-main-h1')
  const autoShell = await shellMetrics(autoLayout, '.auto-image-layout__stage')

  await openSlide(page, 150, 'default-shell-equivalent-main-h1')
  const defaultLayout = page.locator('.slidev-layout.auto-default').filter({
    has: page.getByTestId('default-shell-equivalent-main-h1'),
  })
  const defaultShell = await shellMetrics(defaultLayout, '.autofit')

  expectRectClose(autoShell.root, defaultShell.root)
  expect(autoShell.padding).toEqual(defaultShell.padding)
  for (const key of ['left', 'top', 'right', 'bottom'] as const)
    closeTo(autoShell.content[key], defaultShell.content[key])
  expectRectClose(autoShell.main, defaultShell.main)
  expectRectClose(autoShell.remaining, defaultShell.remaining)
  expectRectClose(autoShell.footer, defaultShell.footer)
  expect(autoShell.overflow).toBe('hidden')
  expect(autoShell.overflow).toBe(defaultShell.overflow)
  expect(autoShell.remainingOverflow).toBe('hidden')
  expect(autoShell.rows.split(' ').length).toBe(3)
  expect(autoShell.rows).toBe(defaultShell.rows)
  expect(autoShell.columns).toBe(defaultShell.columns)

  for (const [autoMarker, defaultMarker] of [
    ['auto-image-shell-equivalent-main-h1', 'default-shell-equivalent-main-h1'],
    ['auto-image-shell-equivalent-main-h6', 'default-shell-equivalent-main-h6'],
    ['auto-image-shell-equivalent-footer-h1', 'default-shell-equivalent-footer-h1'],
    ['auto-image-shell-equivalent-footer-h6', 'default-shell-equivalent-footer-h6'],
  ] as const) {
    const autoHeading = await headingStyles(autoLayout.getByTestId(autoMarker))
    const defaultHeading = await headingStyles(defaultLayout.getByTestId(defaultMarker))
    closeTo(autoHeading.fontSize, defaultHeading.fontSize)
    closeTo(autoHeading.marginInlineStart, defaultHeading.marginInlineStart)
    closeTo(autoHeading.textIndent, defaultHeading.textIndent)
    expect(Math.abs(autoHeading.marginInlineStart)).toBeLessThanOrEqual(0.01)
    expect(autoHeading.textIndent / autoHeading.fontSize).toBeCloseTo(-0.05, 3)
  }
})

test('keeps fixed overflow diagnostics visible while suppressing inner diagnostics', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning')
      warnings.push(message.text())
  })

  await openSlide(page, 118, 'auto-image-fixed-overflow-main')
  const layout = layoutFor(page, 'auto-image-fixed-overflow-main')
  const fixedDiagnostics = layout.locator('.auto-image-layout__fixed-diagnostics')
  const image = layout.locator('.auto-image')
  const autofit = layout.locator('.autofit')

  await expect(layout).toHaveClass(/auto-image-layout--overflow/)
  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await expect.poll(() => layout.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe('none')
  await expect(fixedDiagnostics).toHaveAttribute('aria-hidden', 'true')
  await expect(fixedDiagnostics).toBeVisible()
  await expect(fixedDiagnostics.locator('.auto-image-layout__fixed-overflow-badge')).toHaveText('LAYOUT OVERFLOW')
  await expect(layout.locator('.auto-image-layout__stage')).toHaveCSS('overflow', 'hidden')
  await expect(image).toHaveClass(/auto-image--unsupported/)
  await expect(image).toHaveAttribute('data-auto-image-unsupported-reason', 'missing-image')
  await expect(autofit).toHaveClass(/autofit--overflow/)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(layout.locator('.auto-image-layout__image-unsupported-badge')).toHaveCSS('display', 'none')
  await expect(layout.locator('.autofit__overflow-badge')).toHaveCSS('display', 'none')
  await expect(image).toHaveCSS('box-shadow', 'none')
  await expect(autofit).toHaveCSS('box-shadow', 'none')
  await expect.poll(() => warnings.filter(message => message.includes('AUTO IMAGE UNSUPPORTED')).length).toBeGreaterThan(0)
  await expect.poll(() => warnings.filter(message => message.includes('AUTOFIT OVERFLOW')).length).toBeGreaterThan(0)
})

test('center mounts the normal AutoFit bridge for declared content', async ({ page }) => {
  for (const fixture of [
    { slide: 119, marker: 'auto-image-center-whitespace' },
    { slide: 120, marker: 'auto-image-center-comment' },
    { slide: 121, marker: 'auto-image-center-sentinel' },
    { slide: 122, marker: 'auto-image-center-component-empty' },
    { slide: 123, marker: 'auto-image-center-reveal-hidden' },
    { slide: 124, marker: 'auto-image-center-visible' },
  ] as const) {
    await openSlide(page, fixture.slide, fixture.marker)
    const layout = layoutFor(page, fixture.marker)
    const autofit = layout.locator('.auto-image-layout__auto-track')
    await expect(autofit).toHaveCount(1)
    await expect(layout).not.toHaveAttribute('data-auto-image-layout-unsupported-reason')
  }
  const invalid = layoutFor(page, 'auto-image-center-visible').locator('.autofit')
  await expect(invalid).toHaveAttribute('data-autofit-config-error', 'invalid-small-tiers')
})

test('forwards raw AutoFit configuration across every position', async ({ page }) => {
  const cases = [
    ['left', 'omitted', 'distributed', 'distributed', '4', '1.4', false, 'undefined:undefined'],
    ['right', 'default', 'distributed', 'distributed', '4', '1.4', false, '[object Object]{}'],
    ['top', 'partial', 'bottom', 'bottom', '4', '1.4', false, '[object Object]{alignment:string:bottom}'],
    ['bottom', 'custom', 'center', 'middle', '0', '1', false, '[object Object]{alignment:string:center,largeTiers:number:0,smallTiers:number:0,tierIncrement:number:10}'],
    ['left', 'invalid', 'distributed', 'distributed', '4', '1.4', true, '[object Object]{alignment:string:top,largeTiers:number:1,smallTiers:number:-1,tierIncrement:number:10}'],
    ['right', 'omitted', 'distributed', 'distributed', '4', '1.4', false, 'undefined:undefined'],
    ['top', 'default', 'distributed', 'distributed', '4', '1.4', false, '[object Object]{}'],
    ['bottom', 'partial', 'bottom', 'bottom', '4', '1.4', false, '[object Object]{alignment:string:bottom}'],
    ['left', 'custom', 'center', 'middle', '0', '1', false, '[object Object]{alignment:string:center,largeTiers:number:0,smallTiers:number:0,tierIncrement:number:10}'],
    ['right', 'invalid', 'distributed', 'distributed', '4', '1.4', true, '[object Object]{alignment:string:top,largeTiers:number:2,smallTiers:number:-1,tierIncrement:number:10}'],
    ['top', 'omitted', 'distributed', 'distributed', '4', '1.4', false, 'undefined:undefined'],
    ['bottom', 'default', 'distributed', 'distributed', '4', '1.4', false, '[object Object]{}'],
    ['left', 'partial', 'bottom', 'bottom', '4', '1.4', false, '[object Object]{alignment:string:bottom}'],
    ['right', 'custom', 'center', 'middle', '0', '1', false, '[object Object]{alignment:string:center,largeTiers:number:0,smallTiers:number:0,tierIncrement:number:10}'],
    ['top', 'invalid', 'distributed', 'distributed', '4', '1.4', true, '[object Object]{alignment:string:top,largeTiers:number:3,smallTiers:number:-1,tierIncrement:number:10}'],
    ['bottom', 'omitted', 'distributed', 'distributed', '4', '1.4', false, 'undefined:undefined'],
    ['left', 'default', 'distributed', 'distributed', '4', '1.4', false, '[object Object]{}'],
    ['right', 'partial', 'bottom', 'bottom', '4', '1.4', false, '[object Object]{alignment:string:bottom}'],
    ['top', 'custom', 'center', 'middle', '0', '1', false, '[object Object]{alignment:string:center,largeTiers:number:0,smallTiers:number:0,tierIncrement:number:10}'],
    ['bottom', 'invalid', 'distributed', 'distributed', '4', '1.4', true, '[object Object]{alignment:string:top,largeTiers:number:5,smallTiers:number:-1,tierIncrement:number:10}'],
    ['center', 'custom', 'center', 'middle', '0', '1', false, '[object Object]{alignment:string:center,largeTiers:number:0,smallTiers:number:0,tierIncrement:number:10}'],
    ['center', 'invalid', 'distributed', 'distributed', '4', '1.4', true, '[object Object]{alignment:string:top,largeTiers:number:6,smallTiers:number:-1,tierIncrement:number:10}'],
  ] as const

  await openSlide(page, AUTO_IMAGE_RAW_CONFIG_HARNESS_SLIDE, 'auto-image-layout-raw-config-harness')
  await waitForPageAssets(page)
  await waitForAutofitLifecycleIdle(page)
  const harness = page.getByTestId('auto-image-layout-raw-config-harness')

  for (const [position, configuration, requested, effective, tier, scale, invalid, rawConfiguration] of cases) {
    const warnings: string[] = []
    const onConsole = (message: { type(): string, text(): string }) => {
      if (
        message.type() === 'warning'
        && message.text().includes(`AUTOFIT CONFIGURATION ERROR (${rawConfiguration}::`)
      ) {
        warnings.push(message.text())
      }
    }
    page.on('console', onConsole)

    try {
      await harness.getByTestId(`auto-image-layout-raw-config-case-${position}-${configuration}`).click()
      const marker = harness.getByTestId('auto-image-layout-raw-config-case-marker')
      await expect(marker).toHaveAttribute('data-auto-image-layout-raw-config-case', `${position}-${configuration}`)
      const autofit = layoutFor(page, 'auto-image-layout-raw-config-case-marker').locator('.autofit')
      await expect(autofit).toHaveAttribute('data-autofit-state', /^(fit|overflow|unsupported|config-error)$/, { timeout: 15_000 })
      await waitForAutofitPublication(autofit)
      await expect(autofit).toHaveAttribute('data-autofit-requested-alignment', requested)
      await expect(autofit).toHaveAttribute('data-autofit-effective-alignment', effective)
      await expect(autofit).toHaveAttribute('data-autofit-tier', tier)
      await expect(autofit).toHaveAttribute('data-autofit-scale', scale)
      if (invalid) {
        await expect(autofit).toHaveClass(/autofit--config-error/)
        await expect(autofit).toHaveAttribute('data-autofit-config-error', 'invalid-small-tiers')
        await expect.poll(() => warnings.length).toBe(1)
        const warning = warnings[0]
        expect(warning).toMatch(
          /^\[slidev-addon-autofit\] AUTOFIT CONFIGURATION ERROR \(/,
        )
        expect(warning).toContain('AUTOFIT CONFIGURATION ERROR')
        expect(warning).toContain('invalid-small-tiers')
        expect(warning).toContain('using complete defaults.')
        expect(warning).toContain(rawConfiguration)
      }
      else {
        await expect(autofit).not.toHaveClass(/autofit--config-error/)
        await expect(autofit).not.toHaveAttribute('data-autofit-config-error')
        expect(warnings).toEqual([])
      }
    }
    finally {
      page.off('console', onConsole)
    }
  }
})

test('keeps direct AutoFit semantically empty after helper extraction', async ({ page }) => {
  await openSlide(page, 146, 'direct-autofit-empty-regression')
  const autofit = page.getByTestId('direct-autofit-empty-regression-root')
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute('data-autofit-empty', 'true')
  await expect(autofit).toHaveAttribute('data-autofit-tier', '0')
  await expect(autofit).toHaveAttribute('data-autofit-scale', '1')
})

test('keeps common-host image badges visible at zero inline and block tracks', async ({ page }) => {
  for (const fixture of [
    { slide: 147, marker: 'auto-image-zero-inline-layout', axis: 'width' },
    { slide: 148, marker: 'auto-image-zero-block-layout', axis: 'height' },
  ] as const) {
    await openSlide(page, fixture.slide, fixture.marker)
    const layout = layoutFor(page, fixture.marker)
    const imageTrack = layout.locator('.auto-image-layout__image-track')
    const imageBadge = layout.locator('.auto-image-layout__image-unsupported-badge')
    const autoBadge = layout.locator('.autofit__overflow-badge')
    const dimensions = await imageTrack.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return { width: rect.width, height: rect.height }
    })

    expect(dimensions[fixture.axis]).toBeLessThanOrEqual(EPSILON)
    await expect(imageBadge).toBeVisible()
    await expect(imageBadge).toHaveText('AUTO IMAGE UNSUPPORTED')
    await expect(autoBadge).toBeVisible()
    await expect(autoBadge).toHaveText('AUTOFIT OVERFLOW')
    const [imageBadgeBox, autoBadgeBox] = await Promise.all([
      box(imageBadge),
      box(autoBadge),
    ])
    expect(imageBadgeBox.x + imageBadgeBox.width).toBeLessThanOrEqual(autoBadgeBox.x + EPSILON)
  }
})

test('coexists with a valid zero-track image overflow and AutoFit diagnostics', async ({ page }) => {
  await openSlide(page, 151, 'auto-image-valid-overflow-main')
  const layout = layoutFor(page, 'auto-image-valid-overflow-main')
  const image = layout.locator('.auto-image')
  const imageTrack = layout.locator('.auto-image-layout__image-track')
  const diagnostics = layout.locator('.auto-image-layout__diagnostics')
  const imageBadge = layout.locator('.auto-image-layout__image-overflow-badge')
  const autofit = layout.locator('.autofit')
  const autofitBadge = autofit.locator('.autofit__overflow-badge')

  await expect(image).toHaveClass(/auto-image--overflow/)
  await expect(image).toHaveAttribute('data-auto-image-state', 'overflow')
  await expect(image).toHaveAttribute(
    'data-auto-image-overflow-reason',
    'zero-inline-space',
  )
  await expect.poll(() => image.evaluate(element => getComputedStyle(element).boxShadow))
    .not.toBe('none')
  await expect(diagnostics).toHaveAttribute('aria-hidden', 'true')
  await expect(imageBadge).toBeVisible()
  await expect(imageBadge).toHaveText('AUTO IMAGE OVERFLOW')

  const imageTrackBox = await box(imageTrack)
  expect(imageTrackBox.width).toBeLessThanOrEqual(EPSILON)
  await expect(autofit).toHaveClass(/autofit--overflow/)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(autofitBadge).toBeVisible()
  await expect(autofitBadge).toHaveText('AUTOFIT OVERFLOW')

  const [imageBadgeBox, autofitBadgeBox, diagnosticsBox] = await Promise.all([
    box(imageBadge),
    box(autofitBadge),
    box(diagnostics),
  ])
  expect(diagnosticsBox.width).toBeGreaterThan(imageTrackBox.width)
  const badgesDoNotOverlap = imageBadgeBox.x + imageBadgeBox.width <= autofitBadgeBox.x + EPSILON
    || autofitBadgeBox.x + autofitBadgeBox.width <= imageBadgeBox.x + EPSILON
  expect(badgesDoNotOverlap).toBe(true)
})

test('keeps default v-click and v-clicks AutoImage geometry finite through forward, backward, and direct entry', async ({ page }) => {
  test.setTimeout(120_000)
  await installAutoImageRevealProbe(page)
  await page.goto(`/${AUTO_IMAGE_REVEAL_SLIDE}?clicks=${AUTO_IMAGE_REVEAL_CLICKS}`)
  await expect(page.getByTestId('auto-image-reveal-harness')).toBeVisible()
  await waitForAutoImageRevealSettled(page)
  const baseline = await captureAutoImageRevealSnapshot(page, 'fully-revealed-baseline')
  expect(baseline.roots).toHaveLength(11)
  expect(baseline.roots.every(root => root.captions.length > 0)).toBe(true)

  await page.goto(`/${AUTO_IMAGE_REVEAL_SLIDE}`)
  await expect(page.getByTestId('auto-image-reveal-harness')).toBeVisible()
  await waitForAutoImageRevealSettled(page)
  for (let click = 1; click <= AUTO_IMAGE_REVEAL_CLICKS; click += 1) {
    const result = await captureAutoImageRevealBoundaries(
      page,
      `forward-${click}`,
      () => page.keyboard.press('ArrowRight'),
    )
    assertFiniteAutoImageRevealSamples(result.snapshots, baseline, result.writes)
  }
  await expect(page).toHaveURL(new RegExp(`/${AUTO_IMAGE_REVEAL_SLIDE}\\?clicks=${AUTO_IMAGE_REVEAL_CLICKS}$`))

  const following = await captureAutoImageRevealBoundaries(
    page,
    'following-slide',
    () => page.keyboard.press('ArrowRight'),
  )
  await expect(page.getByTestId('auto-image-reveal-following-slide')).toBeVisible()
  assertFiniteAutoImageRevealSamples(following.snapshots, baseline, following.writes)

  const backward = await captureAutoImageRevealBoundaries(
    page,
    'backward',
    () => page.keyboard.press('ArrowLeft'),
  )
  await expect(page.getByTestId('auto-image-reveal-harness')).toBeVisible()
  assertFiniteAutoImageRevealSamples(backward.snapshots, baseline, backward.writes)
  const backwardSettled = backward.snapshots.at(-1)!
  for (const root of backwardSettled.roots) {
    const baselineRoot = baseline.roots.find(candidate => candidate.id === root.id)!
    for (const [index, image] of root.images.entries())
      expectRectClose(image, baselineRoot.images[index]!, `backward ${root.id} image ${index}`)
    for (const [index, caption] of root.captions.entries())
      expectRectClose(caption.rect, baselineRoot.captions[index]!.rect, `backward ${root.id} caption ${caption.id}`)
  }

  const direct = await captureAutoImageRevealDirectEntry(page, 'direct-entry')
  await expect(page.getByTestId('auto-image-reveal-harness')).toBeVisible()
  assertFiniteAutoImageRevealSamples(direct.snapshots, baseline, direct.writes)
  const directSettled = direct.snapshots.at(-1)!
  for (const root of directSettled.roots) {
    const baselineRoot = baseline.roots.find(candidate => candidate.id === root.id)!
    for (const [index, image] of root.images.entries())
      expectRectClose(image, baselineRoot.images[index]!, `direct ${root.id} image ${index}`)
    for (const [index, caption] of root.captions.entries())
      expectRectClose(caption.rect, baselineRoot.captions[index]!.rect, `direct ${root.id} caption ${caption.id}`)
  }
})
