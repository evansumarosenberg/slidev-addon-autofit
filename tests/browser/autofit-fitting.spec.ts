import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const EDGE_TOLERANCE = 0.75

async function gotoSlide(page: Page, slide: number, marker: string) {
  await page.goto(`/${slide}`)
  await expect(page.getByTestId(marker)).toBeVisible()
}

async function waitForStable(locator: Locator) {
  await expect(locator).toHaveAttribute('data-autofit-state', /^(fit|overflow)$/)
  await expect(locator).not.toHaveClass(/autofit--pending/)
}

async function padding(locator: Locator) {
  return locator.locator('.autofit__flow').evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      before: Number.parseFloat(style.paddingBlockStart),
      after: Number.parseFloat(style.paddingBlockEnd),
    }
  })
}

async function expectTierFourFit(locator: Locator) {
  await waitForStable(locator)
  await expect(locator).toHaveAttribute('data-autofit-state', 'fit')
  await expect(locator).toHaveAttribute('data-autofit-tier', '4')
  await expect(locator).toHaveAttribute('data-autofit-scale', '1.4')
  await expect(locator).not.toHaveClass(/autofit--overflow/)
  await expect(locator.locator('.autofit__overflow-badge')).toHaveCount(0)
}

async function excursionFromViewport(locator: Locator) {
  return locator.evaluate((element) => {
    const viewport = element.closest('.autofit')!
      .querySelector<HTMLElement>('.autofit__viewport')!
    const viewportRect = viewport.getBoundingClientRect()
    const elementRect = element.getBoundingClientRect()
    const inlineScale = viewportRect.width / viewport.clientWidth
    const blockScale = viewportRect.height / viewport.clientHeight
    return {
      blockStart: (elementRect.top - viewportRect.top) / blockScale,
      inlineStart: (elementRect.left - viewportRect.left) / inlineScale,
    }
  })
}

test('selects every authoritative default tier through real geometry', async ({ page }) => {
  await gotoSlide(page, 21, 'tier-4')

  for (const tier of [4, 3, 2, 1, 0, -1, -2, -3, -4]) {
    const autofit = page.getByTestId(`tier-${tier}`)
    await waitForStable(autofit)
    await expect(autofit).toHaveAttribute('data-autofit-tier', String(tier))
    await expect(autofit).toHaveAttribute(
      'data-autofit-scale',
      String(1 + tier * 0.1),
    )
    await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')

    const measurementCount = Number(await autofit.getAttribute('data-autofit-measure-count'))
    expect(measurementCount).toBeGreaterThan(0)
    expect(measurementCount).toBeLessThanOrEqual(4)
  }
})

test('honors custom tiers and completes zero-side searches', async ({ page }) => {
  await gotoSlide(page, 22, 'custom-tier')

  const custom = page.getByTestId('custom-tier')
  await waitForStable(custom)
  await expect(custom).toHaveAttribute('data-autofit-tier', '1')
  await expect(custom).toHaveAttribute('data-autofit-scale', '1.25')

  const zeroLarge = page.getByTestId('zero-large')
  await waitForStable(zeroLarge)
  await expect(zeroLarge).toHaveAttribute('data-autofit-tier', '0')
  await expect(zeroLarge).toHaveAttribute('data-autofit-measure-count', '1')

  const zeroSmall = page.getByTestId('zero-small')
  await waitForStable(zeroSmall)
  await expect(zeroSmall).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(zeroSmall).toHaveAttribute('data-autofit-tier', '0')
  await expect(zeroSmall).toHaveAttribute('data-autofit-scale', '1')
  await expect(zeroSmall).toHaveAttribute('data-autofit-effective-alignment', 'top')
  await expect(zeroSmall).toHaveAttribute('data-autofit-measure-count', '1')
})

