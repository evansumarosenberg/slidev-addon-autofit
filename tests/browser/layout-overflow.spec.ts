import { expect, test } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

const STRUCTURAL_FOOTER_SLIDE = 162
const STRUCTURAL_BOUNDARIES_SLIDE = 168
const TOLERANCE = 0.5

type LayoutKind = 'auto-default' | 'auto-column' | 'auto-image'

interface FooterFixture {
  readonly layout: LayoutKind
  readonly kind: 'link' | 'heading'
  readonly slide: number
  readonly marker: string
}

const footerFixtures: readonly FooterFixture[] = [
  { layout: 'auto-default', kind: 'link', slide: STRUCTURAL_FOOTER_SLIDE, marker: 'fixed-footer-link-auto-default' },
  { layout: 'auto-default', kind: 'heading', slide: STRUCTURAL_FOOTER_SLIDE + 1, marker: 'fixed-footer-heading-auto-default' },
  { layout: 'auto-column', kind: 'link', slide: STRUCTURAL_FOOTER_SLIDE + 2, marker: 'fixed-footer-link-auto-column' },
  { layout: 'auto-column', kind: 'heading', slide: STRUCTURAL_FOOTER_SLIDE + 3, marker: 'fixed-footer-heading-auto-column' },
  { layout: 'auto-image', kind: 'link', slide: STRUCTURAL_FOOTER_SLIDE + 4, marker: 'fixed-footer-link-auto-image' },
  { layout: 'auto-image', kind: 'heading', slide: STRUCTURAL_FOOTER_SLIDE + 5, marker: 'fixed-footer-heading-auto-image' },
]

function layoutSelector(layout: LayoutKind): string {
  return `.slidev-layout.${layout}`
}

function footerSelector(layout: LayoutKind): string {
  return `.${layout}-layout__footer`
}

async function openFooterFixture(page: Page, fixture: FooterFixture): Promise<Locator> {
  await page.goto(`/${fixture.slide}`)
  const marker = page.getByTestId(fixture.marker)
  await expect(marker).toBeVisible({ timeout: 15_000 })
  return page.locator(layoutSelector(fixture.layout)).filter({ has: marker })
}

async function expectFooterStructuralBoxFits(layout: Locator, kind: LayoutKind): Promise<void> {
  const metrics = await layout.evaluate((element, selector) => {
    const root = element as HTMLElement
    const footer = root.querySelector<HTMLElement>(selector)
    if (!footer)
      throw new Error('Missing fixed footer region.')

    const layoutRect = root.getBoundingClientRect()
    const footerRect = footer.getBoundingClientRect()
    const style = getComputedStyle(root)
    const inlineScale = layoutRect.width / root.clientWidth
    const blockScale = layoutRect.height / root.clientHeight
    return {
      content: {
        top: layoutRect.top + Number.parseFloat(style.paddingTop) * blockScale,
        right: layoutRect.right - Number.parseFloat(style.paddingRight) * inlineScale,
        bottom: layoutRect.bottom - Number.parseFloat(style.paddingBottom) * blockScale,
        left: layoutRect.left + Number.parseFloat(style.paddingLeft) * inlineScale,
      },
      footer: {
        top: footerRect.top,
        right: footerRect.right,
        bottom: footerRect.bottom,
        left: footerRect.left,
      },
    }
  }, footerSelector(kind))

  expect(metrics.footer.left).toBeGreaterThanOrEqual(metrics.content.left - TOLERANCE)
  expect(metrics.footer.right).toBeLessThanOrEqual(metrics.content.right + TOLERANCE)
  expect(metrics.footer.top).toBeGreaterThanOrEqual(metrics.content.top - TOLERANCE)
  expect(metrics.footer.bottom).toBeLessThanOrEqual(metrics.content.bottom + TOLERANCE)
}

