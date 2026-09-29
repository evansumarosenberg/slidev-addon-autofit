import { displayMathGeometryElements } from './display-math'
import { inlineMathGeometryElements } from './inline-math'
import type {
  AutofitClassification,
  AutofitComputedBoxStyle,
  AutofitContentBounds,
  AutofitGeometryMeasurement,
  AutofitGeometryMeasurementOptions,
  AutofitGeometryReads,
  AutofitGeometryRect,
  AutofitLocalCoordinateSpace,
  AutofitLocalCoordinateSpaceMeasurement,
} from './types'

export const AUTOFIT_FIT_TOLERANCE = 0.5

interface MeasurableHost {
  readonly element: Element
  readonly inlineScale: number
  readonly blockScale: number
}

interface MeasurementHostSearch {
  readonly host: MeasurableHost | null
  readonly reason?: 'no-measurable-host' | 'invalid-host-scale'
}

const CSS_PIXEL_VALUE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))px$/i
const AUTOFIT_MEDIA_TAGS = new Set([
  'audio',
  'canvas',
  'embed',
  'iframe',
  'img',
  'object',
  'picture',
  'svg',
  'video',
])

function emptyComputedBoxStyle(): AutofitComputedBoxStyle {
  return {
    width: '',
    height: '',
    display: '',
    position: '',
    transform: '',
    translate: '',
    rotate: '',
    scale: '',
    marginTop: '',
    marginRight: '',
    marginBottom: '',
    marginLeft: '',
  }
}

function defaultReadComputedStyle(element: Element): AutofitComputedBoxStyle {
  const view = element.ownerDocument.defaultView
  if (!view)
    return emptyComputedBoxStyle()

  const style = view.getComputedStyle(element)
  return {
    overflowX: style.overflowX,
    overflowY: style.overflowY,
    borderTopWidth: style.borderTopWidth,
    borderRightWidth: style.borderRightWidth,
    borderBottomWidth: style.borderBottomWidth,
    borderLeftWidth: style.borderLeftWidth,
    backgroundColor: style.backgroundColor,
    width: style.width,
    height: style.height,
    display: style.display,
    position: style.position,
    transform: style.transform,
    translate: style.translate,
    rotate: style.rotate,
    scale: style.scale,
    marginTop: style.marginTop,
    marginRight: style.marginRight,
    marginBottom: style.marginBottom,
    marginLeft: style.marginLeft,
  }
}

function copyRect(source: DOMRect): AutofitGeometryRect {
  return {
    left: source.left,
    right: source.right,
    top: source.top,
    bottom: source.bottom,
    width: source.width,
    height: source.height,
  }
}

const DEFAULT_GEOMETRY_READS: AutofitGeometryReads = {
  readComputedStyle: defaultReadComputedStyle,
  readBoundingRect: element => copyRect(element.getBoundingClientRect()),
  readClientRectCount: element => element.getClientRects().length,
  readScrollExtent: (element) => {
    const scrollable = element as Element & {
      readonly scrollWidth?: number
      readonly scrollHeight?: number
    }
    return {
      inlineSize: scrollable.scrollWidth ?? 0,
      blockSize: scrollable.scrollHeight ?? 0,
    }
  },
}

export function isAutofitViewportRenderable(viewport: Element): boolean {
  if (!viewport.isConnected)
    return false

  const view = viewport.ownerDocument.defaultView
  if (!view)
    return true

  for (
    let element: Element | null = viewport;
    element;
    element = getComposedParentElement(element)
  ) {
    const style = view.getComputedStyle(element)
    if (
      style.display === 'none'
      || style.getPropertyValue('content-visibility').trim() === 'hidden'
    ) {
      return false
    }
  }

  return true
}

