import { expect, test } from '@playwright/test'
import type { Locator } from '@playwright/test'
import {
  waitForAnimationFrames,
  waitForAutofitPublication,
  waitForNewAutofitPublication,
  waitForPageAssets,
} from './helpers/autofit-settle'

const GAP_TOLERANCE = 0.5

async function visualGapErrors(
  autofit: Locator,
) {
  return autofit.evaluate((root) => {
    const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
    const viewportRect = viewport.getBoundingClientRect()
    const blockScale = viewportRect.height
      / Number.parseFloat(getComputedStyle(viewport).height)
    const units = [...root.querySelectorAll<HTMLElement>('[data-visual-unit]')]
    const edges = units.map((unit) => {
      if (unit.dataset.visualUnit === 'atomic') {
        const rectangle = unit.getBoundingClientRect()
        return {
          leading: rectangle.top,
          trailing: rectangle.bottom,
        }
      }

      const rectangles: DOMRect[] = []
      const walker = document.createTreeWalker(unit, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if ((node as Text).data.trim() === '')
          continue
        const range = document.createRange()
        range.selectNodeContents(node)
        rectangles.push(...range.getClientRects())
      }
      return {
        leading: Math.min(...rectangles.map(rectangle => rectangle.top)),
        trailing: Math.max(...rectangles.map(rectangle => rectangle.bottom)),
      }
    })
    const scale = Number(root.getAttribute('data-autofit-scale'))
    return edges.slice(1).map((edge, index) => {
      const kind = units[index + 1]!.dataset.gapKind
      const target = 16 * scale * (kind === 'half' ? 0.5 : 1)
      const actual = (edge.leading - edges[index]!.trailing) / blockScale
      return Math.abs(actual - target)
    })
  })
}

test('republishes when font metrics move text ranges without moving element boxes', async ({ page }) => {
  await page.goto('/38')
  await expect(page.getByTestId('visual-gap-cases')).toBeVisible()
  await waitForPageAssets(page)

  const autofit = page.getByTestId('visual-positive')
  await waitForAutofitPublication(autofit)
  const previousBatchId = Number(await autofit.getAttribute('data-autofit-batch-id'))

  const boxes = await autofit.evaluate((root) => {
    const shiftedUnit = [...root.querySelectorAll<HTMLElement>('[data-visual-unit]')]
      .find(unit => unit.textContent?.trim() === 'Grouped copy')!
    const before = shiftedUnit.getBoundingClientRect().toJSON()
    const nativeGetClientRects = Range.prototype.getClientRects

    Range.prototype.getClientRects = function getClientRects(): DOMRectList {
      const rectangles = Array.from(nativeGetClientRects.call(this))
      const selected = this.commonAncestorContainer
      const parent = selected.nodeType === Node.TEXT_NODE
        ? selected.parentElement
        : null
      if (parent !== shiftedUnit)
        return rectangles as unknown as DOMRectList

      const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
      const viewportRect = viewport.getBoundingClientRect()
      const renderedPixel = viewportRect.height
        / Number.parseFloat(getComputedStyle(viewport).height)
      return rectangles.map(rectangle => new DOMRect(
        rectangle.x,
        rectangle.y + renderedPixel,
        rectangle.width,
        rectangle.height,
      )) as unknown as DOMRectList
    }

    return {
      after: shiftedUnit.getBoundingClientRect().toJSON(),
      before,
    }
  })
  expect(boxes.after).toEqual(boxes.before)

  await waitForAnimationFrames(page, 2)
  expect(Number(await autofit.getAttribute('data-autofit-batch-id')))
    .toBe(previousBatchId)

  await page.evaluate(() => {
    document.fonts.dispatchEvent(new Event('loadingdone'))
  })
  await waitForNewAutofitPublication(autofit, previousBatchId)

  for (const error of await visualGapErrors(autofit))
    expect(error).toBeLessThanOrEqual(GAP_TOLERANCE)
})