test('reports vertical, unbreakable code/table, and fixed-media overflow on both axes', async ({ page }) => {
  await gotoSlide(page, 23, 'dense-overflow')
  const layout = page.locator('.auto-default-layout').filter({
    has: page.getByTestId('dense-overflow'),
  })

  for (const testId of [
    'dense-overflow',
    'code-overflow',
    'table-overflow',
    'media-overflow',
  ]) {
    const autofit = page.getByTestId(testId)
    await waitForStable(autofit)
    await expect(autofit).toHaveAttribute('data-autofit-state', 'overflow')
    await expect(autofit).toHaveAttribute('data-autofit-tier', '-4')
    await expect(autofit).toHaveAttribute('data-autofit-scale', '0.6')
    await expect(autofit).toHaveAttribute('data-autofit-effective-alignment', 'top')
    await expect(autofit).toHaveClass(/autofit--overflow/)
    await expect(autofit).toHaveCSS('overflow', 'hidden')
    await expect(autofit.locator('.autofit__overflow-badge')).toBeVisible()
    await expect(autofit.locator('.autofit__overflow-badge')).toHaveText('AUTOFIT OVERFLOW')
  }
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
  await expect(page.getByTestId('code-overflow')).not.toHaveCSS('box-shadow', 'none')

  for (const testId of ['wide-code', 'wide-table']) {
    const extent = await page.getByTestId(testId).evaluate((element) => ({
      viewportWidth: element.closest('.autofit')!
        .querySelector<HTMLElement>('.autofit__viewport')!.clientWidth,
      scrollWidth: element.scrollWidth,
    }))
    expect(extent.scrollWidth).toBeGreaterThan(extent.viewportWidth + 0.5)
  }
  await expect(page.getByTestId('fixed-media')).toHaveCSS('width', '300px')
  await expect(page.getByTestId('fixed-media')).toHaveCSS('height', '160px')
})

test('scales font size and numeric line height and applies all non-distributed alignments', async ({ page }) => {
  await gotoSlide(page, 24, 'align-top')

  for (const alignment of ['top', 'middle', 'center', 'bottom'] as const) {
    const autofit = page.getByTestId(`align-${alignment}`)
    await waitForStable(autofit)
    await expect(autofit).toHaveAttribute('data-autofit-tier', '4')
    await expect(autofit).toHaveAttribute('data-autofit-scale', '1.4')
    await expect(autofit).toHaveAttribute(
      'data-autofit-effective-alignment',
      alignment === 'center' ? 'middle' : alignment,
    )
    await expect(page.getByTestId(`align-${alignment}-copy`)).toHaveCSS('font-size', '28px')
    await expect(page.getByTestId(`align-${alignment}-copy`)).toHaveCSS('line-height', '42px')
  }

  const top = await padding(page.getByTestId('align-top'))
  const middle = await padding(page.getByTestId('align-middle'))
  const center = await padding(page.getByTestId('align-center'))
  const bottom = await padding(page.getByTestId('align-bottom'))

  expect(top.before).toBeCloseTo(0)
  expect(top.after).toBeGreaterThan(70)
  expect(middle.before).toBeCloseTo(middle.after, 5)
  expect(center.before).toBeCloseTo(center.after, 5)
  expect(center.before).toBeCloseTo(middle.before, 5)
  expect(bottom.before).toBeGreaterThan(70)
  expect(bottom.after).toBeCloseTo(0)
})

