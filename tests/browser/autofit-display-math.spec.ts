import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { waitForAutofitPublication, waitForNewAutofitPublication, waitForPageAssets } from './helpers/autofit-settle'

async function mathSlide(page: Page, marker: string) {
  await page.goto('/1')
  const slide = await page.getByTestId(marker).evaluate(element =>
    element.closest('[data-slidev-no]')!.getAttribute('data-slidev-no'))
  await page.goto(`/${slide}`)
  await waitForPageAssets(page)
  return page.locator('.slidev-layout').filter({ has: page.getByTestId(marker) })
}

async function visualGaps(root: Locator) {
  return root.evaluate(element => {
    const viewport = element.querySelector('.autofit__viewport')!
    const scale = viewport.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(viewport).height)
    const flow = element.querySelector('.autofit__flow')!
    const bounds = [...flow.children].map(child => {
      const math = child.querySelector('.katex-html')
      if (math)
        return math.getBoundingClientRect()
      const range = document.createRange()
      range.selectNodeContents(child)
      return range.getBoundingClientRect()
    })
    return bounds.slice(1).map((box, index) => (box.top - bounds[index].bottom) / scale)
  })
}

for (const marker of ['math-middle', 'math-last', 'math-image', 'math-columns']) {
  test(`${marker}: publishes visible display math with distributed spacing`, async ({ page }) => {
    const layout = await mathSlide(page, marker)
    await expect(layout.locator('.autofit')).toHaveCount(marker === 'math-columns' ? 2 : 1)
    for (const root of await layout.locator('.autofit').all()) {
      await waitForAutofitPublication(root)
      await expect(root).toHaveAttribute('data-autofit-state', 'fit')
      await expect(root).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
      await expect(root.locator('.katex-display')).toBeVisible()
      const gaps = await visualGaps(root)
      if (gaps.length > 1)
        expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(0.75)
      const centering = await root.locator('.katex-html').evaluate(element => {
        const boxes = [...element.children].map(child => child.getBoundingClientRect())
        const outer = element.getBoundingClientRect()
        return Math.abs((Math.min(...boxes.map(b => b.left)) + Math.max(...boxes.map(b => b.right))) / 2 - (outer.left + outer.right) / 2)
      })
      expect(centering).toBeLessThan(1)
    }
  })
}

test('complex math retains KaTeX internals and real bounds', async ({ page }) => {
  const layout = await mathSlide(page, 'math-complex')
  const root = layout.locator('.autofit')
  await waitForAutofitPublication(root)
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  await expect(root).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  expect(await root.locator('.katex-display *').evaluateAll(elements => elements.some(element => {
    const style = (element as HTMLElement).style
    return style.getPropertyPriority('font-size') === 'important'
      || style.getPropertyPriority('line-height') === 'important'
  }))).toBe(false)
  await expect(root.locator('.katex-mathml')).toHaveCount(2)
  const gaps = await visualGaps(root)
  expect(Math.abs(gaps[0] - gaps[1])).toBeLessThan(0.75)
})

test('inline paragraphs and bullets are unchanged when display math is added', async ({ page }) => {
  async function inlineMetrics(marker: string) {
    const layout = await mathSlide(page, marker)
    await waitForAutofitPublication(layout.locator('.autofit'))
    return layout.locator('.autofit__flow > p, .autofit__flow > ul').evaluateAll(elements =>
      elements.flatMap(element => [element, ...element.querySelectorAll('*')]).map(element => {
        const style = getComputedStyle(element)
        return { tag: element.tagName, fontSize: style.fontSize, lineHeight: style.lineHeight,
          width: element.getBoundingClientRect().width, height: element.getBoundingClientRect().height }
      }))
  }
  expect(await inlineMetrics('math-inline-mixed')).toEqual(await inlineMetrics('math-inline-baseline'))
})

test('math settles after font events, resize, inner replacement and navigation', async ({ page }) => {
  const layout = await mathSlide(page, 'math-last')
  const root = layout.locator('.autofit')
  await waitForAutofitPublication(root)
  const batch = Number(await root.getAttribute('data-autofit-batch-id'))
  await root.locator('.katex-html').evaluate(element => element.replaceWith(element.cloneNode(true)))
  await waitForNewAutofitPublication(root, batch)
  await page.evaluate(() => document.fonts.dispatchEvent(new Event('loadingdone')))
  await waitForAutofitPublication(root)
  await page.setViewportSize({ width: 1000, height: 700 })
  await waitForAutofitPublication(root)
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  const again = await mathSlide(page, 'math-last')
  await waitForAutofitPublication(again.locator('.autofit'))
  await expect(again.locator('.autofit')).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
})

