/** A complete Slidev display block; inline KaTeX is deliberately not recognized. */
export interface AutofitDisplayMathBlock {
  readonly root: Element
  readonly paragraph: Element
  readonly display: Element
  readonly katex: Element
  readonly visual: Element
}

export function readAutofitDisplayMathBlock(root: Element): AutofitDisplayMathBlock | null {
  if (!root.matches('div.slidev-katex-wrapper') || root.children.length !== 1)
    return null
  const paragraph = root.firstElementChild!
  if (!paragraph.matches('p') || paragraph.children.length !== 1)
    return null
  const display = paragraph.firstElementChild!
  if (!display.matches('span.katex-display') || display.children.length !== 1)
    return null
  const katex = display.firstElementChild!
  if (!katex.matches('span.katex'))
    return null
  const visual = katex.querySelector(':scope > .katex-html')
  return visual ? { root, paragraph, display, katex, visual } : null
}

/** KaTeX's line boxes contain its struts, fractions, SVG rules and equation tags. */
export function displayMathGeometryElements(block: AutofitDisplayMathBlock): readonly Element[] {
  return [block.root, block.paragraph, block.display, block.katex,
    block.visual, ...block.visual.children]
}
