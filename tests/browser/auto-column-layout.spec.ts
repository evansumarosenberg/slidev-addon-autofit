import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const TOLERANCE = 0.75

async function slide(page: Page, number: number, marker: string): Promise<Locator> {
  await page.goto(`/${number}`)
  const visibleMarker = page.locator(`[data-testid="${marker}"]:visible`)
  await expect(visibleMarker).toBeVisible()
  return page.locator('.slidev-layout.auto-column.auto-column-layout').filter({
    has: visibleMarker,
  })
}

async function autoDefaultSlide(page: Page, number: number, marker: string): Promise<Locator> {
  await page.goto(`/${number}`)
  const visibleMarker = page.locator(`[data-testid="${marker}"]:visible`)
  await expect(visibleMarker).toBeVisible()
  return page.locator('.slidev-layout.default.default-layout').filter({
    has: visibleMarker,
  })
}

async function box(locator: Locator) {
  const value = await locator.boundingBox()
  expect(value).not.toBeNull()
  return value!
}

async function contentEdges(layout: Locator) {
  return layout.evaluate((element) => {
    const root = element as HTMLElement
    const rectangle = root.getBoundingClientRect()
    const style = getComputedStyle(root)
    const inlineScale = rectangle.width / root.clientWidth
    const blockScale = rectangle.height / root.clientHeight
    return {
      top: rectangle.top + Number.parseFloat(style.paddingTop) * blockScale,
      bottom: rectangle.bottom - Number.parseFloat(style.paddingBottom) * blockScale,
      inlineScale,
    }
  })
}

function same(actual: number, expected: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(TOLERANCE)
}

async function pair(layout: Locator): Promise<Locator> {
  const columns = layout.locator('.autofit-coordination-pair > .autofit')
  await expect(columns).toHaveCount(2)
  return columns
}

async function readPresentation(roles: Locator) {
  return roles.evaluateAll((roots) => roots.map((root) => {
    const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
    return {
      state: root.getAttribute('data-autofit-state'),
      tier: root.getAttribute('data-autofit-tier'),
      scale: root.getAttribute('data-autofit-scale'),
      requestedAlignment: root.getAttribute('data-autofit-requested-alignment'),
      effectiveAlignment: root.getAttribute('data-autofit-effective-alignment'),
      empty: root.getAttribute('data-autofit-empty'),
      visibility: getComputedStyle(viewport).visibility,
      diagnostic: root.querySelector('.autofit__diagnostics')?.textContent?.trim() ?? '',
    }
  }))
}

async function waitForTerminal(roles: Locator): Promise<void> {
  for (const role of await roles.all())
    await expect(role).toHaveAttribute('data-autofit-state', /^(fit|overflow|unsupported)$/)
}

async function holdFramesBeforeLoad(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const frames: FrameRequestCallback[] = []
    Object.assign(window, {
      __autoColumnLayoutFrames: frames,
      __slidevAutofitTestRequestFrame: (callback: FrameRequestCallback): number => {
        frames.push(callback)
        return 980_000 + frames.length
      },
    })
  })
}

async function releaseFrame(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const target = window as typeof window & {
      __autoColumnLayoutFrames?: FrameRequestCallback[]
    }
    const callback = target.__autoColumnLayoutFrames?.shift()
    if (!callback)
      return false
    callback(performance.now())
    await new Promise<void>(resolve => queueMicrotask(resolve))
    return true
  })
}

async function releaseAllFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const target = window as typeof window & {
      __autoColumnLayoutFrames?: FrameRequestCallback[]
      __slidevAutofitTestRequestFrame?: unknown
    }
    delete target.__slidevAutofitTestRequestFrame
    for (const callback of target.__autoColumnLayoutFrames?.splice(0) ?? [])
      callback(performance.now())
  })
}

