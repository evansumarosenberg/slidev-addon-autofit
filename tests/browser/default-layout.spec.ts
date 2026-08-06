import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const EDGE_TOLERANCE = 0.75

async function gotoSlide(page: Page, slide: number, marker: string) {
  await page.goto(`/${slide}`)
  await expect(page.getByTestId(marker)).toBeVisible()
}

function activeLayout(page: Page, marker: string) {
  return page.locator('.slidev-layout.default').filter({
    has: page.getByTestId(marker),
  })
}

async function requiredBox(locator: Locator) {
  const box = await locator.boundingBox()
  expect(box).not.toBeNull()
  return box!
}

async function contentEdges(layout: Locator) {
  return layout.evaluate((element) => {
    const htmlElement = element as HTMLElement
    const rect = htmlElement.getBoundingClientRect()
    const style = getComputedStyle(htmlElement)
    const inlineScale = rect.width / htmlElement.clientWidth
    const blockScale = rect.height / htmlElement.clientHeight

    return {
      top: rect.top + Number.parseFloat(style.paddingTop) * blockScale,
      right: rect.right - Number.parseFloat(style.paddingRight) * inlineScale,
      bottom: rect.bottom - Number.parseFloat(style.paddingBottom) * blockScale,
      left: rect.left + Number.parseFloat(style.paddingLeft) * inlineScale,
    }
  })
}

function expectSameEdge(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(EDGE_TOLERANCE)
}

async function headingOpticalStyles(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element)
    return {
      fontSize: Number.parseFloat(style.fontSize),
      marginInlineStart: Number.parseFloat(style.marginInlineStart),
      textIndent: Number.parseFloat(style.textIndent),
    }
  })
}

test('preserves main-only placement and ignores inert autofit frontmatter', async ({ page }) => {
  const configWarnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTOFIT CONFIGURATION'))
      configWarnings.push(message.text())
  })

  await gotoSlide(page, 1, 'main-only')
  const layout = activeLayout(page, 'main-only')
  const edges = await contentEdges(layout)
  const main = await requiredBox(layout.locator('.default-layout__main'))
  const heading = await requiredBox(layout.locator('h1'))

  expectSameEdge(main.y, edges.top)
  expectSameEdge(heading.y, edges.top)
  await expect.poll(() => layout.evaluate(element => getComputedStyle(element)
    .getPropertyValue('--slidev-autofit-base-spacing').trim())).toBe('1rem')
  await expect(layout.locator('.autofit')).toHaveCount(0)
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
  await page.waitForTimeout(100)
  expect(configWarnings).toEqual([])
})

test('keeps ordinary h1 and h6 fixed headings inside main and footer bounds', async ({ page }) => {
  await gotoSlide(page, 19, 'fixed-main-h1')
  const layout = activeLayout(page, 'fixed-main-h1')

  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')

  for (const testId of [
    'fixed-main-h1',
    'fixed-main-h6',
    'fixed-footer-h1',
    'fixed-footer-h6',
  ]) {
    const styles = await headingOpticalStyles(page.getByTestId(testId))
    expect(Math.abs(styles.marginInlineStart)).toBeLessThanOrEqual(0.01)
    expect(styles.textIndent / styles.fontSize).toBeCloseTo(-0.05, 3)
  }
})

test('neutralizes h1 and h6 optical offsets in the layout-managed auto track', async ({ page }) => {
  await gotoSlide(page, 20, 'auto-heading-slide')
  const layout = activeLayout(page, 'auto-heading-slide')
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')

  for (const testId of ['auto-h1', 'auto-h6']) {
    const styles = await headingOpticalStyles(page.getByTestId(testId))
    expect(Math.abs(styles.marginInlineStart)).toBeLessThanOrEqual(0.01)
    expect(Math.abs(styles.textIndent)).toBeLessThanOrEqual(0.01)
  }
})

test('neutralizes AutoFit h1 and h6 offsets across managed, direct, LTR, and RTL scopes', async ({ page }) => {
  await gotoSlide(page, 47, 'heading-optical-scope')

  for (const scope of ['managed', 'direct']) {
    for (const direction of ['ltr', 'rtl']) {
      for (const heading of ['h1', 'h6']) {
        const testId = `${scope}-heading-${direction}-${heading}`
        const locator = page.getByTestId(testId)
        const styles = await headingOpticalStyles(locator)
        expect(Math.abs(styles.marginInlineStart)).toBeLessThanOrEqual(0.01)
        expect(Math.abs(styles.textIndent)).toBeLessThanOrEqual(0.01)
        await expect(locator).toHaveCSS('direction', direction)
      }
    }
  }
})

