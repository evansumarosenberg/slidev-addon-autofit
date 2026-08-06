import { beforeEach, describe, expect, it } from 'vitest'

import { classifyAutofitContent } from '../../utils/autofit/classify'
import { AUTOFIT_FIT_TOLERANCE } from '../../utils/autofit/geometry'
import {
  calculateAutofitPairRelativeRenderedAnchor,
  isAutofitSourceAnchorSnapshotCompatible,
  measureAutofitRenderedCoordinateSpace,
  measureAutofitStartingAlignmentSourceSnapshot,
  measureAutofitStartingLineAnchor,
  resolveAutofitStartingAlignmentCoordinates,
} from '../../utils/autofit/starting-alignment'
import type {
  AutofitComputedBoxStyle,
  AutofitGeometryReads,
  AutofitGeometryRect,
  AutofitVisualReads,
} from '../../utils/autofit/types'

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

function boxStyle(
  width: number,
  height: number,
): AutofitComputedBoxStyle {
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
  }
}

function textNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const nodes: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if ((node as Text).data.trim() !== '')
      nodes.push(node as Text)
  }
  return nodes
}

function visualReads(
  fragments: ReadonlyMap<Node, readonly AutofitGeometryRect[]>,
): AutofitVisualReads {
  return {
    readTextRects: node => fragments.get(node) ?? [],
    readElementRect: node => fragments.get(node)?.[0] ?? null,
  }
}

function createFixture(markup = '<p>First text</p>') {
  const outer = document.createElement('section')
  const pairHost = document.createElement('div')
  const viewport = document.createElement('div')
  const flow = document.createElement('div')
  flow.innerHTML = markup
  viewport.append(flow)
  pairHost.append(viewport)
  outer.append(pairHost)
  document.body.replaceChildren(outer)

  const styles = new Map<Element, AutofitComputedBoxStyle>([
    [outer, boxStyle(800, 600)],
    [pairHost, boxStyle(400, 300)],
    [viewport, boxStyle(200, 100)],
  ])
  const rects = new Map<Element, AutofitGeometryRect>([
    [outer, rect(0, 0, 800, 600)],
    [pairHost, rect(0, 0, 400, 300)],
    [viewport, rect(0, 0, 200, 100)],
  ])
  const reads: AutofitGeometryReads = {
    readComputedStyle: element => styles.get(element) ?? boxStyle(0, 0),
    readBoundingRect: element => rects.get(element) ?? rect(0, 0, 0, 0),
    readClientRectCount: element => rects.has(element) ? 1 : 0,
    readScrollExtent: () => ({ inlineSize: 200, blockSize: 100 }),
  }

  return { outer, pairHost, viewport, flow, styles, rects, reads }
}