async function installAtomicPublicationObserver(page: Page, marker: string): Promise<void> {
  await page.evaluate((testId) => {
    const target = window as typeof window & { __autoColumnPublications?: unknown[] }
    const snapshots: unknown[] = []
    const roots = () => [...document.querySelector(
      `[data-testid="${testId}"]`,
    )?.closest('.auto-column-layout')?.querySelectorAll('.autofit') ?? []]
    const snapshot = () => roots().map((root) => {
      const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
      return {
        state: root.getAttribute('data-autofit-state'),
        tier: root.getAttribute('data-autofit-tier'),
        scale: root.getAttribute('data-autofit-scale'),
        visibility: getComputedStyle(viewport).visibility,
        diagnostic: root.querySelector('.autofit__diagnostics')?.textContent?.trim() ?? '',
      }
    })
    new MutationObserver(() => {
      const value = snapshot()
      if (value.length === 2)
        snapshots.push(value)
    }).observe(document.body, { subtree: true, childList: true, attributes: true })
    target.__autoColumnPublications = snapshots
  }, marker)
}

test('allocates fixed main, equal remaining columns, and fixed footer in source-independent order', async ({ page }) => {
  const layout = await slide(page, 71, 'auto-column-geometry')
  const edges = await contentEdges(layout)
  const main = await box(layout.locator('.auto-column-layout__main'))
  const columns = await box(layout.locator('.autofit-coordination-pair'))
  const footer = await box(layout.locator('.auto-column-layout__footer'))
  const roles = await pair(layout)
  const left = await box(roles.nth(0))
  const right = await box(roles.nth(1))

  same(main.y, edges.top)
  same(main.y + main.height, columns.y)
  same(columns.y + columns.height, footer.y)
  same(footer.y + footer.height, edges.bottom)
  same(left.width, right.width)
  same(right.x - (left.x + left.width), 16 * edges.inlineScale)
  same(left.y, columns.y)
  same(left.height, columns.height)
  same(right.y, columns.y)
  same(right.height, columns.height)
  await expect(roles.nth(0)).toHaveAttribute('data-autofit-role', 'left')
  await expect(roles.nth(1)).toHaveAttribute('data-autofit-role', 'right')
})

test('shares valid and invalid layout frontmatter with both coordinated roles', async ({ page }) => {
  const valid = await slide(page, 72, 'auto-column-valid-config')
  for (const role of await (await pair(valid)).all()) {
    await expect(role).toHaveAttribute('data-autofit-requested-alignment', 'center')
    await expect(role).not.toHaveClass(/autofit--config-error/)
  }

  const invalid = await slide(page, 73, 'auto-column-invalid-config')
  for (const role of await (await pair(invalid)).all()) {
    await expect(role).toHaveClass(/autofit--config-error/)
    await expect(role).toHaveAttribute('data-autofit-config-error', /invalid-small-tiers/)
    await expect(role).toHaveAttribute('data-autofit-requested-alignment', 'distributed')
  }
})

test('shares partial and default frontmatter, including a balanced managed pair', async ({ page }) => {
  const partial = await slide(page, 80, 'auto-column-partial-config')
  for (const role of await (await pair(partial)).all())
    await expect(role).toHaveAttribute('data-autofit-requested-alignment', 'bottom')

  const defaults = await slide(page, 81, 'auto-column-default-config')
  const roles = await pair(defaults)
  for (const role of await roles.all()) {
    await expect(role).toHaveAttribute('data-autofit-requested-alignment', 'distributed')
    await expect(role).toHaveAttribute('data-autofit-private-tier', '4')
    await expect(role).toHaveAttribute('data-autofit-tier', '4')
  }
})

test('publishes only the common tier and keeps omitted slots at half width', async ({ page }) => {
  const unbalanced = await slide(page, 74, 'auto-column-unbalanced')
  const managed = await pair(unbalanced)
  await expect(managed.nth(0)).toHaveAttribute('data-autofit-private-tier', '0')
  await expect(managed.nth(1)).toHaveAttribute('data-autofit-private-tier', '-4')
  await expect(managed.nth(0)).toHaveAttribute('data-autofit-tier', '-4')
  await expect(managed.nth(1)).toHaveAttribute('data-autofit-tier', '-4')

  const omitted = await slide(page, 75, 'auto-column-omitted')
  const roles = await pair(omitted)
  const left = await box(roles.nth(0))
  const right = await box(roles.nth(1))
  same(left.width, right.width)
  await expect(roles.nth(1)).toHaveAttribute('data-autofit-empty', 'true')
})