test('places named auto/footer regions by track, independent of source order', async ({ page }) => {
  for (const fixture of [
    { slide: 2, marker: 'auto-footer-order' },
    { slide: 3, marker: 'footer-auto-order' },
  ]) {
    await gotoSlide(page, fixture.slide, fixture.marker)
    const layout = activeLayout(page, fixture.marker)
    const edges = await contentEdges(layout)
    const main = await requiredBox(layout.locator('.default-layout__main'))
    const auto = await requiredBox(layout.locator('.autofit'))
    const footer = await requiredBox(layout.locator('.default-layout__footer'))

    expectSameEdge(main.y, edges.top)
    expectSameEdge(main.y + main.height, auto.y)
    expectSameEdge(auto.y + auto.height, footer.y)
    expectSameEdge(footer.y + footer.height, edges.bottom)
  }
})

test('additional main content reduces only the auto allocation', async ({ page }) => {
  await gotoSlide(page, 2, 'auto-footer-order')
  const baselineLayout = activeLayout(page, 'auto-footer-order')
  const baselineAuto = await requiredBox(baselineLayout.locator('.autofit'))
  const baselineFooter = await requiredBox(baselineLayout.locator('.default-layout__footer'))

  await gotoSlide(page, 4, 'additional-main')
  const expandedLayout = activeLayout(page, 'additional-main')
  const expandedAuto = await requiredBox(expandedLayout.locator('.autofit'))
  const expandedFooter = await requiredBox(expandedLayout.locator('.default-layout__footer'))
  const expandedEdges = await contentEdges(expandedLayout)

  expect(expandedAuto.height).toBeLessThan(baselineAuto.height - 80)
  expectSameEdge(expandedFooter.height, baselineFooter.height)
  expectSameEdge(expandedFooter.y + expandedFooter.height, expandedEdges.bottom)
})

test('bottom-anchors a footer-only slide without synthetic region gaps', async ({ page }) => {
  await gotoSlide(page, 5, 'footer-only')
  const layout = activeLayout(page, 'footer-only')
  const edges = await contentEdges(layout)
  const main = await requiredBox(layout.locator('.default-layout__main'))
  const footer = await requiredBox(layout.locator('.default-layout__footer'))

  expect(main.height).toBeLessThanOrEqual(EDGE_TOLERANCE)
  expectSameEdge(footer.y + footer.height, edges.bottom)
  await expect(layout.locator('.autofit')).toHaveCount(0)
})

test('extends auto without a footer to the padded bottom after a natural main track', async ({ page }) => {
  await gotoSlide(page, 16, 'auto-only-slide')
  const layout = activeLayout(page, 'auto-only-slide')
  const edges = await contentEdges(layout)
  const mainLocator = layout.locator('.default-layout__main')
  const main = await requiredBox(mainLocator)
  const auto = await requiredBox(layout.locator('.autofit'))
  const mainSizing = await mainLocator.evaluate((element) => {
    const htmlElement = element as HTMLElement
    const rect = htmlElement.getBoundingClientRect()
    return {
      clientHeight: htmlElement.clientHeight,
      scrollHeight: htmlElement.scrollHeight,
      blockScale: rect.height / htmlElement.clientHeight,
    }
  })

  expect(mainSizing.clientHeight).toBe(mainSizing.scrollHeight)
  expectSameEdge(main.height, mainSizing.clientHeight * mainSizing.blockScale)
  expectSameEdge(main.y, edges.top)
  expectSameEdge(main.y + main.height, auto.y)
  expectSameEdge(auto.y + auto.height, edges.bottom)
  await expect(layout.locator('.default-layout__footer')).toHaveCount(0)
})

test('commits deterministic neutral state for a semantically empty auto slot', async ({ page }) => {
  await gotoSlide(page, 6, 'empty-auto-slide')
  const autofit = activeLayout(page, 'empty-auto-slide').locator('.autofit')

  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute('data-autofit-tier', '0')
  await expect(autofit).toHaveAttribute('data-autofit-scale', '1')
  await expect(autofit).toHaveAttribute('data-autofit-requested-alignment', 'distributed')
  await expect(autofit).toHaveAttribute('data-autofit-effective-alignment', 'middle')
  await expect(autofit).toHaveAttribute('data-autofit-full-gaps', '0')
  await expect(autofit).toHaveAttribute('data-autofit-half-gaps', '0')
  await expect(autofit).toHaveAttribute('data-autofit-empty', 'true')
  await expect(autofit).not.toHaveClass(/autofit--pending/)
  await expect(autofit.locator('.autofit__viewport')).toHaveCount(1)
  await expect(autofit.locator('.autofit__flow')).toHaveCount(1)
  await expect(autofit.locator('.autofit__diagnostics')).toHaveCSS('pointer-events', 'none')
})

