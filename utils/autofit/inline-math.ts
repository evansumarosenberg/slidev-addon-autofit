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

/** The line boxes include radicals/fractions without their clipped construction paths. */
export function inlineMathGeometryElements(math: AutofitInlineMath): readonly Element[] {
  return [math.root, math.visual, ...math.visual.children]
}