test('reduces only the pair allocation for additional fixed content and preserves empty plus unsupported terminals', async ({ page }) => {
  const baseline = await slide(page, 71, 'auto-column-geometry')
  const baselinePair = await box(baseline.locator('.autofit-coordination-pair'))
  const expanded = await slide(page, 82, 'auto-column-additional-fixed')
  const expandedPair = await box(expanded.locator('.autofit-coordination-pair'))
  const footer = await box(expanded.locator('.auto-column-layout__footer'))
  const edges = await contentEdges(expanded)
  expect(expandedPair.height).toBeLessThan(baselinePair.height - 50)
  same(footer.y + footer.height, edges.bottom)

  const empty = await slide(page, 83, 'auto-column-empty')
  for (const role of await (await pair(empty)).all())
    await expect(role).toHaveAttribute('data-autofit-empty', 'true')

  const unsupported = await slide(page, 84, 'auto-column-unsupported')
  const unsupportedRoles = await pair(unsupported)
  await expect(unsupportedRoles.nth(0)).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(unsupportedRoles.nth(1)).toHaveAttribute('data-autofit-state', 'fit')
})

test('localizes column diagnostics unless fixed content overflows, which clips and takes precedence', async ({ page }) => {
  const overflow = await slide(page, 76, 'auto-column-column-overflow')
  const overflowingRoles = await pair(overflow)
  await expect(overflowingRoles.nth(0)).toHaveAttribute('data-autofit-state', 'overflow')
  await expect(overflowingRoles.nth(0).locator('.autofit__overflow-badge')).toHaveCount(1)

  for (const target of [
    [77, 'auto-column-fixed-vertical'],
    [78, 'auto-column-fixed-horizontal'],
  ] as const) {
    const fixed = await slide(page, ...target)
    await expect(fixed).toHaveAttribute('data-layout-overflow', 'true')
    await expect(fixed.locator('.auto-column-layout__overflow-badge')).toHaveCount(1)
    for (const badge of await fixed.locator('.autofit__overflow-badge, .autofit__unsupported-badge').all())
      await expect(badge).toHaveCSS('display', 'none')
  }
})

test('neutralizes AutoFit heading optical offsets while retaining fixed-region offsets', async ({ page }) => {
  const layout = await slide(page, 79, 'auto-column-optical-offsets')
  for (const id of ['auto-column-left-h1', 'auto-column-right-h6']) {
    const values = await page.getByTestId(id).evaluate((element) => {
      const style = getComputedStyle(element)
      return [Number.parseFloat(style.marginInlineStart), Number.parseFloat(style.textIndent)]
    })
    expect(Math.abs(values[0])).toBeLessThanOrEqual(0.01)
    expect(Math.abs(values[1])).toBeLessThanOrEqual(0.01)
  }
  const fixed = await page.getByTestId('auto-column-fixed-h1').evaluate((element) => {
    const style = getComputedStyle(element)
    return Number.parseFloat(style.textIndent) / Number.parseFloat(style.fontSize)
  })
  expect(fixed).toBeCloseTo(-0.05, 3)
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
})

