import { beforeEach, describe, expect, expectTypeOf, it } from 'vitest'

import { classifyAutofitContent } from '../../utils/autofit/classify'
import type {
  AutofitGeometryReads,
  AutofitGeometryRect,
  AutofitVisualGapTargets,
  AutofitVisualReads,
} from '../../utils/autofit/types'
import {
  AUTOFIT_VISUAL_GAP_TOLERANCE,
  calculateAutofitCarrierAdjustment,
  calculateAutofitVisualGapTargets,
  measureAutofitVisualBoundaries,
  selectFirstAutofitUnsupported,
  verifyAutofitVisualGaps,
} from '../../utils/autofit/visual-spacing'

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

function createDom(markup: string) {
  const host = document.createElement('section')
  const viewport = document.createElement('div')
  const flow = document.createElement('div')
  flow.innerHTML = markup
  viewport.append(flow)
  host.append(viewport)
  document.body.replaceChildren(host)
  return { host, viewport, flow }
}

function textNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode())
    nodes.push(node as Text)
  return nodes.filter(node => node.data.trim() !== '')
}

function geometryReads(
  host: Element,
  viewport: Element,
  hostRect = rect(0, 0, 800, 600),
  viewportRect = rect(0, 0, 400, 300),
  hostSize: readonly [number, number] = [800, 600],
  viewportSize: readonly [number, number] = [400, 300],
): AutofitGeometryReads {
  const computedStyle = (width: number, height: number) => ({
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
  })
  return {
    readComputedStyle: element => element === host
      ? computedStyle(hostSize[0], hostSize[1])
      : computedStyle(viewportSize[0], viewportSize[1]),
    readBoundingRect: element => element === host
      ? hostRect
      : element === viewport
        ? viewportRect
        : rect(0, 0, 0, 0),
    readClientRectCount: () => 1,
    readScrollExtent: () => ({
      inlineSize: viewportSize[0],
      blockSize: viewportSize[1],
    }),
  }
}

function visualReads(
  fragments: ReadonlyMap<Node, readonly AutofitGeometryRect[]>,
): AutofitVisualReads {
  return {
    readTextRects: node => fragments.get(node) ?? [],
    readElementRect: node => fragments.get(node)?.[0] ?? null,
  }
}

describe('visual target and compensation arithmetic', () => {
  it.each([
    ['small', 0.6],
    ['neutral', 1],
    ['large', 1.4],
  ])('keeps the %s-tier half target exactly one half of full', (_, scale) => {
    const targets = calculateAutofitVisualGapTargets(16, scale)

    expectTypeOf(targets).toEqualTypeOf<AutofitVisualGapTargets>()
    expect(targets.fullTarget).toBe(16 * scale)
    expect(targets.halfTarget).toBe(targets.fullTarget * 0.5)
  })

  it.each([
    { target: 16, intrinsic: 10, expected: 6 },
    { target: 16, intrinsic: 16, expected: 0 },
    { target: 8, intrinsic: 12, expected: -4 },
  ])('computes an unclamped signed adjustment', ({ target, intrinsic, expected }) => {
    expect(calculateAutofitCarrierAdjustment(target, intrinsic)).toBe(expected)
  })

  it.each([
    [Number.NaN, 10],
    [16, Number.POSITIVE_INFINITY],
  ])('rejects non-finite compensation input', (target, intrinsic) => {
    expect(() => calculateAutofitCarrierAdjustment(target, intrinsic))
      .toThrow(RangeError)
  })

  it('accepts both sides of the inclusive 0.5 CSS-pixel tolerance', () => {
    expect(AUTOFIT_VISUAL_GAP_TOLERANCE).toBe(0.5)
    expect(verifyAutofitVisualGaps(
      [{ target: 16 }, { target: 8 }],
      [15.5, 8.5],
    )).toBe(true)
    expect(verifyAutofitVisualGaps(
      [{ target: 16 }, { target: 8 }],
      [15.499, 8.501],
    )).toBe(false)
  })
})