test('classifies semantic groups and keeps root/nested list gaps on their carriers', async ({ page }) => {
  await gotoSlide(page, 25, 'semantic-fit')
  const autofit = page.getByTestId('semantic-fit')
  await waitForStable(autofit)
  await page.waitForTimeout(150)

  await expect(autofit).toHaveAttribute('data-autofit-full-gaps', '7')
  await expect(autofit).toHaveAttribute('data-autofit-half-gaps', '3')

  const carrierGeometry = await autofit.evaluate((root) => {
    const viewport = root.querySelector('.autofit__viewport') as HTMLElement
    const openingCopy = root.querySelector('[data-testid="opening-copy"]') as HTMLElement
    const rootList = root.querySelector('[data-testid="root-gap-list"]') as HTMLElement
    const rootFirst = root.querySelector('[data-testid="root-first-item"]') as HTMLElement
    const nestedList = root.querySelector('[data-testid="nested-gap-list"]') as HTMLElement
    const nestedFirst = root.querySelector('[data-testid="nested-first-item"]') as HTMLElement
    const viewportRect = viewport.getBoundingClientRect()
    const blockScale = viewportRect.height / viewport.clientHeight
    function textRect(element: Element, match: string) {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node as Text).data.includes(match))
          continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const rectangles = [...range.getClientRects()]
        return {
          top: Math.min(...rectangles.map(rectangle => rectangle.top)),
          bottom: Math.max(...rectangles.map(rectangle => rectangle.bottom)),
        }
      }
      throw new Error(`missing text rectangle for ${match}`)
    }
    const copyRect = textRect(openingCopy, 'Standalone-list introduction')
    const rootFirstRect = textRect(rootFirst, 'Root point')
    const nestedFirstRect = textRect(nestedFirst, 'Nested point one')

    return {
      rootGap: Number.parseFloat(getComputedStyle(rootList).marginBlockStart),
      nestedGap: Number.parseFloat(getComputedStyle(nestedList).marginBlockStart),
      rootFirstStart: Number.parseFloat(getComputedStyle(rootFirst).marginBlockStart),
      rootFirstEnd: Number.parseFloat(getComputedStyle(rootFirst).marginBlockEnd),
      nestedFirstStart: Number.parseFloat(getComputedStyle(nestedFirst).marginBlockStart),
      nestedFirstEnd: Number.parseFloat(getComputedStyle(nestedFirst).marginBlockEnd),
      measuredRootGap: (rootFirstRect.top - copyRect.bottom) / blockScale,
      measuredNestedGap: (nestedFirstRect.top - rootFirstRect.bottom) / blockScale,
      scale: Number(root.getAttribute('data-autofit-scale')),
    }
  })

  await expect.poll(() => autofit.evaluate((root) => {
    function textEdges(testId: string, match: string) {
      const element = root.querySelector(`[data-testid="${testId}"]`)!
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!(node as Text).data.includes(match))
          continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const rectangles = [...range.getClientRects()]
        return {
          top: Math.min(...rectangles.map(rectangle => rectangle.top)),
          bottom: Math.max(...rectangles.map(rectangle => rectangle.bottom)),
        }
      }
      throw new Error(`missing text rectangle for ${match}`)
    }
    const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
    const viewportRect = viewport.getBoundingClientRect()
    const blockScale = viewportRect.height
      / Number.parseFloat(getComputedStyle(viewport).height)
    const opening = textEdges('opening-copy', 'Standalone-list introduction')
    const parent = textEdges('root-first-item', 'Root point')
    const nested = textEdges('nested-first-item', 'Nested point one')
    const scale = Number(root.getAttribute('data-autofit-scale'))
    return Math.max(
      Math.abs((parent.top - opening.bottom) / blockScale - 16 * scale),
      Math.abs((nested.top - parent.bottom) / blockScale - 8 * scale),
    )
  })).toBeLessThanOrEqual(0.5)
  expect(carrierGeometry.rootGap).not.toBeCloseTo(
    carrierGeometry.measuredRootGap,
    4,
  )
  expect(Number.isFinite(carrierGeometry.nestedGap)).toBe(true)
  expect(carrierGeometry.rootFirstStart).toBeCloseTo(0)
  expect(carrierGeometry.rootFirstEnd).toBeCloseTo(0)
  expect(carrierGeometry.nestedFirstStart).toBeCloseTo(0)
  expect(carrierGeometry.nestedFirstEnd).toBeCloseTo(0)
})

test('enters, leaves, and re-enters AutoFit overflow without duplicate warnings', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTOFIT OVERFLOW'))
      warnings.push(message.text())
  })

  await gotoSlide(page, 26, 'overflow-transition')
  const autofit = page.getByTestId('overflow-transition')
  const copy = page.getByTestId('overflow-transition-copy')
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit.locator('.autofit__overflow-badge')).toHaveCount(0)

  const overflowText = 'UNBREAKABLE_AUTOFIT_CONTENT_THAT_CANNOT_FIT'
  await copy.evaluate((element, text) => {
    element.textContent = text
  }, overflowText)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'overflow')
  await expect.poll(() => warnings.length).toBe(1)

  await copy.evaluate((element, text) => {
    element.textContent = text
  }, overflowText)
  await page.waitForTimeout(100)
  expect(warnings).toHaveLength(1)

  await copy.evaluate((element) => {
    element.textContent = 'I'
  })
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).not.toHaveClass(/autofit--overflow/)
  await expect(autofit.locator('.autofit__overflow-badge')).toHaveCount(0)

  await copy.evaluate((element, text) => {
    element.textContent = text
  }, overflowText)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'overflow')
  await expect.poll(() => warnings.length).toBe(2)
})

test('measures a genuine zero-height auto allocation and gives layout overflow visible precedence', async ({ page }) => {
  await gotoSlide(page, 14, 'vertical-layout-overflow')
  const layout = page.locator('.auto-default-layout').filter({
    has: page.getByTestId('vertical-layout-overflow'),
  })
  const autofit = layout.locator('.autofit')

  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await waitForStable(autofit)
  await expect(autofit).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(autofit).toHaveAttribute('data-autofit-tier', '-4')
  await expect(autofit).toHaveAttribute('data-autofit-effective-alignment', 'top')
  await expect(autofit.locator('.autofit__overflow-badge')).toBeHidden()
  await expect(layout.locator('.auto-default-layout__overflow-badge')).toBeVisible()

  const [autofitBoxShadow, layoutBoxShadow] = await Promise.all([
    autofit.evaluate(element => getComputedStyle(element).boxShadow),
    layout.evaluate(element => getComputedStyle(element).boxShadow),
  ])
  expect(autofitBoxShadow).toBe('none')
  expect(layoutBoxShadow).toBe('rgb(122, 0, 25) 0px 0px 0px 2px inset')

  const autoBox = await autofit.boundingBox()
  expect(autoBox).not.toBeNull()
  expect(autoBox!.height).toBeLessThanOrEqual(EDGE_TOLERANCE)
})