test('matches the equivalent auto-default layout geometry and constrains every column measurement box', async ({ page }) => {
  const defaults = await autoDefaultSlide(page, 96, 'default-equivalent-geometry')
  const defaultEdges = await contentEdges(defaults)
  const defaultMain = await box(defaults.locator('.default-layout__main'))
  const defaultAuto = await box(defaults.locator('.autofit'))
  const defaultFooter = await box(defaults.locator('.default-layout__footer'))
  const columns = await slide(page, 85, 'auto-column-equivalent-geometry')
  const columnEdges = await contentEdges(columns)
  const columnMain = await box(columns.locator('.auto-column-layout__main'))
  const columnPair = await box(columns.locator('.autofit-coordination-pair'))
  const columnFooter = await box(columns.locator('.auto-column-layout__footer'))
  const roles = await pair(columns)

  for (const edge of ['top', 'bottom'] as const)
    same(columnEdges[edge], defaultEdges[edge])
  for (const [actual, expected] of [
    [columnMain.y, defaultMain.y],
    [columnMain.height, defaultMain.height],
    [columnPair.y, defaultAuto.y],
    [columnPair.height, defaultAuto.height],
    [columnFooter.y, defaultFooter.y],
    [columnFooter.height, defaultFooter.height],
  ]) same(actual, expected)

  const geometry = await columns.locator('.autofit-coordination-pair').evaluate((pairRoot) => {
    const pairStyle = getComputedStyle(pairRoot)
    return {
      rows: getComputedStyle(pairRoot.closest('.auto-column-layout')!).gridTemplateRows.trim().split(/\s+/),
      columns: pairStyle.gridTemplateColumns.trim().split(/\s+/).map(Number.parseFloat),
      gap: Number.parseFloat(pairStyle.columnGap),
      roots: [...pairRoot.querySelectorAll<HTMLElement>(':scope > .autofit')].map((root) => {
        const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
        const rootStyle = getComputedStyle(root)
        const viewportStyle = getComputedStyle(viewport)
        return {
          rootMinWidth: rootStyle.minWidth,
          rootMinHeight: rootStyle.minHeight,
          viewportMinWidth: viewportStyle.minWidth,
          viewportMinHeight: viewportStyle.minHeight,
          root: root.getBoundingClientRect().toJSON(),
          viewport: viewport.getBoundingClientRect().toJSON(),
        }
      }),
    }
  })
  expect(geometry.rows).toHaveLength(3)
  expect(geometry.columns).toHaveLength(2)
  same(geometry.columns[0], geometry.columns[1])
  same(geometry.gap, 16)
  for (const role of geometry.roots) {
    expect(role.rootMinWidth).toBe('0px')
    expect(role.rootMinHeight).toBe('0px')
    expect(role.viewportMinWidth).toBe('0px')
    expect(role.viewportMinHeight).toBe('0px')
    same(role.viewport.width, role.root.width)
    same(role.viewport.height, role.root.height)
  }
})

test('applies the same default, custom, partial, and invalid configuration semantics to sparse and dense columns', async ({ page }) => {
  const custom = await pair(await slide(page, 86, 'auto-column-config-custom'))
  await waitForTerminal(custom)
  const customPresentation = await readPresentation(custom)
  expect(customPresentation[0]).toMatchObject({ tier: '2', scale: '1.5', requestedAlignment: 'center', effectiveAlignment: 'middle' })
  expect(customPresentation[1]).toEqual(customPresentation[0])

  const defaults = await pair(await slide(page, 87, 'auto-column-config-default'))
  await waitForTerminal(defaults)
  const defaultPresentation = await readPresentation(defaults)
  expect(defaultPresentation[0]).toMatchObject({ tier: '4', scale: '1.4', requestedAlignment: 'distributed', effectiveAlignment: 'distributed' })
  expect(defaultPresentation[1]).toEqual(defaultPresentation[0])

  const partial = await pair(await slide(page, 88, 'auto-column-config-partial'))
  await waitForTerminal(partial)
  const partialPresentation = await readPresentation(partial)
  expect(partialPresentation[0]).toMatchObject({ tier: '4', scale: '1.4', requestedAlignment: 'bottom', effectiveAlignment: 'bottom' })
  expect(partialPresentation[1]).toEqual(partialPresentation[0])

  const invalid = await pair(await slide(page, 89, 'auto-column-config-invalid'))
  await waitForTerminal(invalid)
  const invalidPresentation = await readPresentation(invalid)
  expect(invalidPresentation[0]).toEqual(defaultPresentation[0])
  expect(invalidPresentation[1]).toEqual(defaultPresentation[1])
  for (const role of await invalid.all())
    await expect(role).toHaveClass(/autofit--config-error/)
})

