import { describe, expect, it } from 'vitest'

import { classifyAutofitContent } from '../../utils/autofit/classify'
import {
  createAutofitSpacingAdapter,
} from '../../utils/autofit/spacing'

function createFlow(markup: string): HTMLElement {
  const flow = document.createElement('div')
  flow.innerHTML = markup
  document.body.append(flow)
  return flow
}

describe('autofit semantic spacing adapter', () => {
  it('prepares zero-margin intrinsic state and accepts ordered signed adjustments', () => {
    const flow = createFlow('<p>First</p><p id="second">Second</p><p id="third">Third</p>')
    const classification = classifyAutofitContent(flow)
    const adapter = createAutofitSpacingAdapter(classification)

    adapter.prepareIntrinsic()
    expect(flow.querySelector<HTMLElement>('#second')!.style.marginBlockStart)
      .toBe('0px')
    expect(flow.querySelector<HTMLElement>('#third')!.style.marginBlockStart)
      .toBe('0px')

    adapter.applyAdjustments([-3.5, 7.25])
    expect(flow.querySelector<HTMLElement>('#second')!.style.marginBlockStart)
      .toBe('-3.5px')
    expect(flow.querySelector<HTMLElement>('#third')!.style.marginBlockStart)
      .toBe('7.25px')
    expect(() => adapter.applyAdjustments([1])).toThrow(RangeError)
    expect(() => adapter.applyAdjustments([1, Number.NaN])).toThrow(RangeError)
  })

  it('resets every approved root while putting each explicit gap on its sole carrier', () => {
    const flow = createFlow(`
      <p id="first" style="margin-block-start: 9px; margin-block-end: 11px">First</p>
      <ul id="root-list" style="margin-block-start: 4px; margin-block-end: 6px; padding-inline-start: 40px; list-style-type: square">
        <li id="first-item" style="margin-block-start: 3px; margin-block-end: 5px">
          <p id="leading" style="margin-block-start: 2px; margin-block-end: 8px">Leading paragraph</p>
          <p id="extra" style="margin-block-start: 7px; margin-block-end: 9px">Additional paragraph</p>
          <ul id="nested-list" style="margin-block-start: 12px; margin-block-end: 14px; padding-inline-start: 24px; list-style-type: circle">
            <li id="nested-first" style="margin-block-start: 1px; margin-block-end: 2px">Nested first</li>
            <li id="nested-second" style="margin-block-start: 3px; margin-block-end: 4px">Nested second</li>
          </ul>
        </li>
        <li id="second-item" style="margin-block-start: 10px; margin-block-end: 12px">Second</li>
      </ul>
      <blockquote id="quote" style="margin-block-start: 15px; margin-block-end: 17px">
        <p id="quote-copy" style="margin-block-start: 13px; margin-block-end: 19px">Internal quote copy</p>
      </blockquote>
    `)
    const classification = classifyAutofitContent(flow)
    const adapter = createAutofitSpacingAdapter(classification)

    adapter.applyAdjustments(
      classification.boundaries.map(boundary =>
        boundary.kind === 'full' ? 20 : 10),
    )

    const expectedIncoming = new Map(
      classification.boundaries.map(boundary => [
        boundary.carrier,
        boundary.kind === 'full' ? '20px' : '10px',
      ]),
    )
    for (const element of classification.marginResetElements) {
      const styled = element as HTMLElement
      expect(styled.style.marginBlockStart).toBe(expectedIncoming.get(element) ?? '0px')
      expect(styled.style.marginBlockEnd).toBe('0px')
    }

    expect(flow.querySelector<HTMLElement>('#first')!.style.marginBlockStart).toBe('0px')
    expect(flow.querySelector<HTMLElement>('#root-list')!.style.marginBlockStart).toBe('20px')
    expect(flow.querySelector<HTMLElement>('#first-item')!.style.marginBlockStart).toBe('0px')
    expect(flow.querySelector<HTMLElement>('#extra')!.style.marginBlockStart).toBe('10px')
    expect(flow.querySelector<HTMLElement>('#nested-list')!.style.marginBlockStart).toBe('10px')
    expect(flow.querySelector<HTMLElement>('#nested-first')!.style.marginBlockStart).toBe('0px')
    expect(flow.querySelector<HTMLElement>('#nested-second')!.style.marginBlockStart).toBe('10px')
    expect(flow.querySelector<HTMLElement>('#second-item')!.style.marginBlockStart).toBe('20px')
    expect(flow.querySelector<HTMLElement>('#quote')!.style.marginBlockStart).toBe('20px')
  })

  it('establishes list formatting contexts while preserving indentation, markers, and atomic internals', () => {
    const flow = createFlow(`
      <p id="first">First</p>
      <ol id="list" style="padding-inline-start: 42px; list-style-type: upper-roman">
        <li id="item"><p id="leading">Item</p></li>
      </ol>
      <blockquote id="quote" style="border-inline-start: 5px solid red">
        <p id="inside" style="margin-block-start: 13px; margin-block-end: 17px; padding-block-start: 3px; padding-block-end: 4px">Inside</p>
      </blockquote>
    `)
    const classification = classifyAutofitContent(flow)
    const adapter = createAutofitSpacingAdapter(classification)

    adapter.applyAdjustments(
      classification.boundaries.map(boundary =>
        boundary.kind === 'full' ? 16 : 8),
    )

    const list = flow.querySelector<HTMLElement>('#list')!
    const item = flow.querySelector<HTMLElement>('#item')!
    const leading = flow.querySelector<HTMLElement>('#leading')!
    const quote = flow.querySelector<HTMLElement>('#quote')!
    const inside = flow.querySelector<HTMLElement>('#inside')!

    expect(list.style.display).toBe('flow-root')
    expect(list.style.paddingInlineStart).toBe('42px')
    expect(list.style.listStyleType).toBe('upper-roman')
    expect(item.style.display).toBe('')
    expect(item.style.listStyleType).toBe('')
    expect(leading.style.marginBlockStart).toBe('0px')
    expect(leading.style.marginBlockEnd).toBe('0px')
    expect(quote.style.marginBlockStart).toBe('16px')
    expect(quote.style.borderInlineStart).toContain('5px')
    expect(inside.style.marginBlockStart).toBe('13px')
    expect(inside.style.marginBlockEnd).toBe('17px')
    expect(inside.style.paddingBlockStart).toBe('3px')
    expect(inside.style.paddingBlockEnd).toBe('4px')
  })

  it('replaces rather than compounds gaps and restores all authored styles on cleanup', () => {
    const flow = createFlow(`
      <p id="first" style="margin-block-start: 3px">First</p>
      <ul id="list" style="display: block; margin-block-start: 5px; margin-block-end: 7px">
        <li id="item" style="margin-block-start: 9px; margin-block-end: 11px">Item</li>
      </ul>
    `)
    const classification = classifyAutofitContent(flow)
    const adapter = createAutofitSpacingAdapter(classification)
    const first = flow.querySelector<HTMLElement>('#first')!
    const list = flow.querySelector<HTMLElement>('#list')!
    const item = flow.querySelector<HTMLElement>('#item')!

    adapter.applyAdjustments([20])
    expect(list.style.marginBlockStart).toBe('20px')

    adapter.applyAdjustments([12])
    expect(list.style.marginBlockStart).toBe('12px')
    expect(first.style.marginBlockStart).toBe('0px')
    expect(item.style.marginBlockStart).toBe('0px')

    adapter.cleanup()
    adapter.cleanup()
    expect(first.style.marginBlockStart).toBe('3px')
    expect(list.style.display).toBe('block')
    expect(list.style.marginBlockStart).toBe('5px')
    expect(list.style.marginBlockEnd).toBe('7px')
    expect(item.style.marginBlockStart).toBe('9px')
    expect(item.style.marginBlockEnd).toBe('11px')
  })

  it('adopts authored margin and display changes made while generated styles are active', () => {
    const flow = createFlow(`
      <p id="first" style="margin-block-start: 3px; margin-block-end: 4px">First</p>
      <ul id="list" style="display: block; margin-block-start: 5px; margin-block-end: 7px">
        <li id="item" style="margin-block-start: 9px; margin-block-end: 11px">Item</li>
      </ul>
    `)
    const classification = classifyAutofitContent(flow)
    const adapter = createAutofitSpacingAdapter(classification)
    const list = flow.querySelector<HTMLElement>('#list')!
    const item = flow.querySelector<HTMLElement>('#item')!

    adapter.applyAdjustments([20])
    expect(list.style.marginBlockStart).toBe('20px')
    expect(list.style.display).toBe('flow-root')

    list.style.setProperty('margin-block-start', '33px')
    list.style.setProperty('display', 'grid', 'important')
    item.style.setProperty('margin-block-end', '14px')

    adapter.applyAdjustments([12])
    expect(list.style.marginBlockStart).toBe('12px')
    expect(list.style.display).toBe('flow-root')
    expect(item.style.marginBlockEnd).toBe('0px')

    adapter.cleanup()
    expect(list.style.marginBlockStart).toBe('33px')
    expect(list.style.getPropertyPriority('margin-block-start')).toBe('')
    expect(list.style.display).toBe('grid')
    expect(list.style.getPropertyPriority('display')).toBe('important')
    expect(item.style.marginBlockEnd).toBe('14px')
  })
})