test('validates an invalid configuration even when the named auto is empty', async ({ page }) => {
  await gotoSlide(page, 17, 'invalid-empty-auto-slide')
  const autofit = activeLayout(page, 'invalid-empty-auto-slide').locator('.autofit')

  await expect(autofit).toHaveClass(/autofit--config-error/)
  await expect(autofit).toHaveAttribute('data-autofit-config-error', /invalid-small-tiers/)
  await expect(autofit).toHaveAttribute('data-autofit-empty', 'true')
  await expect(autofit).toHaveAttribute('data-autofit-state', 'fit')
  await expect(autofit).toHaveAttribute('data-autofit-tier', '0')
  await expect(autofit).toHaveAttribute('data-autofit-scale', '1')
  await expect(autofit).toHaveAttribute('data-autofit-requested-alignment', 'distributed')
  await expect(autofit).toHaveAttribute('data-autofit-effective-alignment', 'middle')
})

test('mounts reusable AutoFit through exactly four public props without layout-config inheritance', async ({ page }) => {
  await gotoSlide(page, 18, 'direct-autofit-slide')
  const layout = activeLayout(page, 'direct-autofit-slide')
  const direct = page.getByTestId('direct-autofit')
  const layoutManaged = layout.locator(':scope > .autofit')

  await expect(direct).toHaveAttribute('data-autofit-state', 'fit')
  await expect(direct).toHaveAttribute('data-autofit-requested-alignment', 'center')
  await expect(direct).toHaveAttribute('data-autofit-effective-alignment', 'middle')
  await expect(direct).not.toHaveClass(/autofit--config-error/)
  await expect(direct).not.toHaveAttribute('data-autofit-config-error')
  await expect(layoutManaged).toHaveClass(/autofit--config-error/)

  const declaredProps = await direct.evaluate((element) => {
    const instance = (element as HTMLElement & {
      __vueParentComponent?: { props?: Record<string, unknown> }
    }).__vueParentComponent
    return Object.keys(instance?.props ?? {}).sort()
  })
  expect(declaredProps).toEqual([
    'alignment',
    'largeTiers',
    'smallTiers',
    'tierIncrement',
  ])
})

test('normalizes valid frontmatter and completely falls back for invalid config', async ({ page }) => {
  await gotoSlide(page, 7, 'valid-config-slide')
  const valid = activeLayout(page, 'valid-config-slide').locator('.autofit')

  await expect(valid).toHaveAttribute('data-autofit-state', 'fit')
  await expect(valid).toHaveAttribute('data-autofit-requested-alignment', 'center')
  await expect(valid).toHaveAttribute('data-autofit-effective-alignment', 'middle')
  await expect(valid).not.toHaveClass(/autofit--config-error/)
  await expect(valid).not.toHaveAttribute('data-autofit-config-error')

  await gotoSlide(page, 8, 'invalid-config-a')
  const invalid = activeLayout(page, 'invalid-config-a').locator('.autofit')

  await expect(invalid).toHaveClass(/autofit--config-error/)
  await expect(invalid).toHaveAttribute('data-autofit-config-error', /invalid-large-tiers/)
  await expect(invalid).toHaveAttribute('data-autofit-requested-alignment', 'distributed')
  await expect(invalid).toHaveAttribute('data-autofit-effective-alignment', 'distributed')
  await expect(invalid).toHaveAttribute('data-autofit-tier', '4')
  await expect(invalid).toHaveAttribute('data-autofit-scale', '1.4')
})

test('warns once per distinct invalid configuration despite repeated evaluation', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('AUTOFIT CONFIGURATION'))
      warnings.push(message.text())
  })

  await gotoSlide(page, 8, 'invalid-config-a')
  await expect.poll(() => warnings.length).toBe(1)

  await page.getByTestId('invalid-config-content').evaluate((element) => {
    element.setAttribute('data-repeat-evaluation', 'one')
    element.setAttribute('data-repeat-evaluation', 'two')
  })
  await page.waitForTimeout(100)
  expect(warnings).toHaveLength(1)

  await gotoSlide(page, 11, 'invalid-config-b')
  await expect.poll(() => warnings.length).toBe(2)
  expect(warnings[0]).not.toBe(warnings[1])
})