for (const [slideNumber, marker, firstPrivateRole] of [
  [90, 'auto-column-held-left-first', 0],
  [91, 'auto-column-held-right-first', 1],
] as const) {
  test(`keeps actual layout publication private on every held frame when ${firstPrivateRole === 0 ? 'left' : 'right'} finishes first`, async ({ page }) => {
    await holdFramesBeforeLoad(page)
    await page.goto(`/${slideNumber}`)
    await expect(page.getByTestId(marker)).toBeVisible()
    const layout = page.locator('.auto-column-layout').filter({ has: page.getByTestId(marker) })
    const roles = await pair(layout)
    await installAtomicPublicationObserver(page, marker)

    let sawPrivateSingleton = false
    for (let frame = 0; frame < 12; frame += 1) {
      const before = await readPresentation(roles)
      expect(before.every(role => role.state === 'pending' && role.tier === null && role.scale === null && role.visibility === 'hidden' && role.diagnostic === '')).toBe(true)
      if (!await releaseFrame(page))
        break
      const after = await readPresentation(roles)
      const privateFrame = after.every(role => role.state === 'pending' && role.tier === null && role.scale === null && role.visibility === 'hidden' && role.diagnostic === '')
      const terminalFrame = after.every(role => /^(fit|overflow)$/.test(role.state ?? '') && role.tier !== null && role.scale !== null && role.visibility === 'visible')
      expect(privateFrame || terminalFrame, JSON.stringify(after)).toBe(true)
      if (terminalFrame)
        break
      const privateTiers = await roles.evaluateAll(roots => roots.map(root => root.getAttribute('data-autofit-private-tier')))
      if (privateTiers.filter(Boolean).length === 1) {
        expect(privateTiers[firstPrivateRole]).not.toBeNull()
        sawPrivateSingleton = true
      }
    }
    expect(sawPrivateSingleton).toBe(true)
    await releaseAllFrames(page)
    for (const role of await roles.all())
      await expect(role).toHaveAttribute('data-autofit-state', /^(fit|overflow)$/)
    const final = await readPresentation(roles)
    expect(final[0].tier).toBe(final[1].tier)
    expect(final[0].scale).toBe(final[1].scale)
    expect(final.every(role => role.visibility === 'visible')).toBe(true)
    const publications = await page.evaluate(() => (window as typeof window & { __autoColumnPublications?: Array<Array<Record<string, string | null>>> }).__autoColumnPublications ?? [])
    const finalTransitions = publications.filter(snapshot => snapshot.length === 2 && snapshot.every((role, index) =>
      role.state === final[index].state
      && role.tier === final[index].tier
      && role.scale === final[index].scale
      && role.visibility === final[index].visibility
      && role.diagnostic === final[index].diagnostic,
    ))
    expect(finalTransitions.length).toBeGreaterThan(0)
    expect(new Set(finalTransitions.map(snapshot => JSON.stringify(snapshot))).size).toBe(1)
  })
}

test('keeps empty, overflow, and unsupported terminal diagnostics localized under the coordinated policy', async ({ page }) => {
  const omitted = await pair(await slide(page, 92, 'auto-column-omitted-vote'))
  await expect(omitted.nth(0)).toHaveAttribute('data-autofit-tier', '4')
  await expect(omitted.nth(1)).toHaveAttribute('data-autofit-empty', 'true')
  await expect(omitted.nth(1)).toHaveAttribute('data-autofit-tier', '0')

  const empty = await pair(await slide(page, 93, 'auto-column-both-empty-tier-zero'))
  for (const role of await empty.all())
    await expect(role).toHaveAttribute('data-autofit-tier', '0')

  for (const fixture of [
    [94, 'auto-column-one-sided-overflow'],
    [95, 'auto-column-two-sided-overflow'],
  ] as const) {
    const roles = await pair(await slide(page, ...fixture))
    for (const role of await roles.all())
      await expect(role).toHaveAttribute('data-autofit-tier', '-4')
    await expect(roles.nth(0)).toHaveAttribute('data-autofit-state', 'overflow')
    await expect(roles.nth(0).locator('.autofit__overflow-badge')).toHaveCount(1)
    if (fixture[0] === 94) {
      await expect(roles.nth(1)).toHaveAttribute('data-autofit-state', 'fit')
      await expect(roles.nth(1).locator('.autofit__overflow-badge')).toHaveCount(0)
    }
    else {
      await expect(roles.nth(1)).toHaveAttribute('data-autofit-state', 'overflow')
      await expect(roles.nth(1).locator('.autofit__overflow-badge')).toHaveCount(1)
    }
  }

  const unsupported = await pair(await slide(page, 97, 'auto-column-unsupported-terminal'))
  await expect(unsupported.nth(0)).toHaveAttribute('data-autofit-state', 'unsupported')
  await expect(unsupported.nth(0)).not.toHaveAttribute('data-autofit-tier')
  await expect(unsupported.nth(0)).not.toHaveAttribute('data-autofit-scale')
  await expect(unsupported.nth(0).locator('.autofit__unsupported-badge')).toHaveCount(1)
  await expect(unsupported.nth(1)).toHaveAttribute('data-autofit-state', 'fit')
  await expect(unsupported.nth(1)).toHaveAttribute('data-autofit-tier', '4')
})