function parseNonNegativeComputedPixel(value: string): number | null {
  const match = CSS_PIXEL_VALUE.exec(value.trim())
  if (!match)
    return null
  const parsed = Number(match[1])
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function deriveOwnedTextFormattingElements(
  classification: AutofitClassification,
): ReadonlySet<Element> {
  const excluded = new Set<Element>()
  for (const unit of classification.units) {
    excluded.add(unit.root)
    excluded.add(unit.carrier)
  }

  const candidates = new Set<Element>()
  for (const ownership of classification.visual.units) {
    const { unit } = ownership
    if (
      unit.kind !== 'heading'
      && unit.kind !== 'paragraph'
      && unit.kind !== 'list-item'
    ) {
      continue
    }

    for (const fragment of ownership.fragments) {
      if (fragment.kind !== 'text')
        continue

      const path: Element[] = []
      let ancestor = fragment.node.parentElement
      while (ancestor && ancestor !== unit.root) {
        path.push(ancestor)
        ancestor = ancestor.parentElement
      }
      if (ancestor !== unit.root)
        continue

      for (const element of path) {
        if (!excluded.has(element))
          candidates.add(element)
      }
    }
  }

  return candidates
}

function isGeometryTransparentInlineFormatting(
  element: Element,
  computed: AutofitComputedBoxStyle,
): boolean {
  if (AUTOFIT_MEDIA_TAGS.has(element.localName.toLowerCase()))
    return false
  if (
    computed.display.trim() !== 'inline'
    || computed.position.trim() !== 'static'
  ) {
    return false
  }
  if (
    computed.transform.trim() !== 'none'
    || computed.translate.trim() !== 'none'
    || computed.rotate.trim() !== 'none'
    || computed.scale.trim() !== 'none'
  ) {
    return false
  }

  return [
    computed.marginTop,
    computed.marginRight,
    computed.marginBottom,
    computed.marginLeft,
  ].every(value => parseNonNegativeComputedPixel(value) !== null)
}

function isFiniteRect(rectangle: AutofitGeometryRect): boolean {
  return Number.isFinite(rectangle.left)
    && Number.isFinite(rectangle.right)
    && Number.isFinite(rectangle.top)
    && Number.isFinite(rectangle.bottom)
    && Number.isFinite(rectangle.width)
    && Number.isFinite(rectangle.height)
    && rectangle.width >= 0
    && rectangle.height >= 0
}

function getComposedParentElement(element: Element): Element | null {
  if (element.parentElement)
    return element.parentElement

  const root = element.getRootNode()
  return root instanceof ShadowRoot ? root.host : null
}

function findMeasurementHost(
  viewport: Element,
  reads: AutofitGeometryReads,
): MeasurementHostSearch {
  for (
    let ancestor = getComposedParentElement(viewport);
    ancestor;
    ancestor = getComposedParentElement(ancestor)
  ) {
    const computed = reads.readComputedStyle(ancestor)
    const inlineSize = parseNonNegativeComputedPixel(computed.width)
    const blockSize = parseNonNegativeComputedPixel(computed.height)
    if (inlineSize === null || blockSize === null || inlineSize <= 0 || blockSize <= 0)
      continue

    const rectangle = reads.readBoundingRect(ancestor)
    if (!isFiniteRect(rectangle))
      return { host: null, reason: 'invalid-host-scale' }
    if (rectangle.width === 0 && rectangle.height === 0)
      return { host: null, reason: 'no-measurable-host' }
    if (rectangle.width <= 0 || rectangle.height <= 0)
      return { host: null, reason: 'invalid-host-scale' }

    const inlineScale = rectangle.width / inlineSize
    const blockScale = rectangle.height / blockSize
    if (
      !Number.isFinite(inlineScale)
      || inlineScale <= 0
      || !Number.isFinite(blockScale)
      || blockScale <= 0
    ) {
      return { host: null, reason: 'invalid-host-scale' }
    }

    return {
      host: { element: ancestor, inlineScale, blockScale },
    }
  }

  return { host: null, reason: 'no-measurable-host' }
}

function deferredInvalidGeometry(): AutofitGeometryMeasurement {
  return { status: 'deferred', reason: 'invalid-host-scale' }
}

export function measureAutofitLocalCoordinateSpace(
  viewport: Element,
  reads: AutofitGeometryReads = DEFAULT_GEOMETRY_READS,
): AutofitLocalCoordinateSpaceMeasurement {
  if (!viewport.isConnected)
    return { status: 'deferred', reason: 'no-measurable-host' }

  const viewportRectCount = reads.readClientRectCount(viewport)
  if (!Number.isFinite(viewportRectCount) || viewportRectCount < 0)
    return { status: 'deferred', reason: 'invalid-host-scale' }
  if (viewportRectCount === 0)
    return { status: 'deferred', reason: 'no-measurable-host' }

  const hostSearch = findMeasurementHost(viewport, reads)
  if (!hostSearch.host) {
    return {
      status: 'deferred',
      reason: hostSearch.reason ?? 'no-measurable-host',
    }
  }
  const host = hostSearch.host

  const computedViewport = reads.readComputedStyle(viewport)
  const viewportInlineSize = parseNonNegativeComputedPixel(computedViewport.width)
  const viewportBlockSize = parseNonNegativeComputedPixel(computedViewport.height)
  if (viewportInlineSize === null || viewportBlockSize === null)
    return { status: 'deferred', reason: 'invalid-host-scale' }

  const viewportRect = reads.readBoundingRect(viewport)
  if (!isFiniteRect(viewportRect))
    return { status: 'deferred', reason: 'invalid-host-scale' }

  const inlineScale = viewportInlineSize > 0
    ? viewportRect.width / viewportInlineSize
    : host.inlineScale
  const blockScale = viewportBlockSize > 0
    ? viewportRect.height / viewportBlockSize
    : host.blockScale
  if (
    !Number.isFinite(inlineScale)
    || inlineScale <= 0
    || !Number.isFinite(blockScale)
    || blockScale <= 0
  ) {
    return { status: 'deferred', reason: 'invalid-host-scale' }
  }

  return {
    status: 'measured',
    host: host.element,
    viewportRect,
    viewportInlineSize,
    viewportBlockSize,
    inlineScale,
    blockScale,
  }
}

export function convertAutofitRectToLocal(
  rectangle: AutofitGeometryRect,
  space: AutofitLocalCoordinateSpace,
): AutofitGeometryRect {
  const left = (rectangle.left - space.viewportRect.left) / space.inlineScale
  const right = (rectangle.right - space.viewportRect.left) / space.inlineScale
  const top = (rectangle.top - space.viewportRect.top) / space.blockScale
  const bottom = (rectangle.bottom - space.viewportRect.top) / space.blockScale

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
  }
}