test('detects fixed vertical and horizontal overflow with layout diagnostics', async ({ page }) => {
  for (const fixture of [
    { slide: 14, marker: 'vertical-layout-overflow' },
    { slide: 15, marker: 'horizontal-layout-overflow' },
  ]) {
    await gotoSlide(page, fixture.slide, fixture.marker)
    const layout = activeLayout(page, fixture.marker)

    await expect(layout).toHaveClass(/default-layout--overflow/)
    await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
    await expect(layout.locator('.default-layout__overflow-badge')).toHaveText('LAYOUT OVERFLOW')
    await expect(layout.locator('.default-layout__diagnostics')).toHaveCSS('pointer-events', 'none')
    await expect(layout).toHaveCSS('overflow', 'hidden')

    if (fixture.marker === 'vertical-layout-overflow') {
      const auto = await requiredBox(layout.locator('.autofit'))
      expect(auto.height).toBeLessThanOrEqual(EDGE_TOLERANCE)
    }
  }
})

test('reports each layout-overflow entry without duplicate observations', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('LAYOUT OVERFLOW'))
      warnings.push(message.text())
  })

  await gotoSlide(page, 12, 'layout-transition-slide')
  const layout = activeLayout(page, 'layout-transition-slide')
  const probe = page.getByTestId('layout-overflow-probe')
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')

  await probe.evaluate((element) => {
    (element as HTMLElement).style.height = '800px'
  })
  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await expect(layout.locator('.default-layout__overflow-badge')).toHaveText('LAYOUT OVERFLOW')
  await expect.poll(() => warnings.length).toBe(1)

  await probe.evaluate((element) => {
    element.setAttribute('data-repeat-observation', 'one')
    element.setAttribute('data-repeat-observation', 'two')
  })
  await page.waitForTimeout(100)
  expect(warnings).toHaveLength(1)

  await probe.evaluate((element) => {
    (element as HTMLElement).style.height = '1px'
  })
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
  await expect(layout.locator('.default-layout__overflow-badge')).toHaveCount(0)

  await probe.evaluate((element) => {
    (element as HTMLElement).style.height = '800px'
  })
  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await expect.poll(() => warnings.length).toBe(2)
})

test('detects leading-side and top descendant overflow transitions at 0.5px tolerance', async ({ page }) => {
  const warnings: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'warning' && message.text().includes('LAYOUT OVERFLOW'))
      warnings.push(message.text())
  })

  await gotoSlide(page, 12, 'layout-transition-slide')
  const layout = activeLayout(page, 'layout-transition-slide')
  const probe = page.getByTestId('layout-overflow-probe')
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')

  const offsets = await probe.evaluate((element) => {
    const probeElement = element as HTMLElement
    const layoutElement = probeElement.closest('.default-layout') as HTMLElement
    const layoutRect = layoutElement.getBoundingClientRect()
    const probeRect = probeElement.getBoundingClientRect()
    const style = getComputedStyle(layoutElement)
    const inlineScale = layoutRect.width / layoutElement.clientWidth
    const blockScale = layoutRect.height / layoutElement.clientHeight
    const contentLeft = layoutRect.left + Number.parseFloat(style.paddingLeft) * inlineScale
    const contentTop = layoutRect.top + Number.parseFloat(style.paddingTop) * blockScale
    return {
      inline: (probeRect.left - contentLeft) / inlineScale,
      block: (probeRect.top - contentTop) / blockScale,
    }
  })

  await probe.evaluate((element, inlineOffset) => {
    (element as HTMLElement).style.transform = `translateX(${-inlineOffset - 0.4}px)`
  }, offsets.inline)
  await page.waitForTimeout(50)
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')

  await probe.evaluate((element, inlineOffset) => {
    (element as HTMLElement).style.transform = `translateX(${-inlineOffset - 0.6}px)`
  }, offsets.inline)
  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await expect.poll(() => warnings.length).toBe(1)

  await probe.evaluate((element) => {
    (element as HTMLElement).style.transform = 'none'
  })
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')

  await probe.evaluate((element, blockOffset) => {
    (element as HTMLElement).style.transform = `translateY(${-blockOffset - 0.4}px)`
  }, offsets.block)
  await page.waitForTimeout(50)
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')

  await probe.evaluate((element, blockOffset) => {
    (element as HTMLElement).style.transform = `translateY(${-blockOffset - 0.6}px)`
  }, offsets.block)
  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
  await expect.poll(() => warnings.length).toBe(2)

  await probe.evaluate((element) => {
    (element as HTMLElement).style.transform = 'none'
  })
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
})