test('reveals reserve equation space and keep distribution stable', async ({ page }) => {
  const layout = await mathSlide(page, 'math-reveal')
  const root = layout.locator('.autofit')
  await waitForAutofitPublication(root)
  const gaps = await visualGaps(root)
  const tier = await root.getAttribute('data-autofit-tier')
  await expect(root.locator('.slidev-katex-wrapper')).toHaveClass(/slidev-vclick-hidden/)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(root.locator('.slidev-katex-wrapper')).not.toHaveClass(/slidev-vclick-hidden/)
  await waitForAutofitPublication(root)
  await expect(root).toHaveAttribute('data-autofit-tier', tier!)
  expect(await visualGaps(root)).toEqual(gaps)
})

test('genuinely wide math still reports overflow', async ({ page }) => {
  const layout = await mathSlide(page, 'math-wide')
  const root = layout.locator('.autofit')
  await waitForAutofitPublication(root)
  await expect(root).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(root.locator('.katex-display')).toBeVisible()
})

for (const marker of ['math-inline-radical', 'math-inline-radical-mixed', 'math-inline-radical-wrapped']) {
  test(`${marker}: ignores clipped inline construction paths and preserves paragraph fitting`, async ({ page }) => {
    const layout = await mathSlide(page, marker)
    for (const root of await layout.locator('.autofit').all()) {
      await waitForAutofitPublication(root)
      await expect(root).toHaveAttribute('data-autofit-state', 'fit')
      await expect(root).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
      await expect(root.locator('.autofit__overflow-badge')).toHaveCount(0)
      const metrics = await root.evaluate(element => {
        const viewport = element.querySelector('.autofit__viewport')!
        const bounds = viewport.getBoundingClientRect()
        const scale = bounds.width / Number.parseFloat(getComputedStyle(viewport).width)
        const inline = [...element.querySelectorAll('.katex')].filter(math => !math.closest('.katex-display'))
        return {
          hasClippedOversizedPath: inline.some(math => [...math.querySelectorAll('svg path')]
            .some(path => path.getBoundingClientRect().right > bounds.right + scale)),
          visualFits: inline.every(math => [...math.querySelector('.katex-html')!.children].every(line => {
            const rect = line.getBoundingClientRect()
            return rect.left >= bounds.left - scale * 0.5 && rect.right <= bounds.right + scale * 0.5
              && rect.top >= bounds.top - scale * 0.5 && rect.bottom <= bounds.bottom + scale * 0.5
          })),
        }
      })
      expect(metrics).toEqual({ hasClippedOversizedPath: true, visualFits: true })
      if (marker.endsWith('wrapped')) {
        expect(await root.locator('.autofit__flow > p').first().evaluate(element =>
          element.getBoundingClientRect().height / Number.parseFloat(getComputedStyle(element).lineHeight)))
          .toBeGreaterThan(2)
      }
    }
  })
}

test('inline formula replacement and resize retain correct fitting', async ({ page }) => {
  const layout = await mathSlide(page, 'math-inline-radical')
  const root = layout.locator('.autofit')
  await waitForAutofitPublication(root)
  const batch = Number(await root.getAttribute('data-autofit-batch-id'))
  await root.locator('.katex-html').first().evaluate(element => element.replaceWith(element.cloneNode(true)))
  await waitForNewAutofitPublication(root, batch)
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  await page.setViewportSize({ width: 1000, height: 700 })
  await waitForAutofitPublication(root)
  await expect(root).toHaveAttribute('data-autofit-state', 'fit')
  await expect(root).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
})

test('genuinely wide inline radicals still report overflow', async ({ page }) => {
  const layout = await mathSlide(page, 'math-inline-radical-wide')
  const root = layout.locator('.autofit')
  await waitForAutofitPublication(root)
  await expect(root).toHaveAttribute('data-autofit-state', 'overflow')
  expect(await root.evaluate(element => {
    const viewport = element.querySelector('.autofit__viewport')!.getBoundingClientRect()
    return [...element.querySelectorAll('.katex-html > *')]
      .some(line => line.getBoundingClientRect().right > viewport.right + 1)
  })).toBe(true)
})

test('direct AutoFit retains its existing typography path', async ({ page }) => {
  const layout = await mathSlide(page, 'math-direct')
  const root = layout.locator('.autofit')
  await waitForAutofitPublication(root)
  expect(await root.locator('.katex').evaluate(element =>
    (element as HTMLElement).style.getPropertyPriority('font-size'))).toBe('important')
  expect(await root.locator('.katex-display').evaluate(element =>
    (element as HTMLElement).style.getPropertyPriority('margin-block-start'))).toBe('')
})