function calculateBounds(
  space: AutofitLocalCoordinateSpace,
  flow: Element,
  classification: AutofitClassification,
  reads: AutofitGeometryReads,
): AutofitContentBounds | null {
  const scroll = reads.readScrollExtent(flow)
  if (
    !Number.isFinite(scroll.inlineSize)
    || scroll.inlineSize < 0
    || !Number.isFinite(scroll.blockSize)
    || scroll.blockSize < 0
  ) {
    return null
  }

  let minInline = 0
  let maxInline = scroll.inlineSize
  let minBlock = 0
  let maxBlock = scroll.blockSize
  const ownedTextFormattingElements
    = deriveOwnedTextFormattingElements(classification)
  const mathInternals = new Set<Element>()
  const inlineMathBoxes = new Map<Element, Element>()
  const mathStyles = new Map<Element, AutofitComputedBoxStyle>()
  const readMathStyle = (element: Element) => {
    let style = mathStyles.get(element)
    if (!style) {
      style = reads.readComputedStyle(element)
      mathStyles.set(element, style)
    }
    return style
  }
  for (const math of classification.inlineMath ?? []) {
    const measured = new Set(inlineMathGeometryElements(math, readMathStyle))
    for (const element of measured)
      inlineMathBoxes.set(element, math.root)
    for (const descendant of math.root.querySelectorAll('*')) {
      if (!measured.has(descendant))
        mathInternals.add(descendant)
    }
  }
  for (const block of classification.displayMathBlocks ?? []) {
    const measured = new Set(displayMathGeometryElements(block))
    for (const descendant of block.root.querySelectorAll('*')) {
      if (!measured.has(descendant))
        mathInternals.add(descendant)
    }
  }

  for (const descendant of flow.querySelectorAll('*')) {
    // Omit accessibility/layout-only internals. Inline painted fragments below
    // are clipped to KaTeX's own containers, never to the AutoFit viewport.
    if (mathInternals.has(descendant))
      continue
    const clientRectCount = reads.readClientRectCount(descendant)
    if (!Number.isFinite(clientRectCount) || clientRectCount < 0)
      return null
    if (clientRectCount === 0)
      continue

    if (
      ownedTextFormattingElements.has(descendant)
      && !inlineMathBoxes.has(descendant)
      && isGeometryTransparentInlineFormatting(
        descendant,
        reads.readComputedStyle(descendant),
      )
    ) {
      continue
    }

    const rectangle = reads.readBoundingRect(descendant)
    if (!isFiniteRect(rectangle))
      return null

    let { left, right, top, bottom } = convertAutofitRectToLocal(
      rectangle,
      space,
    )
    if (![left, right, top, bottom].every(Number.isFinite))
      return null

    const mathRoot = inlineMathBoxes.get(descendant)
    if (mathRoot && descendant !== mathRoot) {
      for (let ancestor = descendant.parentElement; ancestor; ancestor = ancestor.parentElement) {
        const style = readMathStyle(ancestor)
        const clipsInline = /^(hidden|clip|auto|scroll)$/.test(style.overflowX ?? '')
        const clipsBlock = /^(hidden|clip|auto|scroll)$/.test(style.overflowY ?? '')
        if (clipsInline || clipsBlock) {
          const clipRect = reads.readBoundingRect(ancestor)
          if (!isFiniteRect(clipRect))
            return null
          const clip = convertAutofitRectToLocal(clipRect, space)
          if (clipsInline) {
            left = Math.max(left, clip.left)
            right = Math.min(right, clip.right)
          }
          if (clipsBlock) {
            top = Math.max(top, clip.top)
            bottom = Math.min(bottom, clip.bottom)
          }
        }
        if (ancestor === mathRoot)
          break
      }
      if (right < left || bottom < top)
        continue
    }

    minInline = Math.min(minInline, left)
    maxInline = Math.max(maxInline, right)
    minBlock = Math.min(minBlock, top)
    maxBlock = Math.max(maxBlock, bottom)
  }

  return { minInline, maxInline, minBlock, maxBlock }
}