async function expectFittingFooterArtifactIsIgnored(page: Page, fixture: FooterFixture): Promise<void> {
  const layout = await openFooterFixture(page, fixture)
  const footer = layout.locator(footerSelector(fixture.layout))
  await expectFooterStructuralBoxFits(layout, fixture.layout)

  if (fixture.kind === 'link') {
    const link = footer.locator('a')
    await expect(link).toHaveCSS('border-bottom-width', '12px')
    const linkAndFooter = await footer.evaluate((element) => {
      const footerElement = element as HTMLElement
      const linkElement = footerElement.querySelector('a')!
      const footerRect = footerElement.getBoundingClientRect()
      const linkRect = linkElement.getBoundingClientRect()
      return {
        footerClientHeight: footerElement.clientHeight,
        footerScrollHeight: footerElement.scrollHeight,
        linkBottom: linkRect.bottom,
        footerBottom: footerRect.bottom,
      }
    })
    expect(linkAndFooter.footerScrollHeight).toBeGreaterThan(linkAndFooter.footerClientHeight)
    expect(linkAndFooter.linkBottom).toBeGreaterThan(linkAndFooter.footerBottom + TOLERANCE)
  }
  else {
    const heading = page.getByTestId(fixture.marker)
    const headingAndFooter = await footer.evaluate((element, marker) => {
      const footerElement = element as HTMLElement
      const headingElement = footerElement.querySelector<HTMLElement>(`[data-testid="${marker}"]`)
      if (!headingElement)
        throw new Error('Missing footer heading.')
      const footerRect = footerElement.getBoundingClientRect()
      const headingRect = headingElement.getBoundingClientRect()
      return {
        footerClientHeight: footerElement.clientHeight,
        footerScrollHeight: footerElement.scrollHeight,
        headingBottom: headingRect.bottom,
        footerBottom: footerRect.bottom,
      }
    }, fixture.marker)
    await expect(heading).toHaveCSS('line-height', '1px')
    expect(headingAndFooter.footerScrollHeight).toBeGreaterThan(headingAndFooter.footerClientHeight)
    expect(headingAndFooter.headingBottom).toBeLessThanOrEqual(headingAndFooter.footerBottom + TOLERANCE)
  }

  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
  await expect(layout).not.toHaveClass(new RegExp(`${fixture.layout}-layout--overflow`))
  await expect(layout.locator('*').filter({ hasText: 'LAYOUT OVERFLOW' })).toHaveCount(0)
}

for (const fixture of footerFixtures) {
  test(`ignores fitting footer ${fixture.kind} artifacts in ${fixture.layout}`, async ({ page }) => {
    await expectFittingFooterArtifactIsIgnored(page, fixture)
  })
}

test('keeps full-turn individual rotations on decorated static footer links geometry-transparent', async ({ page }) => {
  const fixture = footerFixtures[0]
  const layout = await openFooterFixture(page, fixture)
  const footer = layout.locator(footerSelector(fixture.layout))
  const link = footer.locator('a')

  await expectFooterStructuralBoxFits(layout, fixture.layout)
  await expect(link).toHaveCSS('border-bottom-width', '12px')

  for (const rotation of ['360deg', '1turn', '-720deg']) {
    await link.evaluate((element, nextRotation) => {
      (element as HTMLElement).style.rotate = nextRotation
    }, rotation)
    await expect(link).not.toHaveCSS('rotate', 'none')
    await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
  }

  await link.evaluate((element) => {
    Object.assign((element as HTMLElement).style, {
      rotate: '180deg',
      transformOrigin: '1000px 0',
    })
  })
  await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
})

test('continues to measure qualifying structural descendants and clip them through intervening ancestors', async ({ page }) => {
  await page.goto(`/${STRUCTURAL_BOUNDARIES_SLIDE}`)
  const footer = page.getByTestId('structural-boundaries-footer')
  await expect(footer).toBeVisible({ timeout: 15_000 })
  const layout = page.locator('.slidev-layout.auto-default').filter({ has: footer })

  const cases = [
    ['structural-boundary-atomic', { display: 'inline-block', width: '1200px', height: '1px' }],
    ['structural-boundary-media', { display: 'inline', width: '1200px', height: '1px' }],
    ['structural-boundary-positioned', { display: 'inline', position: 'relative', left: '1200px' }],
    ['structural-boundary-transformed', { display: 'inline', transform: 'translateX(1200px)' }],
    ['structural-boundary-negative-margin', { display: 'inline', marginLeft: '-1200px' }],
  ] as const

  for (const [testId, styles] of cases) {
    await page.getByTestId(testId).evaluate((element, nextStyles) => {
      Object.assign((element as HTMLElement).style, nextStyles)
    }, styles)
    await expect(layout).toHaveAttribute('data-layout-overflow', 'true')
    await page.getByTestId(testId).evaluate((element) => {
      element.removeAttribute('style')
    })
    await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
  }

  await page.getByTestId('structural-boundary-clipped').evaluate((element) => {
    const clip = element as HTMLElement
    Object.assign(clip.parentElement!.style, {
      position: 'relative',
    })
    Object.assign(clip.style, {
      display: 'inline-block',
      position: 'absolute',
      top: '0',
      left: '0',
      width: '1px',
      height: '1px',
      overflow: 'hidden',
    })
    Object.assign(clip.firstElementChild as HTMLElement, {
      style: 'display: inline-block; transform: translateX(1200px)',
    })
  })
  await expect(layout).not.toHaveAttribute('data-layout-overflow', 'true')
})
