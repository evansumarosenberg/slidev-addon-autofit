import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import {
  waitForAutofitPublication,
  waitForPageAssets,
} from './helpers/autofit-settle'

const TOLERANCE = 0.5

async function gotoSlide(page: Page, slide: number, marker: string) {
  await page.goto(`/${slide}`)
  await expect(page.getByTestId(marker)).toBeVisible()
  await waitForPageAssets(page)
}

async function waitForStable(locator: Locator) {
  await waitForAutofitPublication(locator)
}

async function readVisualBoundaries(locator: Locator) {
  return locator.evaluate((root) => {
    const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
    const viewportRect = viewport.getBoundingClientRect()
    const blockScale = viewportRect.height / Number.parseFloat(getComputedStyle(viewport).height)
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
        if (
          (node.parentElement?.closest('[data-visual-unit]') ?? null) !== unit
        ) {
          continue
        }
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
        throw new Error(`independent test measurement found no owned rectangles`)
      return {
        leading: Math.min(...rectangles.map(rectangle =>
          (rectangle.top - viewportRect.top) / blockScale)),
        trailing: Math.max(...rectangles.map(rectangle =>
          (rectangle.bottom - viewportRect.top) / blockScale)),
      }
    })
    const kinds = units.slice(1).map(unit => unit.dataset.gapKind!)
    const margins = units.slice(1).map(unit =>
      Number.parseFloat(getComputedStyle(unit).marginBlockStart))
    return {
      gaps: edges.slice(1).map((edge, index) =>
        edge.leading - edges[index].trailing),
      kinds,
      margins,
      scale: Number(root.getAttribute('data-autofit-scale')),
    }
  })
}

test('realizes full and half visual whitespace at neutral, positive, and negative tiers', async ({ page }) => {
  await gotoSlide(page, 38, 'visual-gap-cases')

  for (const id of [
    'visual-neutral',
    'visual-positive',
    'visual-negative',
    'visual-nested',
    'visual-mixed',
  ]) {
    const autofit = page.getByTestId(id)
    await waitForStable(autofit)
    const measurement = await readVisualBoundaries(autofit)
    measurement.gaps.forEach((gap, index) => {
      const target = 16 * measurement.scale
        * (measurement.kinds[index] === 'half' ? 0.5 : 1)
      expect(
        Math.abs(gap - target),
        `${id} boundary ${index}: ${JSON.stringify(measurement)}`,
      ).toBeLessThanOrEqual(TOLERANCE)
    })
  }
})

test('measures nested ownership, inline media, media-only wrappers, and atomic directions independently', async ({ page }) => {
  await gotoSlide(page, 38, 'visual-gap-cases')

  const nested = await readVisualBoundaries(page.getByTestId('visual-nested'))
  expect(nested.kinds).toEqual(['full', 'half', 'half', 'full'])
  expect(nested.gaps).toHaveLength(4)

  const mixed = await readVisualBoundaries(page.getByTestId('visual-mixed'))
  expect(mixed.kinds).toEqual(['full', 'full', 'full', 'full', 'full'])
  expect(mixed.gaps).toHaveLength(5)
  expect(mixed.gaps.every(Number.isFinite)).toBe(true)

  const ownershipEdges = await page.getByTestId('visual-mixed').evaluate((root) => {
    const mixedUnit = root.querySelector<HTMLElement>('[data-visual-unit="text"]')!
    const inlineImage = mixedUnit.querySelector<HTMLImageElement>('img')!
    const textRectangles: DOMRect[] = []
    const walker = document.createTreeWalker(mixedUnit, NodeFilter.SHOW_TEXT)
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((node as Text).data.trim() === '')
        continue
      const range = document.createRange()
      range.selectNodeContents(node)
      textRectangles.push(...range.getClientRects())
    }
    const imageRectangle = inlineImage.getBoundingClientRect()
    const textLeading = Math.min(...textRectangles.map(rectangle => rectangle.top))
    const textTrailing = Math.max(...textRectangles.map(rectangle => rectangle.bottom))
    const transparent = root.querySelector<HTMLElement>(
      '[data-testid="visual-transparent-atomic"]',
    )!
    const transparentStyle = getComputedStyle(transparent)
    return {
      imageControlsLeading: imageRectangle.top < textLeading,
      imageControlsTrailing: imageRectangle.bottom > textTrailing,
      imageLeading: imageRectangle.top,
      imageTrailing: imageRectangle.bottom,
      textLeading,
      textTrailing,
      transparentPadding: Number.parseFloat(transparentStyle.paddingBlockStart),
      transparentBackground: transparentStyle.backgroundColor,
      boxedBorder: Number.parseFloat(getComputedStyle(
        root.querySelector<HTMLElement>('[data-testid="visual-boxed-atomic"]')!,
      ).borderBlockStartWidth),
    }
  })
  expect(
    ownershipEdges.imageControlsLeading || ownershipEdges.imageControlsTrailing,
    JSON.stringify(ownershipEdges),
  ).toBe(true)
  expect(ownershipEdges.transparentPadding).toBeGreaterThan(0)
  expect(ownershipEdges.transparentBackground).toBe('rgba(0, 0, 0, 0)')
  expect(ownershipEdges.boxedBorder).toBeGreaterThan(0)
})

test('allows negative and unequal same-kind carriers while verified gaps stay positive', async ({ page }) => {
  await gotoSlide(page, 38, 'visual-gap-cases')
  const measured = await readVisualBoundaries(page.getByTestId('visual-neutral'))

  expect(measured.gaps.every(gap => gap > 0)).toBe(true)
  expect(measured.margins.some(margin => margin < 0)).toBe(true)
  const fullMargins = measured.margins.filter((_, index) =>
    measured.kinds[index] === 'full')
  expect(new Set(fullMargins.map(value => value.toFixed(3))).size).toBeGreaterThan(1)
})
