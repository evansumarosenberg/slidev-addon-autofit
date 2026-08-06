import { beforeEach, describe, expect, it } from 'vitest'

import { classifyAutofitContent } from '../../utils/autofit/classify'
import type {
  AutofitClassification,
  AutofitSemanticUnit,
  AutofitVisualFragment,
} from '../../utils/autofit/types'

function createFlow(markup = ''): HTMLElement {
  const flow = document.createElement('div')
  flow.id = 'flow'
  flow.innerHTML = markup
  document.body.replaceChildren(flow)
  return flow
}

function nodeLabel(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE)
    return '#text'

  const element = node as Element
  return element.id || element.tagName.toLowerCase()
}

function summarizeUnit(unit: AutofitSemanticUnit) {
  return {
    root: nodeLabel(unit.root),
    kind: unit.kind,
    gap: unit.incomingGap,
    carrier: nodeLabel(unit.carrier),
  }
}

function summarize(plan: AutofitClassification) {
  return plan.units.map(summarizeUnit)
}

function resetLabels(plan: AutofitClassification): string[] {
  return plan.marginResetElements.map(nodeLabel).sort()
}

function fragmentLabel(fragment: AutofitVisualFragment): string {
  return fragment.kind === 'text'
    ? fragment.node.data.trim()
    : nodeLabel(fragment.node)
}