test('caps heading subtrees while ordinary typography uses the reported positive scale', async ({ page }) => {
  await gotoSlide(page, 46, 'heading-cap-positive')
  const autofit = page.getByTestId('heading-cap-positive')
  await waitForStable(autofit)

  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute('data-autofit-tier', '4')
  await expect(autofit).toHaveAttribute('data-autofit-scale', '1.4')
  await expect(page.getByTestId('heading-cap-heading')).toHaveCSS('font-size', '30px')
  await expect(page.getByTestId('heading-cap-heading')).toHaveCSS('line-height', '36px')
  await expect(page.getByTestId('heading-cap-inline')).toHaveCSS('font-size', '12px')
  await expect(page.getByTestId('heading-cap-inline')).toHaveCSS('line-height', '18px')
  await expect(page.getByTestId('heading-cap-body')).toHaveCSS('font-size', '28px')
  await expect(page.getByTestId('heading-cap-body')).toHaveCSS('line-height', '42px')
})

test('fits direct, formatted, and reveal-wrapped h1 and h6 at the largest tier', async ({ page }) => {
  await gotoSlide(page, 48, 'formatted-heading-matrix')

  for (const heading of ['h1', 'h6']) {
    for (const formatting of [
      'direct',
      'strong',
      'link',
      'code',
      'span',
      'reveal',
      'inline-block',
    ]) {
      await expectTierFourFit(page.getByTestId(`formatted-${heading}-${formatting}`))
    }
  }

  for (const heading of ['h1', 'h6']) {
    for (const formatting of ['strong', 'link', 'code', 'span', 'reveal']) {
      await expect(page.getByTestId(`formatted-${heading}-${formatting}-inline`))
        .toHaveCSS('display', 'inline')
      await expect(page.getByTestId(`formatted-${heading}-${formatting}-inline`))
        .toHaveCSS('position', 'static')
    }
    await expect(page.getByTestId(`formatted-${heading}-inline-block-box`))
      .toHaveCSS('display', 'inline-block')
  }

  const formattedExcursion = await excursionFromViewport(
    page.getByTestId('formatted-h1-strong-inline'),
  )
  expect(formattedExcursion.blockStart).toBeLessThan(-0.5)
  await expectTierFourFit(page.getByTestId('formatted-h1-strong'))
})

test('preserves authored heading geometry and detects geometry-bearing controls', async ({ page }) => {
  await gotoSlide(page, 49, 'authored-heading-geometry')

  for (const testId of [
    'authored-heading-margin',
    'nested-negative-margin',
    'negative-indent-independent',
    'positioned-heading-control',
    'transformed-heading-control',
    'oversized-heading-control',
  ]) {
    const autofit = page.getByTestId(testId)
    await waitForStable(autofit)
    await expect(autofit).toHaveAttribute('data-autofit-state', 'overflow')
    await expect(autofit).toHaveAttribute('data-autofit-tier', '-4')
    await expect(autofit).toHaveClass(/autofit--overflow/)
  }

  await expect(page.getByTestId('authored-heading-margin-root'))
    .toHaveCSS('margin-inline-start', '-220px')
  await expect(page.getByTestId('nested-negative-margin-inline'))
    .toHaveCSS('margin-left', '-220px')
  await expect(page.getByTestId('positioned-heading-control-inline'))
    .toHaveCSS('position', 'relative')
  await expect(page.getByTestId('transformed-heading-control-inline'))
    .not.toHaveCSS('transform', 'none')
  await expect(page.getByTestId('oversized-heading-control-box'))
    .toHaveCSS('width', '400px')

  for (const testId of ['negative-indent-direct', 'negative-indent-inline'])
    await expectTierFourFit(page.getByTestId(testId))

  for (const testId of [
    'negative-indent-direct-heading',
    'negative-indent-inline-heading',
  ]) {
    await expect(page.getByTestId(testId)).toHaveCSS('text-indent', '-80px')
  }

  const transparentIndentExcursion = await excursionFromViewport(
    page.getByTestId('negative-indent-inline-span'),
  )
  expect(transparentIndentExcursion.inlineStart).toBeLessThan(-0.5)

  const independentIndentExcursion = await excursionFromViewport(
    page.getByTestId('negative-indent-independent-box'),
  )
  expect(independentIndentExcursion.inlineStart).toBeLessThan(-0.5)
  await expect(page.getByTestId('negative-indent-independent'))
    .toHaveAttribute('data-autofit-state', 'overflow')
})
