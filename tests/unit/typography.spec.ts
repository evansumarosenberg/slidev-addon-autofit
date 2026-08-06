import { describe, expect, it, vi } from 'vitest'

import { createAutofitTypographyAdapter } from '../../utils/autofit/typography'

interface TypographyStyle {
  readonly fontSize: string
  readonly lineHeight: string
}

function createFlow(markup: string): HTMLElement {
  const flow = document.createElement('div')
  flow.innerHTML = markup
  document.body.append(flow)
  return flow
}

function metricsById(
  defaults: Readonly<Record<string, TypographyStyle>>,
): (element: Element) => TypographyStyle {
  return element => defaults[(element as HTMLElement).id] ?? {
    fontSize: '16px',
    lineHeight: 'normal',
  }
}

describe('autofit typography adapter', () => {
  it('captures and scales text-bearing block, inline, code, quote, table, and custom content', () => {
    const flow = createFlow(`
      <h2 id="heading">Heading</h2>
      <p id="paragraph">Body <strong id="strong">strong</strong></p>
      <blockquote id="quote">Quoted directly</blockquote>
      <table><tbody><tr><td id="cell">Cell</td></tr></tbody></table>
      <pre id="pre">Preformatted</pre>
      <code id="code">Code</code>
      <custom-copy id="custom">Custom text</custom-copy>
    `)
    const adapter = createAutofitTypographyAdapter(flow, {
      readComputedStyle: metricsById({
        heading: { fontSize: '30px', lineHeight: '36px' },
        paragraph: { fontSize: '16px', lineHeight: 'normal' },
        strong: { fontSize: '14px', lineHeight: '21px' },
        quote: { fontSize: '18px', lineHeight: '27px' },
        cell: { fontSize: '12px', lineHeight: '15px' },
        pre: { fontSize: '13px', lineHeight: '19.5px' },
        code: { fontSize: '11px', lineHeight: 'normal' },
        custom: { fontSize: '10px', lineHeight: '12px' },
      }),
    })

    adapter.prepareNeutralCapture()
    const baseline = adapter.captureNeutral()

    expect(baseline
      .filter(entry => (entry.element as HTMLElement).id !== '')
      .map(entry => [
        (entry.element as HTMLElement).id,
        entry.fontSize,
        entry.lineHeight,
      ])).toEqual([
      ['heading', 30, 36],
      ['paragraph', 16, 'normal'],
      ['strong', 14, 21],
      ['quote', 18, 27],
      ['cell', 12, 15],
      ['pre', 13, 19.5],
      ['code', 11, 'normal'],
      ['custom', 10, 12],
    ])

    adapter.applyTier(1.25)

    expect(flow.querySelector<HTMLElement>('#heading')!.style.fontSize).toBe('30px')
    expect(flow.querySelector<HTMLElement>('#heading')!.style.lineHeight).toBe('36px')
    expect(flow.querySelector<HTMLElement>('#paragraph')!.style.fontSize).toBe('20px')
    expect(flow.querySelector<HTMLElement>('#paragraph')!.style.lineHeight).toBe('normal')
    expect(flow.querySelector<HTMLElement>('#strong')!.style.fontSize).toBe('17.5px')
    expect(flow.querySelector<HTMLElement>('#strong')!.style.lineHeight).toBe('26.25px')
    expect(flow.querySelector<HTMLElement>('#quote')!.style.fontSize).toBe('22.5px')
    expect(flow.querySelector<HTMLElement>('#cell')!.style.fontSize).toBe('15px')
    expect(flow.querySelector<HTMLElement>('#pre')!.style.lineHeight).toBe('24.375px')
    expect(flow.querySelector<HTMLElement>('#code')!.style.lineHeight).toBe('normal')
    expect(flow.querySelector<HTMLElement>('#custom')!.style.fontSize).toBe('12.5px')

    adapter.applyTier(1)
    expect(flow.querySelector<HTMLElement>('#heading')!.style.fontSize).toBe('30px')
    expect(flow.querySelector<HTMLElement>('#heading')!.style.lineHeight).toBe('36px')
    expect(flow.querySelector<HTMLElement>('#paragraph')!.style.fontSize).toBe('16px')
    expect(flow.querySelector<HTMLElement>('#paragraph')!.style.lineHeight).toBe('normal')
  })

  it('caps h1 through h6 and their textual descendants at neutral while ordinary and ARIA-only content grows', () => {
    const flow = createFlow(`
      <h1 id="h1">Heading one</h1>
      <h2 id="h2">
        Heading two
        <strong id="heading-inline">inline</strong>
        <custom-copy id="heading-custom">custom</custom-copy>
      </h2>
      <h3 id="h3">Heading three</h3>
      <h4 id="h4">Heading four</h4>
      <h5 id="h5">Heading five</h5>
      <h6 id="h6">Heading six</h6>
      <p id="body">Body <span id="body-inline">inline</span></p>
      <custom-copy id="body-custom">Custom body</custom-copy>
      <div id="aria-heading" role="heading">ARIA-only heading</div>
    `)
    const adapter = createAutofitTypographyAdapter(flow, {
      readComputedStyle: metricsById({
        h1: { fontSize: '36px', lineHeight: '44px' },
        h2: { fontSize: '32px', lineHeight: '40px' },
        h3: { fontSize: '28px', lineHeight: '35px' },
        h4: { fontSize: '24px', lineHeight: '30px' },
        h5: { fontSize: '20px', lineHeight: '25px' },
        h6: { fontSize: '16px', lineHeight: 'normal' },
        'heading-inline': { fontSize: '18px', lineHeight: '24px' },
        'heading-custom': { fontSize: '14px', lineHeight: 'normal' },
        body: { fontSize: '16px', lineHeight: '24px' },
        'body-inline': { fontSize: '12px', lineHeight: '18px' },
        'body-custom': { fontSize: '10px', lineHeight: '15px' },
        'aria-heading': { fontSize: '22px', lineHeight: '28px' },
      }),
    })

    adapter.prepareNeutralCapture()
    adapter.captureNeutral()
    adapter.applyTier(1.25)

    for (const [id, fontSize, lineHeight] of [
      ['h1', '36px', '44px'],
      ['h2', '32px', '40px'],
      ['h3', '28px', '35px'],
      ['h4', '24px', '30px'],
      ['h5', '20px', '25px'],
      ['h6', '16px', 'normal'],
      ['heading-inline', '18px', '24px'],
      ['heading-custom', '14px', 'normal'],
    ]) {
      const element = flow.querySelector<HTMLElement>(`#${id}`)!
      expect(element.style.fontSize).toBe(fontSize)
      expect(element.style.lineHeight).toBe(lineHeight)
    }

    expect(flow.querySelector<HTMLElement>('#body')!.style.fontSize).toBe('20px')
    expect(flow.querySelector<HTMLElement>('#body')!.style.lineHeight).toBe('30px')
    expect(flow.querySelector<HTMLElement>('#body-inline')!.style.fontSize).toBe('15px')
    expect(flow.querySelector<HTMLElement>('#body-inline')!.style.lineHeight).toBe('22.5px')
    expect(flow.querySelector<HTMLElement>('#body-custom')!.style.fontSize).toBe('12.5px')
    expect(flow.querySelector<HTMLElement>('#body-custom')!.style.lineHeight).toBe('18.75px')
    expect(flow.querySelector<HTMLElement>('#aria-heading')!.style.fontSize).toBe('27.5px')
    expect(flow.querySelector<HTMLElement>('#aria-heading')!.style.lineHeight).toBe('35px')

    adapter.applyTier(1)
    expect(flow.querySelector<HTMLElement>('#h1')!.style.fontSize).toBe('36px')
    expect(flow.querySelector<HTMLElement>('#heading-inline')!.style.lineHeight).toBe('24px')
    expect(flow.querySelector<HTMLElement>('#body')!.style.fontSize).toBe('16px')
  })

  it('bounds heading ancestry at the flow and caps only heading subtrees inside it', () => {
    const outerHeading = document.createElement('h2')
    outerHeading.innerHTML = `
      <div id="bounded-flow">
        <p id="bounded-body">Ordinary body</p>
        <h3 id="bounded-heading">
          Inner heading <span id="bounded-heading-inline">inline</span>
        </h3>
      </div>
    `
    document.body.append(outerHeading)
    const flow = outerHeading.querySelector<HTMLElement>('#bounded-flow')!
    const adapter = createAutofitTypographyAdapter(flow, {
      readComputedStyle: metricsById({
        'bounded-body': { fontSize: '16px', lineHeight: '24px' },
        'bounded-heading': { fontSize: '28px', lineHeight: '34px' },
        'bounded-heading-inline': { fontSize: '14px', lineHeight: '20px' },
      }),
    })

    adapter.prepareNeutralCapture()
    adapter.captureNeutral()
    adapter.applyTier(1.5)

    expect(flow.style.fontSize).toBe('')
    expect(flow.querySelector<HTMLElement>('#bounded-body')!.style.fontSize).toBe('24px')
    expect(flow.querySelector<HTMLElement>('#bounded-body')!.style.lineHeight).toBe('36px')
    expect(flow.querySelector<HTMLElement>('#bounded-heading')!.style.fontSize).toBe('28px')
    expect(flow.querySelector<HTMLElement>('#bounded-heading')!.style.lineHeight).toBe('34px')
    expect(flow.querySelector<HTMLElement>('#bounded-heading-inline')!.style.fontSize).toBe('14px')
    expect(flow.querySelector<HTMLElement>('#bounded-heading-inline')!.style.lineHeight).toBe('20px')
  })

  it('shrinks heading roots and descendants at negative tiers while preserving normal line height', () => {
    const flow = createFlow(`
      <h2 id="negative-heading">
        Heading
        <span id="negative-heading-inline">inline</span>
        <code id="negative-heading-normal">normal</code>
      </h2>
      <p id="negative-body">Body</p>
    `)
    const adapter = createAutofitTypographyAdapter(flow, {
      readComputedStyle: metricsById({
        'negative-heading': { fontSize: '32px', lineHeight: '40px' },
        'negative-heading-inline': { fontSize: '20px', lineHeight: '25px' },
        'negative-heading-normal': { fontSize: '16px', lineHeight: 'normal' },
        'negative-body': { fontSize: '18px', lineHeight: '24px' },
      }),
    })

    adapter.prepareNeutralCapture()
    adapter.captureNeutral()
    adapter.applyTier(0.75)

    expect(flow.querySelector<HTMLElement>('#negative-heading')!.style.fontSize).toBe('24px')
    expect(flow.querySelector<HTMLElement>('#negative-heading')!.style.lineHeight).toBe('30px')
    expect(flow.querySelector<HTMLElement>('#negative-heading-inline')!.style.fontSize).toBe('15px')
    expect(flow.querySelector<HTMLElement>('#negative-heading-inline')!.style.lineHeight).toBe('18.75px')
    expect(flow.querySelector<HTMLElement>('#negative-heading-normal')!.style.fontSize).toBe('12px')
    expect(flow.querySelector<HTMLElement>('#negative-heading-normal')!.style.lineHeight).toBe('normal')
    expect(flow.querySelector<HTMLElement>('#negative-body')!.style.fontSize).toBe('13.5px')
    expect(flow.querySelector<HTMLElement>('#negative-body')!.style.lineHeight).toBe('18px')
  })

  it('never writes generated typography or dimensions into media subtrees', () => {
    const flow = createFlow(`
      <p id="copy">Scalable copy</p>
      <img id="image" src="image.png" style="width: 240px; height: 120px; font-size: 9px">
      <picture id="picture"><source srcset="image.webp"><img id="picture-image" src="image.png"></picture>
      <video id="video" style="width: 320px; height: 180px">Fallback text</video>
      <svg id="diagram" width="400" height="200"><text id="diagram-text">Diagram text</text></svg>
    `)
    const readComputedStyle = vi.fn(metricsById({
      copy: { fontSize: '20px', lineHeight: '28px' },
      video: { fontSize: '18px', lineHeight: '24px' },
      'diagram-text': { fontSize: '16px', lineHeight: '20px' },
    }))
    const adapter = createAutofitTypographyAdapter(flow, { readComputedStyle })

    adapter.prepareNeutralCapture()
    const baseline = adapter.captureNeutral()
    adapter.applyTier(1.4)

    expect(baseline.map(entry => (entry.element as HTMLElement).id)).toEqual(['copy'])
    expect(readComputedStyle.mock.calls.map(([element]) => (element as HTMLElement).id)).toEqual(['copy'])
    expect(flow.querySelector<HTMLElement>('#copy')!.style.fontSize).toBe('28px')
    expect(flow.querySelector<HTMLElement>('#image')!.style.cssText).toContain('width: 240px')
    expect(flow.querySelector<HTMLElement>('#image')!.style.cssText).toContain('height: 120px')
    expect(flow.querySelector<HTMLElement>('#image')!.style.fontSize).toBe('9px')
    expect(flow.querySelector<HTMLElement>('#picture-image')!.style.fontSize).toBe('')
    expect(flow.querySelector<HTMLElement>('#video')!.style.width).toBe('320px')
    expect(flow.querySelector<HTMLElement>('#video')!.style.height).toBe('180px')
    expect(flow.querySelector<HTMLElement>('#video')!.style.fontSize).toBe('')
    expect(flow.querySelector<SVGElement>('#diagram')!.style.fontSize).toBe('')
    expect(flow.querySelector<SVGElement>('#diagram-text')!.style.fontSize).toBe('')
  })

  it('reuses one neutral cache across candidates and never compounds scaling', () => {
    const flow = createFlow('<p id="copy">Copy</p>')
    const copy = flow.querySelector<HTMLElement>('#copy')!
    const readComputedStyle = vi.fn(() => ({
      fontSize: '20px',
      lineHeight: '30px',
    }))
    const adapter = createAutofitTypographyAdapter(flow, { readComputedStyle })

    adapter.prepareNeutralCapture()
    expect(readComputedStyle).not.toHaveBeenCalled()
    adapter.captureNeutral()
    adapter.applyTier(1.2)
    expect(copy.style.fontSize).toBe('24px')
    expect(copy.style.lineHeight).toBe('36px')

    adapter.applyTier(0.8)
    expect(copy.style.fontSize).toBe('16px')
    expect(copy.style.lineHeight).toBe('24px')

    adapter.applyTier(1.4)
    expect(copy.style.fontSize).toBe('28px')
    expect(copy.style.lineHeight).toBe('42px')
    expect(readComputedStyle).toHaveBeenCalledTimes(1)
  })

  it('separates neutral restoration writes from reads and adopts authored changes', () => {
    const flow = createFlow(`
      <p id="copy" style="font-size: 17px !important; line-height: 23px">Copy</p>
    `)
    const copy = flow.querySelector<HTMLElement>('#copy')!
    const readComputedStyle = vi.fn(() => {
      return {
        fontSize: copy.style.fontSize,
        lineHeight: copy.style.lineHeight,
      }
    })
    const adapter = createAutofitTypographyAdapter(flow, { readComputedStyle })

    adapter.prepareNeutralCapture()
    adapter.captureNeutral()
    adapter.applyTier(1.2)
    expect(copy.style.fontSize).toBe('20.4px')
    expect(copy.style.lineHeight).toBe('27.6px')

    expect(() => adapter.captureNeutral()).toThrow(/prepare.*neutral/i)
    expect(copy.style.fontSize).toBe('20.4px')

    copy.style.setProperty('font-size', '19px')
    copy.style.setProperty('line-height', '29px', 'important')
    adapter.prepareNeutralCapture()
    expect(readComputedStyle).toHaveBeenCalledTimes(1)
    const recaptured = adapter.captureNeutral()
    expect(readComputedStyle).toHaveBeenCalledTimes(2)
    expect(recaptured).toMatchObject([
      { element: copy, fontSize: 19, lineHeight: 29 },
    ])
    adapter.applyTier(0.8)
    expect(copy.style.fontSize).toBe('15.2px')
    expect(copy.style.lineHeight).toBe('23.2px')

    adapter.cleanup()
    adapter.cleanup()
    expect(copy.style.fontSize).toBe('19px')
    expect(copy.style.getPropertyPriority('font-size')).toBe('')
    expect(copy.style.lineHeight).toBe('29px')
    expect(copy.style.getPropertyPriority('line-height')).toBe('important')
  })

  it('scales list-marker and significant preformatted typography without scaling media', () => {
    const flow = createFlow(`
      <ul>
        <li id="media-item"><img id="fixed-image" src="image.png" style="width: 240px; height: 120px"></li>
        <li id="empty-item"></li>
      </ul>
      <pre id="whitespace-pre">  \n\t  </pre>
    `)
    const adapter = createAutofitTypographyAdapter(flow, {
      readComputedStyle: metricsById({
        'media-item': { fontSize: '18px', lineHeight: '24px' },
        'empty-item': { fontSize: '16px', lineHeight: 'normal' },
        'whitespace-pre': { fontSize: '14px', lineHeight: '20px' },
      }),
    })

    adapter.prepareNeutralCapture()
    const baseline = adapter.captureNeutral()
    adapter.applyTier(1.5)

    expect(baseline.map(entry => (entry.element as HTMLElement).id)).toEqual([
      'media-item',
      'empty-item',
      'whitespace-pre',
    ])
    expect(flow.querySelector<HTMLElement>('#media-item')!.style.fontSize).toBe('27px')
    expect(flow.querySelector<HTMLElement>('#media-item')!.style.lineHeight).toBe('36px')
    expect(flow.querySelector<HTMLElement>('#empty-item')!.style.fontSize).toBe('24px')
    expect(flow.querySelector<HTMLElement>('#empty-item')!.style.lineHeight).toBe('normal')
    expect(flow.querySelector<HTMLElement>('#whitespace-pre')!.style.fontSize).toBe('21px')
    expect(flow.querySelector<HTMLElement>('#whitespace-pre')!.style.lineHeight).toBe('30px')
    expect(flow.querySelector<HTMLElement>('#fixed-image')!.style.width).toBe('240px')
    expect(flow.querySelector<HTMLElement>('#fixed-image')!.style.height).toBe('120px')
    expect(flow.querySelector<HTMLElement>('#fixed-image')!.style.fontSize).toBe('')
  })
})