describe('classifyAutofitContent', () => {
  beforeEach(() => {
    document.body.replaceChildren()
  })

  it('expands standalone root and nested lists with one carrier per boundary', () => {
    const flow = createFlow(`
      <ul id="root-list">
        <li id="a">Alpha</li>
        <li id="b">
          Beta
          <ul id="nested-list">
            <li id="b1">
              Beta one
              <ol id="deep-list">
                <li id="b1a">Beta one a</li>
              </ol>
            </li>
            <li id="b2">Beta two</li>
          </ul>
        </li>
        <li id="c">Gamma</li>
      </ul>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'a', kind: 'list-item', gap: null, carrier: 'root-list' },
      { root: 'b', kind: 'list-item', gap: 'full', carrier: 'b' },
      { root: 'b1', kind: 'list-item', gap: 'half', carrier: 'nested-list' },
      { root: 'b1a', kind: 'list-item', gap: 'half', carrier: 'deep-list' },
      { root: 'b2', kind: 'list-item', gap: 'half', carrier: 'b2' },
      { root: 'c', kind: 'list-item', gap: 'full', carrier: 'c' },
    ])
    expect(plan.gapCounts).toEqual({ full: 2, half: 3 })
    expect(plan.boundaries.map(boundary => ({
      kind: boundary.kind,
      carrier: nodeLabel(boundary.carrier),
    }))).toEqual([
      { kind: 'full', carrier: 'b' },
      { kind: 'half', carrier: 'nested-list' },
      { kind: 'half', carrier: 'deep-list' },
      { kind: 'half', carrier: 'b2' },
      { kind: 'full', carrier: 'c' },
    ])
    expect(new Set(plan.boundaries.map(boundary => boundary.carrier)).size)
      .toBe(plan.boundaries.length)
    expect(resetLabels(plan)).toEqual([
      'a',
      'b',
      'b1',
      'b1a',
      'b2',
      'c',
      'deep-list',
      'nested-list',
      'root-list',
    ])
  })

  it('keeps heading-started paragraph and root-list groups nested', () => {
    const flow = createFlow(`
      <h2 id="heading">Topic</h2>
      <p id="first-paragraph">First explanation.</p>
      <p id="second-paragraph">Second explanation.</p>
      <ul id="grouped-list">
        <li id="grouped-a">First point</li>
        <li id="grouped-b">Second point</li>
      </ul>
      <p id="after-list">Closing explanation.</p>
      <h3 id="next-heading">Next topic</h3>
      <ol id="next-list">
        <li id="next-a">Another point</li>
        <li id="next-b">Final point</li>
      </ol>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'heading', kind: 'heading', gap: null, carrier: 'heading' },
      { root: 'first-paragraph', kind: 'paragraph', gap: 'half', carrier: 'first-paragraph' },
      { root: 'second-paragraph', kind: 'paragraph', gap: 'half', carrier: 'second-paragraph' },
      { root: 'grouped-a', kind: 'list-item', gap: 'half', carrier: 'grouped-list' },
      { root: 'grouped-b', kind: 'list-item', gap: 'half', carrier: 'grouped-b' },
      { root: 'after-list', kind: 'paragraph', gap: 'half', carrier: 'after-list' },
      { root: 'next-heading', kind: 'heading', gap: 'full', carrier: 'next-heading' },
      { root: 'next-a', kind: 'list-item', gap: 'half', carrier: 'next-list' },
      { root: 'next-b', kind: 'list-item', gap: 'half', carrier: 'next-b' },
    ])
    expect(plan.gapCounts).toEqual({ full: 1, half: 7 })
    expect(resetLabels(plan)).toEqual([
      'after-list',
      'first-paragraph',
      'grouped-a',
      'grouped-b',
      'grouped-list',
      'heading',
      'next-a',
      'next-b',
      'next-heading',
      'next-list',
      'second-paragraph',
    ])
  })

  it('recognizes every heading level and starts a fresh nested text group', () => {
    const markup = Array.from(
      { length: 6 },
      (_, offset) => {
        const level = offset + 1
        return `<h${level} id="h${level}">Heading ${level}</h${level}>
          <p id="p${level}">Paragraph ${level}.</p>`
      },
    ).join('\n')
    const plan = classifyAutofitContent(createFlow(markup))

    expect(summarize(plan)).toEqual(Array.from(
      { length: 6 },
      (_, offset) => {
        const level = offset + 1
        return [
          {
            root: `h${level}`,
            kind: 'heading',
            gap: level === 1 ? null : 'full',
            carrier: `h${level}`,
          },
          {
            root: `p${level}`,
            kind: 'paragraph',
            gap: 'half',
            carrier: `p${level}`,
          },
        ]
      },
    ).flat())
    expect(plan.gapCounts).toEqual({ full: 5, half: 6 })
  })

  it('places a full incoming root-list boundary on the list container', () => {
    const flow = createFlow(`
      <p id="paragraph">Standalone paragraph.</p>
      <ol id="list">
        <li id="first-item">First item</li>
        <li id="second-item">Second item</li>
      </ol>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'paragraph', kind: 'paragraph', gap: null, carrier: 'paragraph' },
      { root: 'first-item', kind: 'list-item', gap: 'full', carrier: 'list' },
      { root: 'second-item', kind: 'list-item', gap: 'full', carrier: 'second-item' },
    ])
    expect(plan.gapCounts).toEqual({ full: 2, half: 0 })
    expect(resetLabels(plan)).toEqual([
      'first-item',
      'list',
      'paragraph',
      'second-item',
    ])
  })

  it('uses full gaps for ordinary top-level paragraphs and lets atomic blocks reset heading groups', () => {
    const flow = createFlow(`
      <p id="opening">Opening.</p>
      <blockquote id="quote"><p>Internal quote paragraph.</p></blockquote>
      <p id="after-quote">After quote.</p>
      <h2 id="heading">Details</h2>
      <p id="nested">Nested detail.</p>
      <pre id="code"><code>const x = 1</code></pre>
      <p id="after-code">After code.</p>
      <table id="table"><tbody><tr><td>Cell</td></tr></tbody></table>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'opening', kind: 'paragraph', gap: null, carrier: 'opening' },
      { root: 'quote', kind: 'atomic', gap: 'full', carrier: 'quote' },
      { root: 'after-quote', kind: 'paragraph', gap: 'full', carrier: 'after-quote' },
      { root: 'heading', kind: 'heading', gap: 'full', carrier: 'heading' },
      { root: 'nested', kind: 'paragraph', gap: 'half', carrier: 'nested' },
      { root: 'code', kind: 'atomic', gap: 'full', carrier: 'code' },
      { root: 'after-code', kind: 'paragraph', gap: 'full', carrier: 'after-code' },
      { root: 'table', kind: 'atomic', gap: 'full', carrier: 'table' },
    ])
    expect(plan.gapCounts).toEqual({ full: 6, half: 1 })
    expect(resetLabels(plan)).toEqual([
      'after-code',
      'after-quote',
      'code',
      'heading',
      'nested',
      'opening',
      'quote',
      'table',
    ])
    expect(plan.marginResetElements).not.toContain(flow.querySelector('#quote p'))
    expect(plan.marginResetElements).not.toContain(flow.querySelector('#code code'))
    expect(plan.marginResetElements).not.toContain(flow.querySelector('#table td'))
  })

  it('treats leading loose-list paragraphs as part of li and additional paragraphs as nested units', () => {
    const flow = createFlow(`
      <ul id="loose-list">
        <li id="loose-a">
          <p id="leading-a">Leading text.</p>
          <p id="additional-a">Additional paragraph.</p>
          <ol id="nested-loose-list">
            <li id="nested-a">
              <p id="nested-leading">Nested leading text.</p>
              <p id="nested-additional">Nested additional paragraph.</p>
            </li>
          </ol>
        </li>
        <li id="loose-b"><p id="leading-b">Second item.</p></li>
      </ul>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'loose-a', kind: 'list-item', gap: null, carrier: 'loose-list' },
      { root: 'additional-a', kind: 'paragraph', gap: 'half', carrier: 'additional-a' },
      { root: 'nested-a', kind: 'list-item', gap: 'half', carrier: 'nested-loose-list' },
      { root: 'nested-additional', kind: 'paragraph', gap: 'half', carrier: 'nested-additional' },
      { root: 'loose-b', kind: 'list-item', gap: 'full', carrier: 'loose-b' },
    ])
    expect(plan.gapCounts).toEqual({ full: 1, half: 3 })
    expect(resetLabels(plan)).toEqual([
      'additional-a',
      'leading-a',
      'leading-b',
      'loose-a',
      'loose-b',
      'loose-list',
      'nested-a',
      'nested-additional',
      'nested-leading',
      'nested-loose-list',
    ])
  })

  it('detects media-only paragraphs and direct media without scaling into their descendants', () => {
    const flow = createFlow(`
      <p id="image-paragraph"><img id="image" src="image.png" alt=""></p>
      <p id="linked-image"><a href="#"><img id="linked-image-node" src="linked.png" alt=""></a></p>
      <p id="captioned-image"><img src="captioned.png" alt=""> Caption text.</p>
      <svg id="diagram"><text>Diagram label</text></svg>
      <video id="video"><source src="video.mp4"></video>
      <figure id="figure"><img src="figure.png" alt=""><figcaption>Caption</figcaption></figure>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'image-paragraph', kind: 'media', gap: null, carrier: 'image-paragraph' },
      { root: 'linked-image', kind: 'media', gap: 'full', carrier: 'linked-image' },
      { root: 'captioned-image', kind: 'paragraph', gap: 'full', carrier: 'captioned-image' },
      { root: 'diagram', kind: 'media', gap: 'full', carrier: 'diagram' },
      { root: 'video', kind: 'media', gap: 'full', carrier: 'video' },
      { root: 'figure', kind: 'atomic', gap: 'full', carrier: 'figure' },
    ])
    expect(plan.gapCounts).toEqual({ full: 5, half: 0 })
    expect(resetLabels(plan)).toEqual([
      'captioned-image',
      'diagram',
      'figure',
      'image-paragraph',
      'linked-image',
      'video',
    ])
    expect(plan.marginResetElements).not.toContain(flow.querySelector('#image'))
    expect(plan.marginResetElements).not.toContain(flow.querySelector('#linked-image-node'))
  })

  it('treats media inside Markdown formatting as atomic and resets an active heading group', () => {
    const flow = createFlow(`
      <h2 id="heading">Media topic</h2>
      <p id="formatted-media">
        <em><strong><a href="#"><img src="formatted.png" alt=""></a></strong></em>
      </p>
      <p id="after-media">After media.</p>
      <h2 id="next-heading">Custom wrapper topic</h2>
      <p id="custom-wrapper-media">
        <custom-inline><img src="custom.png" alt=""></custom-inline>
      </p>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'heading', kind: 'heading', gap: null, carrier: 'heading' },
      { root: 'formatted-media', kind: 'media', gap: 'full', carrier: 'formatted-media' },
      { root: 'after-media', kind: 'paragraph', gap: 'full', carrier: 'after-media' },
      { root: 'next-heading', kind: 'heading', gap: 'full', carrier: 'next-heading' },
      {
        root: 'custom-wrapper-media',
        kind: 'paragraph',
        gap: 'half',
        carrier: 'custom-wrapper-media',
      },
    ])
    expect(plan.gapCounts).toEqual({ full: 3, half: 1 })
  })

  it('classifies Vue-fragment-like siblings while keeping unknown component roots atomic', () => {
    const flow = createFlow(`
      <h2 id="fragment-heading">Fragment heading</h2>
      <!--fragment-start-->
      <p id="fragment-paragraph">Fragment paragraph.</p>
      <my-card id="custom-card">
        <h3 id="internal-heading">Internal heading</h3>
        <p id="internal-paragraph">Internal paragraph.</p>
        <ul><li id="internal-item">Internal item</li></ul>
      </my-card>
      <!--fragment-end-->
      <p id="after-card">After card.</p>
    `)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'fragment-heading', kind: 'heading', gap: null, carrier: 'fragment-heading' },
      { root: 'fragment-paragraph', kind: 'paragraph', gap: 'half', carrier: 'fragment-paragraph' },
      { root: 'custom-card', kind: 'atomic', gap: 'full', carrier: 'custom-card' },
      { root: 'after-card', kind: 'paragraph', gap: 'full', carrier: 'after-card' },
    ])
    expect(plan.gapCounts).toEqual({ full: 2, half: 1 })
    expect(resetLabels(plan)).toEqual([
      'after-card',
      'custom-card',
      'fragment-heading',
      'fragment-paragraph',
    ])
    expect(plan.units.map(unit => unit.root)).not.toContain(flow.querySelector('#internal-heading'))
    expect(plan.units.map(unit => unit.root)).not.toContain(flow.querySelector('#internal-paragraph'))
    expect(plan.units.map(unit => unit.root)).not.toContain(flow.querySelector('#internal-item'))
  })

  it('ignores whitespace, comments, and Slidev click-gap sentinels', () => {
    const flow = createFlow()
    flow.append('\n  ')
    flow.append(document.createComment('v-click-gap'))
    flow.append(document.createComment('v-if'))

    const first = document.createElement('p')
    first.id = 'first'
    first.textContent = 'First'
    flow.append(first, '\n')

    flow.append(document.createComment('slidev-v-click-gap'))

    const clickGap = document.createElement('v-click-gap')
    flow.append(clickGap)

    const second = document.createElement('p')
    second.id = 'second'
    second.textContent = 'Second'
    flow.append(second)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      { root: 'first', kind: 'paragraph', gap: null, carrier: 'first' },
      { root: 'second', kind: 'paragraph', gap: 'full', carrier: 'second' },
    ])
    expect(plan.gapCounts).toEqual({ full: 1, half: 0 })
    expect(plan.unsupported).toEqual([])
  })

  it('reports rootless non-whitespace text without inventing a semantic unit', () => {
    const flow = createFlow()
    const orphanText = document.createTextNode('Rootless custom output')
    const paragraph = document.createElement('p')
    paragraph.id = 'supported-paragraph'
    paragraph.textContent = 'Supported sibling.'
    flow.append(orphanText, paragraph)

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      {
        root: 'supported-paragraph',
        kind: 'paragraph',
        gap: null,
        carrier: 'supported-paragraph',
      },
    ])
    expect(plan.gapCounts).toEqual({ full: 0, half: 0 })
    expect(plan.unsupported).toEqual([
      { reason: 'root-text', node: orphanText },
    ])
  })

  it('reports an unknown display:contents root and never infers its descendants', () => {
    const flow = createFlow(`
      <custom-fragment id="unboxed" style="display: contents">
        <h2 id="unboxed-heading">Not a top-level heading</h2>
        <p id="unboxed-paragraph">Not a top-level paragraph.</p>
      </custom-fragment>
      <p id="supported-paragraph">Supported sibling.</p>
    `)
    const unboxed = flow.querySelector('#unboxed')!

    const plan = classifyAutofitContent(flow)

    expect(summarize(plan)).toEqual([
      {
        root: 'supported-paragraph',
        kind: 'paragraph',
        gap: null,
        carrier: 'supported-paragraph',
      },
    ])
    expect(plan.gapCounts).toEqual({ full: 0, half: 0 })
    expect(plan.unsupported).toEqual([
      { reason: 'display-contents-root', node: unboxed },
    ])
    expect(plan.units.map(unit => unit.root)).not.toContain(flow.querySelector('#unboxed-heading'))
    expect(plan.units.map(unit => unit.root)).not.toContain(flow.querySelector('#unboxed-paragraph'))
    expect(resetLabels(plan)).toEqual(['supported-paragraph'])
  })

  it('is read-only and deterministic, including for semantically empty content', () => {
    const flow = createFlow(`
      <!--v-click-gap-->
      <h2 id="heading">Topic</h2>
      <p id="paragraph">Explanation.</p>
      <ul id="list"><li id="item">Point</li></ul>
    `)
    const before = flow.innerHTML

    const first = classifyAutofitContent(flow)
    const second = classifyAutofitContent(flow)

    expect(summarize(second)).toEqual(summarize(first))
    expect(second.boundaries).toEqual(first.boundaries)
    expect(second.marginResetElements).toEqual(first.marginResetElements)
    expect(second.unsupported).toEqual(first.unsupported)
    expect(flow.innerHTML).toBe(before)

    const empty = classifyAutofitContent(createFlow(' \n <!--v-click-gap--> \n '))
    expect(empty).toMatchObject({
      units: [],
      boundaries: [],
      marginResetElements: [],
      gapCounts: { full: 0, half: 0 },
      unsupported: [],
    })
  })

  it('exposes contiguous visual ownership alongside the semantic carrier plan', () => {
    const flow = createFlow(`
      <h2 id="heading">Topic <img id="heading-icon" src="icon.png"></h2>
      <ul id="list">
        <li id="item">
          Leading <em>copy</em>
          <p id="extra">Additional paragraph.</p>
          <ul id="nested"><li id="nested-item">Nested item.</li></ul>
        </li>
      </ul>
      <blockquote id="quote" style="padding-block: 20px">
        <p>Opaque atomic contents.</p>
      </blockquote>
    `)

    const plan = classifyAutofitContent(flow)

    expect(plan.visual.units.map(ownership => ({
      root: nodeLabel(ownership.unit.root),
      fragments: ownership.fragments.map(fragmentLabel),
    }))).toEqual([
      { root: 'heading', fragments: ['Topic', 'heading-icon'] },
      { root: 'item', fragments: ['Leading', 'copy'] },
      { root: 'extra', fragments: ['Additional paragraph.'] },
      { root: 'nested-item', fragments: ['Nested item.'] },
      { root: 'quote', fragments: ['quote'] },
    ])
    expect(plan.visual.boundaries.map(boundary => ({
      kind: boundary.kind,
      carrier: nodeLabel(boundary.carrier),
      preceding: nodeLabel(boundary.preceding.unit.root),
      following: nodeLabel(boundary.following.unit.root),
    }))).toEqual([
      { kind: 'half', carrier: 'list', preceding: 'heading', following: 'item' },
      { kind: 'half', carrier: 'extra', preceding: 'item', following: 'extra' },
      { kind: 'half', carrier: 'nested', preceding: 'extra', following: 'nested-item' },
      { kind: 'full', carrier: 'quote', preceding: 'nested-item', following: 'quote' },
    ])
    expect(summarize(plan)).toEqual([
      { root: 'heading', kind: 'heading', gap: null, carrier: 'heading' },
      { root: 'item', kind: 'list-item', gap: 'half', carrier: 'list' },
      { root: 'extra', kind: 'paragraph', gap: 'half', carrier: 'extra' },
      { root: 'nested-item', kind: 'list-item', gap: 'half', carrier: 'nested' },
      { root: 'quote', kind: 'atomic', gap: 'full', carrier: 'quote' },
    ])
    expect(plan.visual.unsupported).toEqual([])
  })

  it('reports nested-only and resumed parent content in the visual sidecar only', () => {
    const flow = createFlow(`
      <ul id="list">
        <li id="nested-only">
          <ul><li id="nested-child">Nested child.</li></ul>
        </li>
        <li id="resumed">
          Leading text.
          <p id="additional">Additional paragraph.</p>
          Resumed parent text.
          <span id="resumed-inline">Resumed inline content.</span>
          <section id="resumed-block">Resumed unclassified block.</section>
        </li>
      </ul>
    `)

    const plan = classifyAutofitContent(flow)

    expect(plan.visual.unsupported.map(({ reason, node }) => ({
      reason,
      node: nodeLabel(node),
    }))).toEqual([
      { reason: 'list-item-missing-leading-content', node: 'nested-only' },
      { reason: 'list-item-noncontiguous-content', node: '#text' },
      { reason: 'list-item-noncontiguous-content', node: 'resumed-inline' },
      { reason: 'list-item-noncontiguous-content', node: 'resumed-block' },
    ])
    expect(plan.unsupported).toEqual([])
    expect(plan.gapCounts).toEqual({ full: 1, half: 2 })
  })

  it('keeps block-click split-list DOM as ordinary supported sibling lists', () => {
    const flow = createFlow(`
      <ul id="first-list"><li id="first">First emitted list item.</li></ul>
      <v-click-gap data-slidev-v-click-gap></v-click-gap>
      <ul id="second-list"><li id="second">Second emitted list item.</li></ul>
    `)

    const plan = classifyAutofitContent(flow)

    expect(plan.visual.unsupported).toEqual([])
    expect(summarize(plan)).toEqual([
      { root: 'first', kind: 'list-item', gap: null, carrier: 'first-list' },
      { root: 'second', kind: 'list-item', gap: 'full', carrier: 'second-list' },
    ])
  })
})