test('clips fixed vertical and horizontal overflow while the layout diagnostic suppresses local visuals', async ({ page }) => {
  for (const fixture of [
    [98, 'auto-column-fixed-vertical-precedence', 'vertical'],
    [99, 'auto-column-fixed-horizontal-precedence', 'horizontal'],
  ] as const) {
    const layout = await slide(page, fixture[0], fixture[1])
    await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
    await expect(layout).toHaveCSS('overflow', 'hidden')
    await expect(layout.locator('.auto-column-layout__overflow-badge')).toBeVisible()
    const pairBox = await box(layout.locator('.autofit-coordination-pair'))
    const content = await contentEdges(layout)
    if (fixture[2] === 'vertical')
      expect(pairBox.height).toBeLessThanOrEqual(TOLERANCE)
    else {
      expect(pairBox.y).toBeGreaterThanOrEqual(content.top - TOLERANCE)
      expect(pairBox.y + pairBox.height).toBeLessThanOrEqual(content.bottom + TOLERANCE)
    }
    const roles = await pair(layout)
    for (const role of await roles.all()) {
      await expect(role).toHaveCSS('box-shadow', 'none')
      for (const badge of await role.locator('.autofit__overflow-badge, .autofit__unsupported-badge').all())
        await expect(badge).toHaveCSS('display', 'none')
    }
  }
})

test('keeps both managed heading types neutral while fixed main and footer offsets exactly match auto-default', async ({ page }) => {
  await autoDefaultSlide(page, 101, 'default-optical-equivalent')
  const defaultOffsets: Record<string, string[]> = {}
  for (const region of ['main', 'footer'] as const) {
    for (const heading of ['h1', 'h6'] as const) {
      defaultOffsets[`${region}-${heading}`] = await page.getByTestId(`default-${region}-${heading}`).evaluate((element) => {
        const computed = getComputedStyle(element)
        return [computed.marginInlineStart, computed.textIndent]
      })
    }
  }
  const columns = await slide(page, 100, 'auto-column-optical-equivalent')
  for (const testId of ['left-h1', 'left-h6', 'right-h1', 'right-h6']) {
    const style = await page.getByTestId(`auto-column-${testId}`).evaluate((element) => {
      const computed = getComputedStyle(element)
      return [Number.parseFloat(computed.marginInlineStart), Number.parseFloat(computed.textIndent)]
    })
    expect(Math.abs(style[0])).toBeLessThanOrEqual(0.01)
    expect(Math.abs(style[1])).toBeLessThanOrEqual(0.01)
  }
  for (const region of ['main', 'footer'] as const) {
    for (const heading of ['h1', 'h6'] as const) {
      const read = async (id: string) => page.getByTestId(id).evaluate((element) => {
        const computed = getComputedStyle(element)
        return [computed.marginInlineStart, computed.textIndent]
      })
      expect(await read(`auto-column-${region}-${heading}`)).toEqual(
        defaultOffsets[`${region}-${heading}`],
      )
    }
  }
  await expect(columns).not.toHaveAttribute('data-layout-overflow', 'true')
})