for (const marker of ['math-column-overflow', 'text-column-spacing']) {
  test(`${marker}: uses tighter spacing when the smaller-tier column gaps overflow its sibling`, async ({ page }) => {
    const warnings: string[] = []
    page.on('console', message => {
      if (message.type() === 'warning')
        warnings.push(message.text())
    })
    const layout = await mathSlide(page, marker)
    const left = layout.locator('[data-autofit-role="left"]')
    const right = layout.locator('[data-autofit-role="right"]')
    await waitForAutofitPublication(left)
    await waitForAutofitPublication(right)
    await expect(left).toHaveAttribute('data-autofit-state', 'fit')
    await expect(right).toHaveAttribute('data-autofit-state', 'fit')
    expect(await left.getAttribute('data-autofit-tier')).toBe(await right.getAttribute('data-autofit-tier'))
    expect(Number(await right.getAttribute('data-autofit-private-tier')))
      .toBeLessThan(Number(await left.getAttribute('data-autofit-private-tier')))
    expect(await left.getAttribute('data-autofit-tier')).toBe(await right.getAttribute('data-autofit-private-tier'))
    expect(await left.evaluate(element => {
      const viewport = element.querySelector('.autofit__viewport')!.getBoundingClientRect()
      const flow = element.querySelector('.autofit__flow')!.getBoundingClientRect()
      return flow.bottom > viewport.bottom + 0.5
    })).toBe(false)
    const leftGaps = await visualGaps(left)
    const rightGaps = await visualGaps(right)
    for (const gap of [...leftGaps, ...rightGaps])
      expect(Math.abs(gap - leftGaps[0])).toBeLessThan(0.75)
    const firstLine = (root: Locator) => root.locator('.autofit__flow > p').first().evaluate(element => {
      const range = document.createRange()
      range.selectNodeContents(element)
      return range.getBoundingClientRect().top
    })
    expect(Math.abs(await firstLine(left) - await firstLine(right))).toBeLessThan(0.75)
    expect(warnings.filter(warning => warning.includes('AUTOFIT OVERFLOW'))).toEqual([])
  })
}

for (const failure of ['overflow', 'unsupported-anchor'] as const) {
  test(`retains the original overflow presentation after tighter candidate ${failure}`, async ({ page }) => {
    await page.addInitScript((failure) => {
      Object.assign(window, {
        __spacingAttempts: [] as (string | null)[],
        __slidevAutofitTestHooks: {
          forceCoordinatedTargetOverflow: () => failure === 'overflow',
          forceCoordinatedCandidateAnchorUnsupportedReason(viewport: HTMLElement) {
            return failure === 'unsupported-anchor'
              && viewport.closest('.autofit')?.getAttribute('data-autofit-role') === 'left'
              ? 'visual-edge-nonfinite'
              : null
          },
          afterCoordinatedGapPlanApplied(viewport: HTMLElement) {
            if (!viewport.closest('.slidev-layout')?.querySelector('[data-testid="math-column-overflow"]'))
              return
            ;(window as typeof window & { __spacingAttempts: (string | null)[] })
              .__spacingAttempts.push(viewport.closest('.autofit')!.getAttribute('data-autofit-role'))
          },
        },
      })
    }, failure)
    const layout = await mathSlide(page, 'math-column-overflow')
    const left = layout.locator('[data-autofit-role="left"]')
    const right = layout.locator('[data-autofit-role="right"]')
    await waitForAutofitPublication(left)
    await waitForAutofitPublication(right)
    await expect(left).toHaveAttribute('data-autofit-state', 'overflow')
    await expect(right).toHaveAttribute('data-autofit-state', 'fit')
    const attempts = await page.evaluate(() =>
      (window as typeof window & { __spacingAttempts: (string | null)[] }).__spacingAttempts)
    expect(attempts)
      .toEqual(failure === 'overflow' ? ['left', 'right'] : ['left'])
    const leftGaps = await visualGaps(left)
    const rightGaps = await visualGaps(right)
    for (const gap of leftGaps)
      expect(Math.abs(gap - rightGaps[0])).toBeLessThan(0.75)
  })
}

for (const [marker, alignment] of [['math-top', 'top'], ['math-center', 'middle'], ['math-bottom', 'bottom']]) {
  test(`display blocks preserve ${alignment} alignment`, async ({ page }) => {
    const layout = await mathSlide(page, marker)
    const root = layout.locator('.autofit')
    await waitForAutofitPublication(root)
    await expect(root).toHaveAttribute('data-autofit-state', 'fit')
    await expect(root).toHaveAttribute('data-autofit-effective-alignment', alignment)
    const padding = await root.locator('.autofit__flow').evaluate(element => {
      const style = getComputedStyle(element)
      return [Number.parseFloat(style.paddingBlockStart), Number.parseFloat(style.paddingBlockEnd)]
    })
    if (alignment === 'top')
      expect(padding[0]).toBe(0)
    else if (alignment === 'bottom')
      expect(padding[1]).toBe(0)
    else
      expect(Math.abs(padding[0] - padding[1])).toBeLessThan(0.5)
  })
}