describe('visual ownership rectangle measurement', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('selects multiline extrema and excludes nested and additional units from a parent li', () => {
    const { host, viewport, flow } = createDom(`
      <h2 id="heading">Heading</h2>
      <ul><li id="parent">
        Parent text
        <p id="additional">Additional text</p>
        <ul><li id="nested-a">Nested A</li><li id="nested-b">Nested B</li></ul>
      </li></ul>
    `)
    const byText = new Map(textNodes(flow).map(node => [node.data.trim(), node]))
    const fragments = new Map<Node, readonly AutofitGeometryRect[]>([
      [byText.get('Heading')!, [rect(10, 10, 110, 20), rect(10, 22, 80, 32)]],
      [byText.get('Parent text')!, [rect(20, 50, 120, 60)]],
      [byText.get('Additional text')!, [rect(20, 75, 130, 85)]],
      [byText.get('Nested A')!, [rect(40, 100, 120, 110)]],
      [byText.get('Nested B')!, [rect(40, 125, 120, 135)]],
    ])

    const result = measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: { fullTarget: 20, halfTarget: 10 },
      geometryReads: geometryReads(host, viewport),
      visualReads: visualReads(fragments),
    })

    expect(result.status).toBe('measured')
    if (result.status !== 'measured')
      return
    expect(result.units.map(unit => ({
      root: (unit.ownership.unit.root as HTMLElement).id,
      leading: unit.leading,
      trailing: unit.trailing,
    }))).toEqual([
      { root: 'heading', leading: 10, trailing: 32 },
      { root: 'parent', leading: 50, trailing: 60 },
      { root: 'additional', leading: 75, trailing: 85 },
      { root: 'nested-a', leading: 100, trailing: 110 },
      { root: 'nested-b', leading: 125, trailing: 135 },
    ])
    expect(result.boundaries.map(boundary => ({
      intrinsic: boundary.intrinsicWhitespace,
      target: boundary.target,
      adjustment: boundary.adjustment,
    }))).toEqual([
      { intrinsic: 18, target: 10, adjustment: -8 },
      { intrinsic: 15, target: 10, adjustment: -5 },
      { intrinsic: 15, target: 10, adjustment: -5 },
      { intrinsic: 15, target: 10, adjustment: -5 },
    ])
  })

  it('combines text with inline media, descendant media wrappers, and atomic roots', () => {
    const { host, viewport, flow } = createDom(`
      <p id="mixed">Before <img id="inline" src="inline.png"> after</p>
      <p id="media-only"><a><img id="image" src="image.png"></a></p>
      <blockquote id="atomic" style="padding-block: 30px"><p>Inside</p></blockquote>
    `)
    const [before, after] = textNodes(flow.querySelector('#mixed')!)
    const inline = flow.querySelector('#inline')!
    const image = flow.querySelector('#image')!
    const atomic = flow.querySelector('#atomic')!
    const fragments = new Map<Node, readonly AutofitGeometryRect[]>([
      [before, [rect(0, 10, 40, 20)]],
      [inline, [rect(45, 5, 65, 25)]],
      [after, [rect(70, 12, 100, 22)]],
      [image, [rect(0, 40, 100, 80)]],
      [atomic, [rect(0, 100, 200, 180)]],
    ])

    const result = measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: { fullTarget: 16, halfTarget: 8 },
      geometryReads: geometryReads(host, viewport),
      visualReads: visualReads(fragments),
    })

    expect(result.status).toBe('measured')
    if (result.status !== 'measured')
      return
    expect(result.units.map(({ leading, trailing }) => [leading, trailing])).toEqual([
      [5, 25],
      [40, 80],
      [100, 180],
    ])
    expect(result.boundaries.map(({ intrinsicWhitespace }) => intrinsicWhitespace))
      .toEqual([15, 20])
  })

  it('measures adjacent root items, parent-to-first-nested, and nested siblings in order', () => {
    const { host, viewport, flow } = createDom(`
      <ul>
        <li id="root-a">Root A</li>
        <li id="root-b">Root B
          <ul>
            <li id="nested-a">Nested A</li>
            <li id="nested-b">Nested B</li>
          </ul>
        </li>
      </ul>
    `)
    const byText = new Map(textNodes(flow).map(node => [node.data.trim(), node]))
    const fragments = new Map<Node, readonly AutofitGeometryRect[]>([
      [byText.get('Root A')!, [rect(0, 10, 100, 20)]],
      [byText.get('Root B')!, [rect(0, 40, 100, 50)]],
      [byText.get('Nested A')!, [rect(20, 65, 100, 75)]],
      [byText.get('Nested B')!, [rect(20, 90, 100, 100)]],
    ])

    const result = measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: { fullTarget: 20, halfTarget: 10 },
      geometryReads: geometryReads(host, viewport),
      visualReads: visualReads(fragments),
    })

    expect(result.status).toBe('measured')
    if (result.status !== 'measured')
      return
    expect(result.boundaries.map(boundary => ({
      kind: boundary.kind,
      before: (boundary.preceding.ownership.unit.root as HTMLElement).id,
      after: (boundary.following.ownership.unit.root as HTMLElement).id,
      intrinsic: boundary.intrinsicWhitespace,
    }))).toEqual([
      { kind: 'full', before: 'root-a', after: 'root-b', intrinsic: 20 },
      { kind: 'half', before: 'root-b', after: 'nested-a', intrinsic: 15 },
      { kind: 'half', before: 'nested-a', after: 'nested-b', intrinsic: 15 },
    ])
  })

  it('uses exactly transparent and boxed atomic roots in both boundary directions', () => {
    const { host, viewport, flow } = createDom(`
      <blockquote id="transparent"><p>Ignored descendant</p></blockquote>
      <p id="text">Text</p>
      <table id="boxed"><tbody><tr><td>Ignored cell</td></tr></tbody></table>
    `)
    const transparent = flow.querySelector('#transparent')!
    const text = textNodes(flow.querySelector('#text')!)[0]
    const boxed = flow.querySelector('#boxed')!
    const fragments = new Map<Node, readonly AutofitGeometryRect[]>([
      [transparent, [rect(0, 10, 100, 50)]],
      [text, [rect(0, 70, 100, 80)]],
      [boxed, [rect(0, 100, 100, 150)]],
    ])

    const result = measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: { fullTarget: 20, halfTarget: 10 },
      geometryReads: geometryReads(host, viewport),
      visualReads: visualReads(fragments),
    })

    expect(result.status).toBe('measured')
    if (result.status !== 'measured')
      return
    expect(result.units.map(({ leading, trailing }) => [leading, trailing])).toEqual([
      [10, 50],
      [70, 80],
      [100, 150],
    ])
    expect(result.boundaries.map(({ intrinsicWhitespace }) => intrinsicWhitespace))
      .toEqual([20, 20])
  })

  it('converts fragment rectangles through the shared transformed-host coordinate space', () => {
    const { host, viewport, flow } = createDom('<p>A</p><p>B</p>')
    const [a, b] = textNodes(flow)
    const fragments = new Map<Node, readonly AutofitGeometryRect[]>([
      [a, [rect(115, 65, 265, 80)]],
      [b, [rect(115, 110, 265, 125)]],
    ])
    const result = measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: { fullTarget: 20, halfTarget: 10 },
      geometryReads: geometryReads(
        host,
        viewport,
        rect(0, 0, 1200, 900),
        rect(100, 50, 700, 350),
        [800, 600],
        [400, 200],
      ),
      visualReads: visualReads(fragments),
    })

    expect(result.status).toBe('measured')
    if (result.status !== 'measured')
      return
    expect(result.units.map(({ leading, trailing }) => [leading, trailing])).toEqual([
      [10, 20],
      [40, 50],
    ])
    expect(result.boundaries[0]).toMatchObject({
      intrinsicWhitespace: 20,
      target: 20,
      adjustment: 0,
    })
  })

  it('does not fall back to a non-atomic unit container box', () => {
    const { host, viewport, flow } = createDom('<p>Text without a rect</p>')

    expect(measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: { fullTarget: 16, halfTarget: 8 },
      geometryReads: geometryReads(host, viewport),
      visualReads: {
        readTextRects: () => [],
        readElementRect: () => rect(0, 20, 200, 80),
      },
    })).toMatchObject({
      status: 'unsupported',
      reason: 'visual-rect-missing',
    })
  })

  it('applies missing-rect, target, edge, and adjustment failure precedence', () => {
    const createTwoParagraphs = () => {
      const dom = createDom('<p>A</p><p>B</p>')
      const [a, b] = textNodes(dom.flow)
      return { ...dom, a, b }
    }

    let fixture = createTwoParagraphs()
    expect(measureAutofitVisualBoundaries({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      targets: { fullTarget: Number.POSITIVE_INFINITY, halfTarget: 8 },
      geometryReads: geometryReads(fixture.host, fixture.viewport),
      visualReads: visualReads(new Map([
        [fixture.b, [rect(0, 40, 100, 50)]],
      ])),
    })).toMatchObject({ status: 'unsupported', reason: 'visual-rect-missing' })

    fixture = createTwoParagraphs()
    expect(measureAutofitVisualBoundaries({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      targets: { fullTarget: Number.POSITIVE_INFINITY, halfTarget: 8 },
      geometryReads: geometryReads(fixture.host, fixture.viewport),
      visualReads: visualReads(new Map([
        [fixture.a, [rect(0, 10, 100, 20)]],
        [fixture.b, [rect(0, 40, 100, 50)]],
      ])),
    })).toMatchObject({ status: 'unsupported', reason: 'visual-target-nonfinite' })

    fixture = createTwoParagraphs()
    expect(measureAutofitVisualBoundaries({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      targets: { fullTarget: 16, halfTarget: 8 },
      geometryReads: geometryReads(fixture.host, fixture.viewport),
      visualReads: visualReads(new Map([
        [fixture.a, [rect(0, Number.NaN, 100, 20)]],
        [fixture.b, [rect(0, 40, 100, 50)]],
      ])),
    })).toMatchObject({ status: 'unsupported', reason: 'visual-edge-nonfinite' })

    fixture = createTwoParagraphs()
    const large = Number.MAX_VALUE / 4
    expect(measureAutofitVisualBoundaries({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      targets: { fullTarget: Number.MAX_VALUE, halfTarget: 8 },
      geometryReads: geometryReads(fixture.host, fixture.viewport),
      visualReads: visualReads(new Map([
        [fixture.a, [rect(0, large * 0.9, 100, large)]],
        [fixture.b, [rect(0, -large, 100, -large * 0.9)]],
      ])),
    })).toMatchObject({
      status: 'unsupported',
      reason: 'carrier-adjustment-nonfinite',
    })
  })

  it('lets a later missing rectangle beat an earlier non-finite edge', () => {
    const { host, viewport, flow } = createDom('<p>A</p><p>B</p>')
    const [a] = textNodes(flow)

    expect(measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: { fullTarget: 16, halfTarget: 8 },
      geometryReads: geometryReads(host, viewport),
      visualReads: visualReads(new Map([
        [a, [rect(0, Number.NaN, 100, 20)]],
      ])),
    })).toMatchObject({
      status: 'unsupported',
      reason: 'visual-rect-missing',
      node: flow.querySelectorAll('p')[1],
    })
  })

  it('lets a non-finite target beat an earlier non-finite edge', () => {
    const { host, viewport, flow } = createDom('<p>A</p><p>B</p>')
    const [a, b] = textNodes(flow)

    expect(measureAutofitVisualBoundaries({
      viewport,
      classification: classifyAutofitContent(flow),
      targets: {
        fullTarget: Number.POSITIVE_INFINITY,
        halfTarget: 8,
      },
      geometryReads: geometryReads(host, viewport),
      visualReads: visualReads(new Map([
        [a, [rect(0, Number.NaN, 100, 20)]],
        [b, [rect(0, 40, 100, 50)]],
      ])),
    })).toMatchObject({
      status: 'unsupported',
      reason: 'visual-target-nonfinite',
      node: flow.querySelectorAll('p')[1],
    })
  })
})

describe('unsupported reason precedence', () => {
  it('uses document order first and vocabulary order for one node', () => {
    const flow = document.createElement('div')
    const first = document.createTextNode('first')
    const second = document.createElement('div')
    flow.append(first, second)

    expect(selectFirstAutofitUnsupported([
      { reason: 'list-item-noncontiguous-content', node: second },
      { reason: 'display-contents-root', node: first },
      { reason: 'root-text', node: first },
    ])).toEqual({ reason: 'root-text', node: first })
  })
})