describe('starting-line anchor measurement', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it.each([
    ['heading', '<h1>Heading text</h1>'],
    ['paragraph', '<p>Paragraph text</p>'],
    ['list-item text', '<ul><li>List text</li></ul>'],
  ])('uses the first text-line top for a %s', (_, markup) => {
    const fixture = createFixture(markup)
    const [text] = textNodes(fixture.flow)

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([[text, [rect(0, 18, 80, 32)]]])),
    })).toMatchObject({ status: 'measured', anchor: 18 })
  })

  it('selects the earliest first-line edge from multiline and split text fragments', () => {
    const fixture = createFixture('<p><span>Later</span> earliest</p>')
    const [later, earliest] = textNodes(fixture.flow)

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([
        [later, [rect(0, 34, 80, 48), rect(0, 51, 80, 65)]],
        [earliest, [rect(0, 12, 80, 26)]],
      ])),
    })).toMatchObject({ status: 'measured', anchor: 12 })
  })

  it('uses the first rect of a standalone multiline text fragment', () => {
    const fixture = createFixture('<p>Multiline text</p>')
    const [text] = textNodes(fixture.flow)

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([[
        text,
        [rect(0, 18, 80, 32), rect(0, 35, 80, 49)],
      ]])),
    })).toMatchObject({ status: 'measured', anchor: 18 })
  })

  it('keeps text as the anchor when inline media protrudes above it', () => {
    const fixture = createFixture('<p>Text <img></p>')
    const [text] = textNodes(fixture.flow)
    const image = fixture.flow.querySelector('img')!

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([
        [text, [rect(0, 20, 60, 34)]],
        [image, [rect(0, 2, 24, 18)]],
      ])),
    })).toMatchObject({ status: 'measured', anchor: 20 })
  })

  it('uses the first rendered media edge for a media-only first unit', () => {
    const fixture = createFixture('<p><img id="first"><img id="second"></p>')
    const first = fixture.flow.querySelector('#first')!
    const second = fixture.flow.querySelector('#second')!

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([
        [first, [rect(0, 17, 30, 42)]],
        [second, [rect(0, 5, 30, 30)]],
      ])),
    })).toMatchObject({ status: 'measured', anchor: 17 })
  })

  it('uses an atomic root border-box edge without reading descendant text', () => {
    const fixture = createFixture('<blockquote>Atomic text</blockquote>')
    const root = fixture.flow.querySelector('blockquote')!
    const [text] = textNodes(fixture.flow)

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([
        [root, [rect(0, 7, 100, 60)]],
        [text, [rect(0, 30, 90, 44)]],
      ])),
    })).toMatchObject({ status: 'measured', anchor: 7 })
  })

  it('excludes nested separately owned units and generated list-marker geometry', () => {
    const fixture = createFixture('<ul><li>Leading<ul><li>Nested</li></ul></li></ul>')
    const [leading, nested] = textNodes(fixture.flow)
    const item = fixture.flow.querySelector('li')!

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([
        [leading, [rect(0, 21, 80, 35)]],
        [nested, [rect(0, 1, 80, 15)]],
        [item, [rect(0, 3, 100, 40)]],
      ])),
    })).toMatchObject({ status: 'measured', anchor: 21 })
  })

  it('retains typed missing and non-finite visual failures', () => {
    const fixture = createFixture('<p>Text <img></p>')
    const [text] = textNodes(fixture.flow)
    const image = fixture.flow.querySelector('img')!
    const classification = classifyAutofitContent(fixture.flow)

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification,
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([[image, [rect(0, 5, 20, 20)]]])),
    })).toMatchObject({
      status: 'unsupported',
      reason: 'visual-rect-missing',
      node: classification.visual.units[0].unit.root,
    })

    expect(measureAutofitStartingLineAnchor({
      viewport: fixture.viewport,
      classification,
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([[text, [rect(0, Number.NaN, 20, 20)]]])),
    })).toMatchObject({
      status: 'unsupported',
      reason: 'visual-edge-nonfinite',
      node: classification.visual.units[0].unit.root,
    })
  })
})

