import { AutofitGeneratedStyleOwner } from './generated-styles'
import type {
  AutofitComputedTypographyStyle,
  AutofitLineHeight,
  AutofitTypographyAdapter,
  AutofitTypographyAdapterOptions,
  AutofitTypographyBaselineEntry,
} from './types'

const MEDIA_TAGS = new Set([
  'AUDIO',
  'CANVAS',
  'EMBED',
  'IFRAME',
  'IMG',
  'OBJECT',
  'PICTURE',
  'SVG',
  'VIDEO',
])

const HEADING_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
])

const CSS_PIXEL_VALUE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))px$/i
const CSS_PRECISION = 1e9

function defaultReadComputedStyle(element: Element): AutofitComputedTypographyStyle {
  const view = element.ownerDocument.defaultView
  if (!view)
    throw new Error('autofit typography requires a document view')

  const style = view.getComputedStyle(element)
  return {
    fontSize: style.fontSize,
    lineHeight: style.lineHeight,
  }
}

function normalizedTagName(element: Element): string {
  return element.localName.toUpperCase()
}

function isMedia(element: Element): boolean {
  return MEDIA_TAGS.has(normalizedTagName(element))
}

function isInHeadingSubtree(element: Element, flow: Element): boolean {
  for (
    let current: Element | null = element;
    current && current !== flow;
    current = current.parentElement
  ) {
    if (HEADING_TAGS.has(normalizedTagName(current)))
      return true
  }

  return false
}

function isPreformatted(element: Element): boolean {
  return normalizedTagName(element) === 'PRE'
}

function isListItem(element: Element): boolean {
  return normalizedTagName(element) === 'LI'
}

function containsScalableText(
  element: Element,
  whitespaceIsSignificant: boolean,
): boolean {
  for (const node of element.childNodes) {
    if (node.nodeType === node.TEXT_NODE) {
      const text = node.nodeValue ?? ''
      if (whitespaceIsSignificant ? text.length > 0 : text.trim() !== '')
        return true
      continue
    }

    if (node.nodeType !== node.ELEMENT_NODE)
      continue

    const child = node as Element
    if (
      !isMedia(child)
      && containsScalableText(
        child,
        whitespaceIsSignificant || isPreformatted(child),
      )
    ) {
      return true
    }
  }

  return false
}

function hasPreformattedAncestor(element: Element, flow: Element): boolean {
  for (
    let current: Element | null = element;
    current && current !== flow;
    current = current.parentElement
  ) {
    if (isPreformatted(current))
      return true
  }

  return false
}

function collectTextBearingElements(
  flow: Element,
  blocks: AutofitTypographyAdapterOptions['displayMathBlocks'],
): Element[] {
  return [...flow.querySelectorAll('*')].filter((element) => {
    const math = blocks?.find(block => block.root === element || block.root.contains(element))
    // Scale the paragraph supplying KaTeX's em base. Its internal font sizes,
    // struts and line heights must continue to be controlled by KaTeX itself.
    if (math)
      return element === math.paragraph
    if (isMedia(element))
      return false

    for (let parent = element.parentElement; parent && parent !== flow; parent = parent.parentElement) {
      if (isMedia(parent))
        return false
    }

    return isListItem(element)
      || containsScalableText(
        element,
        hasPreformattedAncestor(element, flow),
      )
  })
}

function parsePixelValue(value: string, label: string): number {
  const match = CSS_PIXEL_VALUE.exec(value.trim())
  const parsed = match ? Number(match[1]) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new TypeError(`${label} must be a finite non-negative computed pixel value`)
  return parsed
}

function parseLineHeight(value: string): AutofitLineHeight {
  if (value.trim().toLowerCase() === 'normal')
    return 'normal'
  return parsePixelValue(value, 'line height')
}

function formatPixelValue(value: number): string {
  const rounded = Math.round(value * CSS_PRECISION) / CSS_PRECISION
  return `${Object.is(rounded, -0) ? 0 : rounded}px`
}

class DomAutofitTypographyAdapter implements AutofitTypographyAdapter {
  readonly #flow: Element
  readonly #readComputedStyle: AutofitTypographyAdapterOptions['readComputedStyle']
  readonly #displayMathBlocks: AutofitTypographyAdapterOptions['displayMathBlocks']
  readonly #styles = new AutofitGeneratedStyleOwner()
  #baseline: readonly AutofitTypographyBaselineEntry[] | null = null
  #neutralCapturePrepared = false

  constructor(flow: Element, options: AutofitTypographyAdapterOptions) {
    this.#flow = flow
    this.#readComputedStyle = options.readComputedStyle
    this.#displayMathBlocks = options.displayMathBlocks
  }

  prepareNeutralCapture(): void {
    this.#styles.restoreAll()
    this.#neutralCapturePrepared = true
  }

  captureNeutral(): readonly AutofitTypographyBaselineEntry[] {
    this.#baseline = this.inspectNeutral()
    return this.#baseline
  }

  inspectNeutral(): readonly AutofitTypographyBaselineEntry[] {
    if (!this.#neutralCapturePrepared) {
      throw new Error(
        'prepare neutral typography before reading computed styles',
      )
    }
    this.#neutralCapturePrepared = false

    return Object.freeze(collectTextBearingElements(this.#flow, this.#displayMathBlocks).map((element) => {
      const computed = this.#readComputedStyle(element)
      return Object.freeze({
        element,
        fontSize: parsePixelValue(computed.fontSize, 'font size'),
        lineHeight: parseLineHeight(computed.lineHeight),
      })
    }))
  }

  applyTier(
    scale: number,
    baseline: readonly AutofitTypographyBaselineEntry[] | undefined = this.#baseline ?? undefined,
  ): void {
    if (!Number.isFinite(scale) || scale <= 0)
      throw new RangeError('autofit typography scale must be finite and positive')
    if (!baseline)
      throw new Error('autofit neutral typography must be captured before applying a tier')
    this.#neutralCapturePrepared = false

    for (const entry of baseline) {
      const effectiveScale = isInHeadingSubtree(entry.element, this.#flow)
        ? Math.min(scale, 1)
        : scale
      this.#styles.set(
        entry.element,
        'font-size',
        formatPixelValue(entry.fontSize * effectiveScale),
      )
      this.#styles.set(
        entry.element,
        'line-height',
        entry.lineHeight === 'normal'
          ? 'normal'
          : formatPixelValue(entry.lineHeight * effectiveScale),
      )
    }
  }

  cleanup(): void {
    this.#styles.restoreAll()
    this.#neutralCapturePrepared = false
  }
}

export function createAutofitTypographyAdapter(
  flow: Element,
  options: Partial<AutofitTypographyAdapterOptions> = {},
): AutofitTypographyAdapter {
  return new DomAutofitTypographyAdapter(flow, {
    displayMathBlocks: options.displayMathBlocks,
    readComputedStyle: options.readComputedStyle ?? defaultReadComputedStyle,
  })
}
