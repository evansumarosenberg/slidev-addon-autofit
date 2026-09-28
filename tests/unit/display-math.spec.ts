import { describe, expect, it } from 'vitest'
import { classifyAutofitContent } from '../../utils/autofit/classify'
import { createAutofitSpacingAdapter } from '../../utils/autofit/spacing'
import { createAutofitTypographyAdapter } from '../../utils/autofit/typography'
import { measureAutofitGeometry } from '../../utils/autofit/geometry'
import { areAutofitClassificationSignaturesEqual, createAutofitClassificationSignature } from '../../utils/autofit/static-fit'

const display = `<div class="slidev-katex-wrapper"><p style="margin-block: 12px"><span class="katex-display" style="margin-block: 1em"><span class="katex"><span class="katex-mathml"><math><mi>x</mi></math></span><span class="katex-html"><span class="base">x</span></span></span></span></p></div>`

function flow() {
  const element = document.createElement('div')
  element.innerHTML = `<p>Before <span class="katex"><span class="katex-html">x</span></span></p>${display}<ul><li>After</li></ul>`
  document.body.append(element)
  return element
}

describe('managed display math', () => {
  it('keeps existing semantics while owning only display block margins and visual edges', () => {
    const element = flow()
    const legacy = classifyAutofitContent(element)
    const managed = classifyAutofitContent(element, { displayMath: true })
    expect(managed.units).toEqual(legacy.units)
    expect(managed.boundaries).toEqual(legacy.boundaries)
    expect(managed.gapCounts).toEqual({ full: 2, half: 0 })
    expect(managed.visual.units[0]).toEqual(legacy.visual.units[0])
    expect(managed.visual.units[2]).toEqual(legacy.visual.units[2])
    expect(managed.displayMathBlocks).toHaveLength(1)
    expect(managed.visual.units[1].fragments[0].node)
      .toBe(element.querySelector('.slidev-katex-wrapper .katex-html'))
    expect(legacy.displayMathBlocks).toBeUndefined()
    const paragraph = element.querySelector<HTMLElement>('.slidev-katex-wrapper > p')!
    const before = paragraph.style.cssText
    const spacing = createAutofitSpacingAdapter(managed)
    spacing.prepareIntrinsic()
    expect(paragraph.style.marginBlockStart).toBe('0px')
    spacing.cleanup()
    expect(paragraph.style.cssText).toBe(before)
  })

  it('does not opt inline math or unrelated wrappers into display handling', () => {
    const element = flow()
    element.querySelector('.slidev-katex-wrapper')!.className = 'custom-wrapper'
    expect(classifyAutofitContent(element, { displayMath: true }))
      .toEqual(classifyAutofitContent(element))
  })

  it('scales only the display paragraph and leaves inline math on the existing path', () => {
    const element = flow()
    const blocks = classifyAutofitContent(element, { displayMath: true }).displayMathBlocks!
    const internal = element.querySelector<HTMLElement>('.slidev-katex-wrapper .base')!
    internal.style.fontSize = '0.7em'
    const adapter = createAutofitTypographyAdapter(element, {
      displayMathBlocks: blocks,
      readComputedStyle: () => ({ fontSize: '20px', lineHeight: '24px' }),
    })
    adapter.prepareNeutralCapture()
    const baseline = adapter.captureNeutral()
    expect(baseline.filter(entry => blocks[0].root.contains(entry.element))
      .map(entry => entry.element)).toEqual([blocks[0].paragraph])
    adapter.applyTier(1.4)
    expect((blocks[0].paragraph as HTMLElement).style.fontSize).toBe('28px')
    expect(internal.style.fontSize).toBe('0.7em')
    expect(element.querySelector<HTMLElement>('p > .katex')!.style.fontSize).toBe('28px')
    adapter.cleanup()
    expect((blocks[0].paragraph as HTMLElement).style.fontSize).toBe('')
    expect(internal.style.fontSize).toBe('0.7em')
  })

  it('rejects retained math measurements when the inner rendered tree is replaced', () => {
    const element = flow()
    const previous = createAutofitClassificationSignature(classifyAutofitContent(element, { displayMath: true }))
    const visual = element.querySelector('.slidev-katex-wrapper .katex-html')!
    visual.replaceWith(visual.cloneNode(true))
    const next = createAutofitClassificationSignature(classifyAutofitContent(element, { displayMath: true }))
    expect(areAutofitClassificationSignaturesEqual(previous, next)).toBe(false)
  })

  it('ignores clipped math internals but measures genuine visual overflow', () => {
    const element = flow()
    const host = document.createElement('div')
    const viewport = document.createElement('div')
    document.body.append(host)
    host.append(viewport)
    viewport.append(element)
    const hidden = element.querySelector('mi')!
    const line = element.querySelector('.slidev-katex-wrapper .base')!
    let lineWidth = 100
    const reads = {
      readComputedStyle: () => ({ width: '500px', height: '300px', display: 'block', position: 'static',
        transform: 'none', translate: 'none', rotate: 'none', scale: 'none',
        marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }),
      readBoundingRect: (node: Element) => {
        const width = node === hidden ? 10000 : node === line ? lineWidth : 500
        return { left: 0, right: width, top: 0, bottom: 300, width, height: 300 }
      },
      readClientRectCount: () => 1,
      readScrollExtent: () => ({ inlineSize: 500, blockSize: 300 }),
    }
    const measure = (managed: boolean) => measureAutofitGeometry({
      viewport, flow: element, reads,
      classification: classifyAutofitContent(element, { displayMath: managed }),
    })
    expect(measure(false)).toMatchObject({ status: 'measured', fits: false })
    expect(measure(true)).toMatchObject({ status: 'measured', fits: true })
    lineWidth = 600
    expect(measure(true)).toMatchObject({ status: 'measured', fits: false })
  })
})