export function measureAutofitGeometry(
  options: AutofitGeometryMeasurementOptions,
): AutofitGeometryMeasurement {
  if (options.semanticallyEmpty)
    return { status: 'empty' }

  const { viewport, flow } = options
  if (!viewport.isConnected || !flow.isConnected)
    return { status: 'deferred', reason: 'no-measurable-host' }

  const reads = options.reads ?? DEFAULT_GEOMETRY_READS
  const space = measureAutofitLocalCoordinateSpace(viewport, reads)
  if (space.status === 'deferred')
    return space

  const bounds = calculateBounds(
    space,
    flow,
    options.classification,
    reads,
  )
  if (!bounds)
    return deferredInvalidGeometry()

  const contentInlineExtent = Math.max(0, bounds.maxInline) - Math.min(0, bounds.minInline)
  const contentBlockExtent = Math.max(0, bounds.maxBlock) - Math.min(0, bounds.minBlock)
  const fits = bounds.minInline >= -AUTOFIT_FIT_TOLERANCE
    && bounds.maxInline <= space.viewportInlineSize + AUTOFIT_FIT_TOLERANCE
    && bounds.minBlock >= -AUTOFIT_FIT_TOLERANCE
    && bounds.maxBlock <= space.viewportBlockSize + AUTOFIT_FIT_TOLERANCE

  return {
    status: 'measured',
    host: space.host,
    viewportInlineSize: space.viewportInlineSize,
    viewportBlockSize: space.viewportBlockSize,
    inlineScale: space.inlineScale,
    blockScale: space.blockScale,
    bounds,
    contentInlineExtent,
    contentBlockExtent,
    emptySpace: Math.max(0, space.viewportBlockSize - contentBlockExtent),
    fits,
  }
}