test('keeps coordinated presentation stable through supported paragraph and whole-list reveals', async ({ page }) => {
  const layout = await slide(page, 102, 'auto-column-reveal-stability')
  const roles = await pair(layout)
  await waitForTerminal(roles)
  await page.evaluate(async () => {
    await document.fonts.ready
  })
  await page.waitForTimeout(250)

  async function snapshot() {
    return layout.evaluate((element) => {
      const targets = [
        'auto-column-reveal-paragraph',
        'auto-column-reveal-list-one',
        'auto-column-reveal-list-two',
      ]
      const roots = [...element.querySelectorAll<HTMLElement>(
        '.autofit-coordination-pair > .autofit',
      )]
      return {
        roles: roots.map((root) => {
          const viewport = root.querySelector<HTMLElement>('.autofit__viewport')!
          const rectangle = viewport.getBoundingClientRect()
          const localScale = rectangle.height
            / Number.parseFloat(getComputedStyle(viewport).height)
          return {
            state: root.dataset.autofitState,
            tier: root.dataset.autofitTier,
            scale: root.dataset.autofitScale,
            fullGaps: root.dataset.autofitFullGaps,
            halfGaps: root.dataset.autofitHalfGaps,
            batchId: root.dataset.autofitBatchId,
            measureCount: root.dataset.autofitMeasureCount,
            rectangle: {
              left: rectangle.left / localScale,
              top: rectangle.top / localScale,
              width: rectangle.width / localScale,
              height: rectangle.height / localScale,
            },
          }
        }),
        targets: targets.map((testId) => {
          const target = element.querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
          const rectangle = target.getBoundingClientRect()
          return {
            testId,
            hidden: target.classList.contains('slidev-vclick-hidden'),
            opacity: getComputedStyle(target).opacity,
            pointerEvents: getComputedStyle(target).pointerEvents,
            listStyleType: getComputedStyle(target).listStyleType,
            rectangle: {
              left: rectangle.left,
              top: rectangle.top,
              width: rectangle.width,
              height: rectangle.height,
            },
          }
        }),
      }
    })
  }

  await page.evaluate(() => {
    const debug = (window as typeof window & {
      __slidevAutofitDebug?: { reset(): void }
    }).__slidevAutofitDebug
    if (!debug)
      throw new Error('development autofit diagnostics are not installed')
    debug.reset()
  })
  await page.waitForTimeout(450)

  const before = await snapshot()
  expect(before.roles).toHaveLength(2)
  expect(before.roles.every(role => role.state === 'fit')).toBe(true)
  expect(new Set(before.roles.map(role => role.tier)).size).toBe(1)
  expect(new Set(before.roles.map(role => role.scale)).size).toBe(1)
  expect(before.targets.every(target => target.hidden && target.opacity === '0')).toBe(true)
  for (const target of before.targets.slice(1)) {
    expect(target.listStyleType).not.toBe('none')
    expect(target.pointerEvents).toBe('none')
  }

  await page.evaluate(() => {
    const debug = (window as typeof window & {
      __slidevAutofitDebug?: { reset(): void }
    }).__slidevAutofitDebug
    if (!debug)
      throw new Error('development autofit diagnostics are not installed')
    debug.reset()
  })

  for (let clickStep = 1; clickStep <= 3; clickStep += 1) {
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(450)
    const current = await snapshot()

    expect(current.roles).toEqual(before.roles)
    expect(current.targets.map(target => target.rectangle))
      .toEqual(before.targets.map(target => target.rectangle))
    expect(current.targets[0]).toMatchObject({
      hidden: false,
      opacity: '1',
    })
    for (const [index, target] of current.targets.slice(1).entries()) {
      const hidden = index >= clickStep - 1
      expect(target.listStyleType).toBe(before.targets[index + 1].listStyleType)
      expect(target.hidden).toBe(hidden)
      expect(target.opacity).toBe(hidden ? '0' : '1')
      if (hidden)
        expect(target.pointerEvents).toBe('none')
      else
        expect(target.pointerEvents).not.toBe('none')
    }

    const batchCount = await page.evaluate(() => {
      const debug = (window as typeof window & {
        __slidevAutofitDebug?: { readonly snapshot: { readonly batchCount: number } }
      }).__slidevAutofitDebug
      if (!debug)
        throw new Error('development autofit diagnostics are not installed')
      return debug.snapshot.batchCount
    })
    expect(batchCount).toBe(0)
  }
})
