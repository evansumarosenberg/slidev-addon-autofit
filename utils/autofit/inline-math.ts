import type { AutofitComputedBoxStyle } from './types'

/** Inline KaTeX keeps its paragraph/list semantics and existing typography. */
export interface AutofitInlineMath {
  readonly root: Element
  readonly visual: Element
}

export function readAutofitInlineMath(root: Element): AutofitInlineMath | null {
  if (!root.matches('span.katex') || root.closest('.katex-display'))
    return null
  const visual = root.querySelector(':scope > span.katex-html')
  const accessible = root.querySelector(':scope > span.katex-mathml > math')
  if (!visual || !accessible || root.children.length !== 2 || visual.children.length === 0)
    return null
  return { root, visual }
}

/** Include painted overhangs, but not empty struts and vertical positioning boxes. */
export function inlineMathGeometryElements(
  math: AutofitInlineMath,
  readStyle: (element: Element) => AutofitComputedBoxStyle,
): readonly Element[] {
  const elements = new Set([math.root, math.visual, ...math.visual.children])
  for (const element of math.visual.querySelectorAll('*')) {
    const hasText = [...element.childNodes].some(node =>
      node.nodeType === 3 && node.textContent?.trim())
    const style = readStyle(element)
    const hasBorder = [style.borderTopWidth, style.borderRightWidth,
      style.borderBottomWidth, style.borderLeftWidth]
      .some(width => Number.parseFloat(width ?? '') > 0)
    const hasBackground = style.backgroundColor
      && style.backgroundColor !== 'transparent'
      && style.backgroundColor !== 'rgba(0, 0, 0, 0)'
    if (hasText || hasBorder || hasBackground || element.namespaceURI === 'http://www.w3.org/2000/svg')
      elements.add(element)
  }
  return [...elements]
}