describe('rendered coordinate snapshots', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it.each([
    ['zero', 0],
    ['positive', 15],
    ['negative', -12],
  ])('measures a %s signed viewport origin in the pair host', (_, origin) => {
    const fixture = createFixture()
    fixture.styles.set(fixture.pairHost, boxStyle(400, 200))
    fixture.rects.set(fixture.pairHost, rect(40, 100, 640, 400))
    fixture.styles.set(fixture.viewport, boxStyle(200, 100))
    fixture.rects.set(fixture.viewport, rect(60, 100 + origin, 460, 300 + origin))

    expect(measureAutofitRenderedCoordinateSpace({
      viewport: fixture.viewport,
      pairHost: fixture.pairHost,
      geometryReads: fixture.reads,
    })).toEqual({
      status: 'measured',
      coordinate: {
        viewportBlockOrigin: origin,
        viewportBlockScale: 2,
        viewportBlockSize: 100,
        pairHostBlockScale: 1.5,
      },
    })
  })

  it('captures a source anchor with its source-local and pair-host geometry', () => {
    const fixture = createFixture('<p>Source</p>')
    fixture.rects.set(fixture.pairHost, rect(0, 40, 600, 490))
    fixture.rects.set(fixture.viewport, rect(0, 70, 400, 270))
    const [text] = textNodes(fixture.flow)

    expect(measureAutofitStartingAlignmentSourceSnapshot({
      viewport: fixture.viewport,
      pairHost: fixture.pairHost,
      classification: classifyAutofitContent(fixture.flow),
      geometryReads: fixture.reads,
      visualReads: visualReads(new Map([[text, [rect(0, 110, 80, 138)]]])),
    })).toEqual({
      status: 'measured',
      snapshot: {
        localAnchor: 20,
        viewportBlockOrigin: 30,
        viewportBlockScale: 2,
        viewportBlockSize: 100,
        pairHostBlockScale: 1.5,
      },
    })
  })

  it('keeps unavailable viewport or pair-host geometry deferred', () => {
    const disconnected = createFixture()
    disconnected.outer.remove()
    expect(measureAutofitRenderedCoordinateSpace({
      viewport: disconnected.viewport,
      pairHost: disconnected.pairHost,
      geometryReads: disconnected.reads,
    })).toEqual({ status: 'deferred', reason: 'no-measurable-host' })

    const invalidPairHost = createFixture()
    invalidPairHost.rects.set(invalidPairHost.pairHost, rect(0, 0, 400, 0))
    expect(measureAutofitStartingAlignmentSourceSnapshot({
      viewport: invalidPairHost.viewport,
      pairHost: invalidPairHost.pairHost,
      classification: classifyAutofitContent(invalidPairHost.flow),
      geometryReads: invalidPairHost.reads,
    })).toEqual({ status: 'deferred', reason: 'invalid-host-scale' })
  })

  it.each([
    ['signed origin', 'viewportBlockOrigin'],
    ['source viewport scale', 'viewportBlockScale'],
    ['source local block size', 'viewportBlockSize'],
    ['pair-host scale', 'pairHostBlockScale'],
  ] as const)('accepts exact and +/- tolerance %s snapshot geometry but rejects larger changes', (_, coordinate) => {
    const snapshot = {
      localAnchor: 10,
      viewportBlockOrigin: 10,
      viewportBlockScale: 1.5,
      viewportBlockSize: 100,
      pairHostBlockScale: 2,
    }
    const current = {
      viewportBlockOrigin: snapshot.viewportBlockOrigin,
      viewportBlockScale: snapshot.viewportBlockScale,
      viewportBlockSize: snapshot.viewportBlockSize,
      pairHostBlockScale: snapshot.pairHostBlockScale,
    }

    expect(AUTOFIT_FIT_TOLERANCE).toBe(0.5)
    for (const difference of [
      0,
      AUTOFIT_FIT_TOLERANCE / 2,
      -AUTOFIT_FIT_TOLERANCE / 2,
      AUTOFIT_FIT_TOLERANCE,
      -AUTOFIT_FIT_TOLERANCE,
    ]) {
      expect(isAutofitSourceAnchorSnapshotCompatible(snapshot, {
        ...current,
        [coordinate]: snapshot[coordinate] + difference,
      })).toBe(true)
    }

    for (const difference of [
      AUTOFIT_FIT_TOLERANCE + 0.001,
      -(AUTOFIT_FIT_TOLERANCE + 0.001),
    ]) {
      expect(isAutofitSourceAnchorSnapshotCompatible(snapshot, {
        ...current,
        [coordinate]: snapshot[coordinate] + difference,
      })).toBe(false)
    }
  })

  it('rejects non-finite origins, anchors, and non-positive snapshot sizes or scales as deferred work', () => {
    const source = {
      localAnchor: 10,
      viewportBlockOrigin: 0,
      viewportBlockScale: 1.5,
      viewportBlockSize: 100,
      pairHostBlockScale: 2,
    }
    const current = {
      viewportBlockOrigin: 0,
      viewportBlockScale: 1.5,
      viewportBlockSize: 100,
      pairHostBlockScale: 2,
    }
    const target = {
      localAnchor: 5,
      viewportBlockOrigin: 0,
      viewportBlockScale: 2,
      viewportBlockSize: 80,
      pairHostBlockScale: 2,
    }

    for (const invalid of [
      { ...source, localAnchor: Number.NaN },
      { ...source, viewportBlockOrigin: Number.POSITIVE_INFINITY },
      { ...source, viewportBlockScale: 0 },
      { ...source, viewportBlockSize: 0 },
      { ...source, pairHostBlockScale: -1 },
    ]) {
      expect(isAutofitSourceAnchorSnapshotCompatible(invalid, current)).toBe(false)
      expect(resolveAutofitStartingAlignmentCoordinates({
        source: invalid,
        currentSource: current,
        target,
      })).toEqual({ status: 'deferred', reason: 'invalid-host-scale' })
    }
  })

  it('converts pair-relative rendered anchors and a differing target scale exactly', () => {
    expect(calculateAutofitPairRelativeRenderedAnchor({
      localAnchor: 10,
      viewportBlockOrigin: -12,
      viewportBlockScale: 1.5,
      viewportBlockSize: 100,
      pairHostBlockScale: 0.75,
    })).toBe(3)

    expect(resolveAutofitStartingAlignmentCoordinates({
      source: {
        localAnchor: 10,
        viewportBlockOrigin: 12,
        viewportBlockScale: 1.5,
        viewportBlockSize: 100,
        pairHostBlockScale: 2,
      },
      currentSource: {
        viewportBlockOrigin: 12,
        viewportBlockScale: 1.5,
        viewportBlockSize: 100,
        pairHostBlockScale: 2,
      },
      target: {
        localAnchor: 5,
        viewportBlockOrigin: 10,
        viewportBlockScale: 2,
        viewportBlockSize: 80,
        pairHostBlockScale: 2,
      },
    })).toEqual({
      status: 'measured',
      sourceRenderedAnchor: 27,
      targetRenderedAnchor: 20,
      renderedDelta: 7,
      targetLocalDelta: 3.5,
    })
  })
})
