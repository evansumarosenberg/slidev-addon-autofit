import { describe, expect, it, vi } from 'vitest'

import { classifyAutofitContent } from '../../utils/autofit/classify'
import {
  convertAutofitRectToLocal,
  measureAutofitGeometry,
  measureAutofitLocalCoordinateSpace,
} from '../../utils/autofit/geometry'
import type {
  AutofitComputedBoxStyle,
  AutofitGeometryReads,
  AutofitGeometryRect,
} from '../../utils/autofit/types'

interface FixtureOptions {
  readonly hostSize?: readonly [number, number]
  readonly hostRect?: AutofitGeometryRect
  readonly viewportSize?: readonly [number, number]
  readonly viewportRect?: AutofitGeometryRect
  readonly scrollSize?: readonly [number, number]
  readonly attach?: boolean
}

function rect(
  left: number,
  top: number,
  right: number,
  bottom: number,
): AutofitGeometryRect {
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

function createFixture(options: FixtureOptions = {}): {
  readonly host: HTMLElement
  readonly viewport: HTMLElement
  readonly flow: HTMLElement
  readonly rects: Map<Element, AutofitGeometryRect>
  readonly sizes: Map<Element, readonly [number, number]>
  readonly styles: Map<Element, Partial<AutofitComputedBoxStyle>>
  readonly rendered: Set<Element>
  readonly reads: AutofitGeometryReads
} {
  const host = document.createElement('section')
  const viewport = document.createElement('div')
  const flow = document.createElement('div')
  host.append(viewport)
  viewport.append(flow)
  if (options.attach !== false)
    document.body.append(host)

  const rects = new Map<Element, AutofitGeometryRect>([
    [host, options.hostRect ?? rect(0, 0, 800, 600)],
    [viewport, options.viewportRect ?? rect(100, 50, 500, 350)],
    [flow, options.viewportRect ?? rect(100, 50, 500, 350)],
  ])
  const sizes = new Map<Element, readonly [number, number]>([
    [host, options.hostSize ?? [800, 600]],
    [viewport, options.viewportSize ?? [400, 300]],
    [flow, options.viewportSize ?? [400, 300]],
  ])
  const styles = new Map<Element, Partial<AutofitComputedBoxStyle>>()
  const rendered = new Set<Element>([host, viewport, flow])
  const scrollSize = options.scrollSize ?? options.viewportSize ?? [400, 300]
  const reads: AutofitGeometryReads = {
    readComputedStyle: (element) => {
      const [width, height] = sizes.get(element) ?? [0, 0]
      return {
        width: `${width}px`,
        height: `${height}px`,
        display: 'block',
        position: 'static',
        transform: 'none',
        translate: 'none',
        rotate: 'none',
        scale: 'none',
        marginTop: '0px',
        marginRight: '0px',
        marginBottom: '0px',
        marginLeft: '0px',
        ...styles.get(element),
      }
    },
    readBoundingRect: element => rects.get(element) ?? rect(0, 0, 0, 0),
    readClientRectCount: element => rendered.has(element) ? 1 : 0,
    readScrollExtent: () => ({
      inlineSize: scrollSize[0],
      blockSize: scrollSize[1],
    }),
  }

  return { host, viewport, flow, rects, sizes, styles, rendered, reads }
}

function classificationFor(fixture: ReturnType<typeof createFixture>) {
  return classifyAutofitContent(fixture.flow)
}

function renderWithNegativeRect(
  fixture: ReturnType<typeof createFixture>,
  element: Element,
): void {
  fixture.rendered.add(element)
  fixture.rects.set(element, rect(-2, -3, 50, 20))
}

function setInlineStyle(
  fixture: ReturnType<typeof createFixture>,
  element: Element,
  overrides: Partial<AutofitComputedBoxStyle> = {},
): void {
  fixture.styles.set(element, {
    display: 'inline',
    position: 'static',
    transform: 'none',
    translate: 'none',
    rotate: 'none',
    scale: 'none',
    marginTop: '0px',
    marginRight: '0px',
    marginBottom: '0px',
    marginLeft: '0px',
    ...overrides,
  })
}

describe('autofit geometry adapter', () => {
  it('exposes the shared transformed-host local coordinate conversion', () => {
    const fixture = createFixture({
      hostSize: [800, 600],
      hostRect: rect(0, 0, 1200, 900),
      viewportSize: [400, 200],
      viewportRect: rect(100, 50, 700, 350),
    })

    const space = measureAutofitLocalCoordinateSpace(
      fixture.viewport,
      fixture.reads,
    )

    expect(space.status).toBe('measured')
    if (space.status !== 'measured')
      return
    expect(convertAutofitRectToLocal(
      rect(115, 65, 685, 335),
      space,
    )).toEqual(rect(10, 10, 390, 190))
  })

  it('converts transformed descendant rectangles into viewport-local CSS pixels', () => {
    const fixture = createFixture({
      hostSize: [800, 600],
      hostRect: rect(0, 0, 1200, 900),
      viewportSize: [400, 200],
      viewportRect: rect(100, 50, 700, 350),
      scrollSize: [400, 200],
    })
    const child = document.createElement('p')
    child.textContent = 'Scaled content'
    fixture.flow.append(child)
    fixture.rendered.add(child)
    fixture.rects.set(child, rect(115, 65, 685, 335))

    const result = measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })

    expect(result).toMatchObject({
      status: 'measured',
      viewportInlineSize: 400,
      viewportBlockSize: 200,
      inlineScale: 1.5,
      blockScale: 1.5,
      bounds: {
        minInline: 0,
        maxInline: 400,
        minBlock: 0,
        maxBlock: 200,
      },
      contentInlineExtent: 400,
      contentBlockExtent: 200,
      emptySpace: 0,
      fits: true,
    })
  })

  it('unions negative rectangle excursions with positive scroll overflow on both axes', () => {
    const fixture = createFixture({
      viewportSize: [100, 80],
      viewportRect: rect(100, 200, 300, 360),
      scrollSize: [102, 81],
    })
    const negative = document.createElement('div')
    const positive = document.createElement('div')
    fixture.flow.append(negative, positive)
    fixture.rendered.add(negative)
    fixture.rendered.add(positive)
    fixture.rects.set(negative, rect(98, 198, 120, 220))
    fixture.rects.set(positive, rect(120, 220, 302, 362))

    const result = measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })

    expect(result).toMatchObject({
      status: 'measured',
      bounds: {
        minInline: -1,
        maxInline: 102,
        minBlock: -1,
        maxBlock: 81,
      },
      contentInlineExtent: 103,
      contentBlockExtent: 82,
      emptySpace: 0,
      fits: false,
    })
  })

  it.each([
    ['heading', '<h1><span id="wrapper">Text</span></h1>'],
    ['paragraph', '<p><span id="wrapper">Text</span></p>'],
    ['list item', '<ul><li><span id="wrapper">Text</span></li></ul>'],
  ])('gives direct and qualifying formatted %s text equivalent bounds', (_, markup) => {
    const direct = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [100, 100],
    })
    direct.flow.innerHTML = markup.replace('<span id="wrapper">Text</span>', 'Text')

    const formatted = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [100, 100],
    })
    formatted.flow.innerHTML = markup
    const wrapper = formatted.flow.querySelector('#wrapper')!
    renderWithNegativeRect(formatted, wrapper)
    setInlineStyle(formatted, wrapper)

    const directResult = measureAutofitGeometry({
      viewport: direct.viewport,
      flow: direct.flow,
      classification: classificationFor(direct),
      reads: direct.reads,
    })
    const formattedResult = measureAutofitGeometry({
      viewport: formatted.viewport,
      flow: formatted.flow,
      classification: classificationFor(formatted),
      reads: formatted.reads,
    })

    expect(formattedResult.status).toBe('measured')
    expect(directResult.status).toBe('measured')
    if (formattedResult.status === 'measured' && directResult.status === 'measured') {
      expect({
        bounds: formattedResult.bounds,
        contentInlineExtent: formattedResult.contentInlineExtent,
        contentBlockExtent: formattedResult.contentBlockExtent,
        emptySpace: formattedResult.emptySpace,
        fits: formattedResult.fits,
      }).toEqual({
        bounds: directResult.bounds,
        contentInlineExtent: directResult.contentInlineExtent,
        contentBlockExtent: directResult.contentBlockExtent,
        emptySpace: directResult.emptySpace,
        fits: directResult.fits,
      })
    }
    expect(formattedResult).toMatchObject({
      status: 'measured',
      bounds: {
        minInline: 0,
        maxInline: 100,
        minBlock: 0,
        maxBlock: 100,
      },
      fits: true,
    })
  })

  it('evaluates nested owned wrappers independently', () => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [100, 100],
    })
    fixture.flow.innerHTML = '<p><a id="outer"><span id="inner">Text</span></a></p>'
    const outer = fixture.flow.querySelector('#outer')!
    const inner = fixture.flow.querySelector('#inner')!
    renderWithNegativeRect(fixture, outer)
    renderWithNegativeRect(fixture, inner)
    fixture.rects.set(outer, rect(-8, -8, 20, 20))
    fixture.rects.set(inner, rect(-2, -3, 50, 20))
    setInlineStyle(fixture, outer)
    setInlineStyle(fixture, inner, { transform: 'matrix(1, 0, 0, 1, 0, 0)' })

    expect(measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })).toMatchObject({
      status: 'measured',
      bounds: { minInline: -2, minBlock: -3 },
      fits: false,
    })
  })

  it('omits every qualifying wrapper in a nested formatting chain', () => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [100, 100],
    })
    fixture.flow.innerHTML = '<p><a id="outer"><span id="inner">Text</span></a></p>'
    const outer = fixture.flow.querySelector('#outer')!
    const inner = fixture.flow.querySelector('#inner')!
    renderWithNegativeRect(fixture, outer)
    renderWithNegativeRect(fixture, inner)
    setInlineStyle(fixture, outer)
    setInlineStyle(fixture, inner)

    expect(measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })).toMatchObject({
      status: 'measured',
      bounds: {
        minInline: 0,
        maxInline: 100,
        minBlock: 0,
        maxBlock: 100,
      },
      fits: true,
    })
  })

  it.each([
    ['position relative', { position: 'relative' }],
    ['position absolute', { position: 'absolute' }],
    ['position fixed', { position: 'fixed' }],
    ['position sticky', { position: 'sticky' }],
    ['transform', { transform: 'translateX(1px)' }],
    ['identity transform', { transform: 'matrix(1, 0, 0, 1, 0, 0)' }],
    ['translate', { translate: '2px' }],
    ['identity translate', { translate: '0px' }],
    ['rotate', { rotate: '2deg' }],
    ['identity rotate', { rotate: '0deg' }],
    ['scale', { scale: '2' }],
    ['identity scale', { scale: '1' }],
    ['negative top margin', { marginTop: '-1px' }],
    ['negative right margin', { marginRight: '-1px' }],
    ['negative bottom margin', { marginBottom: '-1px' }],
    ['negative left margin', { marginLeft: '-1px' }],
    ['unresolved margin', { marginLeft: 'calc(1px - 2px)' }],
    ['non-finite margin', { marginLeft: 'Infinitypx' }],
    ['inline block', { display: 'inline-block' }],
    ['inline flex', { display: 'inline-flex' }],
    ['inline grid', { display: 'inline-grid' }],
    ['inline table', { display: 'inline-table' }],
    ['ordinary block', { display: 'block' }],
  ] satisfies readonly [
    string,
    Partial<AutofitComputedBoxStyle>,
  ][])('retains an owned wrapper with geometry-bearing %s', (_, override) => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [100, 100],
    })
    fixture.flow.innerHTML = '<p><span id="target">Text</span></p>'
    const target = fixture.flow.querySelector('#target')!
    renderWithNegativeRect(fixture, target)
    setInlineStyle(fixture, target, override)

    expect(measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })).toMatchObject({
      status: 'measured',
      bounds: { minInline: -2, minBlock: -3 },
      fits: false,
    })
  })

  it.each([
    'audio',
    'canvas',
    'embed',
    'iframe',
    'img',
    'object',
    'picture',
    'svg',
    'video',
  ])('retains the authoritative %s media rectangle', (tag) => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [100, 100],
    })
    fixture.flow.innerHTML = `<p>Text<${tag} id="target"></${tag}></p>`
    const target = fixture.flow.querySelector('#target')!
    renderWithNegativeRect(fixture, target)
    setInlineStyle(fixture, target)

    expect(measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })).toMatchObject({
      status: 'measured',
      bounds: { minInline: -2, minBlock: -3 },
      fits: false,
    })
  })

  it.each([
    {
      name: 'semantic root',
      markup: '<p id="target"><span>Text</span></p>',
      selector: '#target',
    },
    {
      name: 'gap carrier',
      markup: '<p>Before</p><ul id="target"><li>Item</li></ul>',
      selector: '#target',
    },
    {
      name: 'wrapper not reached through owned text',
      markup: '<p>Owned text<span id="target"></span></p>',
      selector: '#target',
    },
    {
      name: 'atomic root',
      markup: '<blockquote id="target"><span>Text</span></blockquote>',
      selector: '#target',
    },
    {
      name: 'nested atomic descendant',
      markup: '<blockquote><span id="target">Text</span></blockquote>',
      selector: '#target',
    },
    {
      name: 'structural descendant',
      markup: '<ul><li><div id="target">Text</div></li></ul>',
      selector: '#target',
    },
  ])('retains a negative rectangle from a $name', ({ name, markup, selector }) => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [100, 100],
    })
    fixture.flow.innerHTML = markup
    const target = fixture.flow.querySelector(selector)!
    renderWithNegativeRect(fixture, target)
    setInlineStyle(
      fixture,
      target,
      name === 'structural descendant' ? { display: 'block' } : {},
    )

    expect(measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })).toMatchObject({
      status: 'measured',
      bounds: { minInline: -2, minBlock: -3 },
      fits: false,
    })
  })

  it('keeps positive flow scroll overflow when a qualifying wrapper rectangle is omitted', () => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [103, 104],
    })
    fixture.flow.innerHTML = '<h1><span id="wrapper">Text</span></h1>'
    const wrapper = fixture.flow.querySelector('#wrapper')!
    renderWithNegativeRect(fixture, wrapper)
    setInlineStyle(fixture, wrapper)

    expect(measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })).toMatchObject({
      status: 'measured',
      bounds: {
        minInline: 0,
        maxInline: 103,
        minBlock: 0,
        maxBlock: 104,
      },
      fits: false,
    })
  })

  it('accepts the inclusive 0.5px tolerance on both axes and clamps empty space', () => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(10, 20, 110, 120),
      scrollSize: [100.5, 100.5],
    })
    const child = document.createElement('div')
    fixture.flow.append(child)
    fixture.rendered.add(child)
    fixture.rects.set(child, rect(9.5, 19.5, 110.5, 120.5))

    const result = measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })

    expect(result).toMatchObject({
      status: 'measured',
      bounds: {
        minInline: -0.5,
        maxInline: 100.5,
        minBlock: -0.5,
        maxBlock: 100.5,
      },
      contentBlockExtent: 101,
      emptySpace: 0,
      fits: true,
    })

    fixture.rects.set(child, rect(9.499, 19.499, 110.501, 120.501))
    const outsideTolerance = measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })
    expect(outsideTolerance).toMatchObject({ status: 'measured', fits: false })
  })

  it('reports semantic emptiness without attempting layout reads', () => {
    const fixture = createFixture({ attach: false })
    const reads: AutofitGeometryReads = {
      readComputedStyle: vi.fn(fixture.reads.readComputedStyle),
      readBoundingRect: vi.fn(fixture.reads.readBoundingRect),
      readClientRectCount: vi.fn(fixture.reads.readClientRectCount),
      readScrollExtent: vi.fn(fixture.reads.readScrollExtent),
    }

    const result = measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      semanticallyEmpty: true,
      reads,
    })

    expect(result).toEqual({ status: 'empty' })
    expect(reads.readComputedStyle).not.toHaveBeenCalled()
    expect(reads.readBoundingRect).not.toHaveBeenCalled()
    expect(reads.readClientRectCount).not.toHaveBeenCalled()
    expect(reads.readScrollExtent).not.toHaveBeenCalled()
  })

  it('defers disconnected and non-renderable instances with no measurable host', () => {
    const detached = createFixture({ attach: false })
    expect(measureAutofitGeometry({
      viewport: detached.viewport,
      flow: detached.flow,
      classification: classificationFor(detached),
      reads: detached.reads,
    })).toEqual({ status: 'deferred', reason: 'no-measurable-host' })

    const hidden = createFixture({
      hostSize: [800, 600],
      hostRect: rect(0, 0, 0, 0),
    })
    hidden.rendered.delete(hidden.viewport)
    expect(measureAutofitGeometry({
      viewport: hidden.viewport,
      flow: hidden.flow,
      classification: classificationFor(hidden),
      reads: hidden.reads,
    })).toEqual({ status: 'deferred', reason: 'no-measurable-host' })
  })

  it('measures a genuine zero viewport axis using the measurable host scale', () => {
    const fixture = createFixture({
      hostSize: [800, 600],
      hostRect: rect(0, 0, 1600, 1200),
      viewportSize: [100, 0],
      viewportRect: rect(20, 40, 220, 40),
      scrollSize: [100, 10],
    })
    const child = document.createElement('p')
    child.textContent = 'Non-empty'
    fixture.flow.append(child)
    fixture.rendered.add(child)
    fixture.rects.set(child, rect(20, 40, 220, 60))

    const result = measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })

    expect(result).toMatchObject({
      status: 'measured',
      viewportInlineSize: 100,
      viewportBlockSize: 0,
      inlineScale: 2,
      blockScale: 2,
      bounds: {
        minInline: 0,
        maxInline: 100,
        minBlock: 0,
        maxBlock: 10,
      },
      contentBlockExtent: 10,
      emptySpace: 0,
      fits: false,
    })
  })

  it('requires fit on both axes and excludes descendants without a rendered rectangle', () => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(0, 0, 100, 100),
      scrollSize: [101, 80],
    })
    const hidden = document.createElement('div')
    const visible = document.createElement('div')
    fixture.flow.append(hidden, visible)
    fixture.rendered.add(visible)
    fixture.rects.set(hidden, rect(-1000, -1000, 1000, 1000))
    fixture.rects.set(visible, rect(0, 0, 100, 80))
    const readBoundingRect = vi.fn(fixture.reads.readBoundingRect)

    const result = measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: { ...fixture.reads, readBoundingRect },
    })

    expect(result).toMatchObject({
      status: 'measured',
      bounds: { minInline: 0, maxInline: 101, minBlock: 0, maxBlock: 80 },
      emptySpace: 20,
      fits: false,
    })
    expect(readBoundingRect.mock.calls.some(([element]) => element === hidden)).toBe(false)
  })

  it.each([
    {
      name: 'non-finite measurement-host scale',
      mutate: (fixture: ReturnType<typeof createFixture>) => {
        fixture.rects.set(fixture.host, rect(0, 0, Number.POSITIVE_INFINITY, 600))
      },
    },
    {
      name: 'non-positive effective viewport scale',
      mutate: (fixture: ReturnType<typeof createFixture>) => {
        fixture.rects.set(fixture.viewport, rect(10, 20, 10, 120))
      },
    },
    {
      name: 'non-finite descendant rectangle',
      mutate: (fixture: ReturnType<typeof createFixture>) => {
        const child = document.createElement('div')
        fixture.flow.append(child)
        fixture.rendered.add(child)
        fixture.rects.set(child, rect(Number.NaN, 0, 10, 10))
      },
    },
    {
      name: 'non-finite scroll extent',
      mutate: (fixture: ReturnType<typeof createFixture>) => {
        fixture.reads.readScrollExtent = () => ({
          inlineSize: Number.POSITIVE_INFINITY,
          blockSize: 10,
        })
      },
    },
  ])('defers $name geometry instead of producing a fit decision', ({ mutate }) => {
    const fixture = createFixture({
      viewportSize: [100, 100],
      viewportRect: rect(10, 20, 110, 120),
      scrollSize: [100, 100],
    })
    mutate(fixture)

    expect(measureAutofitGeometry({
      viewport: fixture.viewport,
      flow: fixture.flow,
      classification: classificationFor(fixture),
      reads: fixture.reads,
    })).toEqual({ status: 'deferred', reason: 'invalid-host-scale' })
  })
})
