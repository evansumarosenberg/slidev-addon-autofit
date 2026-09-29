import { describe, expect, it } from 'vitest'
import { classifyAutofitContent } from '../../utils/autofit/classify'
import { measureAutofitGeometry } from '../../utils/autofit/geometry'
import { readAutofitInlineMath } from '../../utils/autofit/inline-math'
import { areAutofitClassificationSignaturesEqual, createAutofitClassificationSignature } from '../../utils/autofit/static-fit'

const inline = `<span class="katex"><span class="katex-mathml"><math><mi>x</mi></math></span><span class="katex-html"><span class="base"><span>x</span><svg><path /></svg></span></span></span>`

function fixture() {
  const host = document.createElement('div')
  const viewport = document.createElement('div')
  const flow = document.createElement('div')
  flow.innerHTML = `<p>Length: ${inline} after.</p><ul><li>Reciprocal: ${inline}.</li></ul>`
  document.body.append(host)
  host.append(viewport)
  viewport.append(flow)
  return { viewport, flow }
}

describe('managed inline math geometry', () => {
  it('keeps paragraph/list ownership and spacing without requiring display blocks', () => {
    const { flow } = fixture()
    const legacy = classifyAutofitContent(flow)
    const managed = classifyAutofitContent(flow, { displayMath: true })
    expect(managed.inlineMath).toHaveLength(2)
    expect(legacy.inlineMath).toBeUndefined()
    expect(managed.units).toEqual(legacy.units)
    expect(managed.boundaries).toEqual(legacy.boundaries)
    expect(managed.marginResetElements).toEqual(legacy.marginResetElements)
    expect(managed.visual).toEqual(legacy.visual)
    expect(managed.displayMathBlocks).toBeUndefined()
  })

  it('leaves display math and incomplete lookalikes on their existing paths', () => {
    const { flow } = fixture()
    const root = flow.querySelector('.katex')!
    expect(readAutofitInlineMath(root)).not.toBeNull()
    root.parentElement!.classList.add('katex-display')
    expect(readAutofitInlineMath(root)).toBeNull()
    root.parentElement!.classList.remove('katex-display')
    root.querySelector('.katex-mathml')!.remove()
    expect(readAutofitInlineMath(root)).toBeNull()
  })

  it('ignores hidden internal bounds while retaining real bounds and unrelated SVG overflow', () => {
    const { viewport, flow } = fixture()
    const line = flow.querySelector('.base')!
    const internal = new Set(flow.querySelectorAll('mi, path'))
    let lineBounds = { left: 20, right: 120, top: 20, bottom: 60 }
    let scrollWidth = 500
    const reads = {
      readComputedStyle: () => ({ width: '500px', height: '300px', display: 'inline', position: 'static',
        transform: 'none', translate: 'none', rotate: 'none', scale: 'none',
        marginTop: '0px', marginRight: '0px', marginBottom: '0px', marginLeft: '0px' }),
      readBoundingRect: (element: Element) => {
        const bounds = internal.has(element)
          ? { left: -5000, right: 10000, top: -5000, bottom: 10000 }
          : element === line ? lineBounds : { left: 0, right: 500, top: 0, bottom: 300 }
        return { ...bounds, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top }
      },
      readClientRectCount: () => 1,
      readScrollExtent: () => ({ inlineSize: scrollWidth, blockSize: 300 }),
    }
    const measure = (managed = true) => measureAutofitGeometry({
      viewport, flow, reads, classification: classifyAutofitContent(flow, { displayMath: managed }),
    })
    expect(measure(false)).toMatchObject({ status: 'measured', fits: false })
    expect(measure()).toMatchObject({ status: 'measured', fits: true })
    for (const bounds of [
      { left: 20, right: 600, top: 20, bottom: 60 },
      { left: -10, right: 120, top: 20, bottom: 60 },
      { left: 20, right: 120, top: -10, bottom: 60 },
      { left: 20, right: 120, top: 20, bottom: 310 },
    ]) {
      lineBounds = bounds
      expect(measure()).toMatchObject({ status: 'measured', fits: false })
    }
    lineBounds = { left: 20, right: 120, top: 20, bottom: 60 }
    scrollWidth = 600
    expect(measure()).toMatchObject({ status: 'measured', fits: false })
    scrollWidth = 500
    flow.append(flow.querySelector('svg')!.cloneNode(true))
    internal.add(flow.lastElementChild!.querySelector('path')!)
    expect(measure()).toMatchObject({ status: 'measured', fits: false })
  })

  it.each(['.katex-html', '.base'])('invalidates retained geometry when %s is replaced', (selector) => {
    const { flow } = fixture()
    const signature = () => createAutofitClassificationSignature(classifyAutofitContent(flow, { displayMath: true }))
    const before = signature()
    expect(areAutofitClassificationSignaturesEqual(before, signature())).toBe(true)
    const element = flow.querySelector(selector)!
    element.replaceWith(element.cloneNode(true))
    expect(areAutofitClassificationSignaturesEqual(before, signature())).toBe(false)
  })
})
