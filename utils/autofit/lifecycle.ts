import { consumeAutofitGeneratedStyleMutation } from './generated-styles'

export type AutofitInvalidationReason =
  | 'configuration'
  | 'content'
  | 'font'
  | 'geometry'
  | 'media'
  | 'style'
  | 'visibility'

export interface AutofitLifecycleOptions {
  readonly root: HTMLElement
  readonly viewport: HTMLElement
  readonly flow: HTMLElement
  probeStyleContext(): string | null
  invalidate(reason: AutofitInvalidationReason): void
}

export interface AutofitLifecycle {
  readonly generation: number
  commitBarrier(): number
  markGeometry(styleContext?: string): void
  dispose(): void
}

const MEDIA_SELECTOR = 'audio, canvas, embed, iframe, img, object, picture, svg, video'
const OBSERVED_ATTRIBUTES = [
  'class',
  'height',
  'hidden',
  'open',
  'src',
  'style',
  'width',
]
const BASE_SPACING_PROPERTY = '--slidev-autofit-base-spacing'
const GEOMETRY_PRECISION = 1000
const MANAGED_ROOT_CLASSES = new Set([
  'autofit--pending',
  'autofit--pending-visible',
  'autofit--fit',
  'autofit--overflow',
  'autofit--unsupported',
  'autofit--config-error',
])

interface ViteHotContext {
  on(event: string, callback: () => void): void
  off?(event: string, callback: () => void): void
}

function rounded(value: number): number | string {
  if (!Number.isFinite(value))
    return String(value)
  return Math.round(value * GEOMETRY_PRECISION) / GEOMETRY_PRECISION
}

function elementGeometry(element: Element): readonly unknown[] {
  const rectangles = element.getClientRects()
  if (rectangles.length === 0)
    return [0]

  const rectangle = element.getBoundingClientRect()
  const scrollable = element as Element & {
    readonly scrollHeight?: number
    readonly scrollWidth?: number
  }
  return [
    rectangles.length,
    rounded(rectangle.left),
    rounded(rectangle.top),
    rounded(rectangle.width),
    rounded(rectangle.height),
    rounded(scrollable.scrollWidth ?? 0),
    rounded(scrollable.scrollHeight ?? 0),
  ]
}

function textGeometryFingerprint(flow: HTMLElement): string {
  const geometry: unknown[] = []
  const walker = flow.ownerDocument.createTreeWalker(flow, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node as Text
    if (text.data.trim() === '')
      continue

    const range = flow.ownerDocument.createRange()
    try {
      range.selectNodeContents(text)
      geometry.push([
        ...Array.from(range.getClientRects(), rectangle => [
          rounded(rectangle.left),
          rounded(rectangle.top),
          rounded(rectangle.width),
          rounded(rectangle.height),
        ]),
      ])
    }
    finally {
      range.detach()
    }
  }
  return JSON.stringify(geometry)
}

function geometryFingerprint(
  root: HTMLElement,
  viewport: HTMLElement,
  flow: HTMLElement,
): string {
  const geometry = [
    elementGeometry(root),
    elementGeometry(viewport),
    elementGeometry(flow),
  ]
  for (const descendant of flow.querySelectorAll('*'))
    geometry.push(elementGeometry(descendant))
  for (const media of flow.querySelectorAll(MEDIA_SELECTOR)) {
    const intrinsic = media as Element & {
      readonly currentSrc?: string
      readonly naturalHeight?: number
      readonly naturalWidth?: number
      readonly readyState?: number
      readonly videoHeight?: number
      readonly videoWidth?: number
      readonly width?: number
      readonly height?: number
    }
    geometry.push([
      media.localName,
      media.getAttribute('src'),
      intrinsic.currentSrc ?? '',
      intrinsic.naturalWidth ?? 0,
      intrinsic.naturalHeight ?? 0,
      intrinsic.videoWidth ?? 0,
      intrinsic.videoHeight ?? 0,
      intrinsic.width ?? 0,
      intrinsic.height ?? 0,
      intrinsic.readyState ?? 0,
    ])
  }
  return JSON.stringify(geometry)
}

function readInlineBaseSpacing(value: string | null): string | null {
  if (!value)
    return null

  const match = new RegExp(
    `(?:^|;)\\s*${BASE_SPACING_PROPERTY}\\s*:\\s*([^;]*)`,
    'i',
  ).exec(value)
  return match?.[1]?.trim() ?? null
}

function isStyleNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE)
    return false

  const element = node as Element
  return element.matches('style, link[rel~="stylesheet"]')
    || element.querySelector('style, link[rel~="stylesheet"]') !== null
}

function authoredRootClasses(value: string | null): string {
  return (value ?? '')
    .split(/\s+/)
    .filter(token => token && !MANAGED_ROOT_CLASSES.has(token))
    .sort()
    .join(' ')
}

class DomAutofitLifecycle implements AutofitLifecycle {
  readonly #options: AutofitLifecycleOptions
  readonly #resizeObserver: ResizeObserver
  readonly #mutationObserver: MutationObserver
  readonly #hot: ViteHotContext | undefined
  #geometryFrame: number | null = null
  #lastGeometry: string
  #lastTextGeometry: string
  #lastStyleContext: string | null = null
  #styleContextProbePending = false
  #textGeometryProbePending = false
  #disposed = false
  #fontReadyGeneration = 0
  #generation = 0

  constructor(options: AutofitLifecycleOptions) {
    this.#options = options
    this.#lastGeometry = geometryFingerprint(
      options.root,
      options.viewport,
      options.flow,
    )
    this.#lastTextGeometry = textGeometryFingerprint(options.flow)

    this.#resizeObserver = new ResizeObserver(() => {
      this.#queueGeometryProbe('geometry')
    })
    this.#mutationObserver = new MutationObserver((records) => {
      this.#handleMutations(records, false)
    })

    this.#resizeObserver.observe(options.root)
    this.#resizeObserver.observe(options.viewport)
    this.#syncMediaResizeTargets()

    this.#mutationObserver.observe(options.root, {
      attributeFilter: OBSERVED_ATTRIBUTES,
      attributeOldValue: true,
      attributes: true,
      characterData: true,
      childList: true,
      subtree: true,
    })
    for (
      let ancestor = options.root.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      this.#mutationObserver.observe(ancestor, {
        attributeFilter: ['class', 'hidden', 'style'],
        attributeOldValue: true,
        attributes: true,
      })
    }
    if (options.root.ownerDocument.head) {
      this.#mutationObserver.observe(options.root.ownerDocument.head, {
        attributeFilter: ['href', 'media', 'rel'],
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      })
    }

    options.flow.addEventListener('load', this.#handleMediaEvent, true)
    options.flow.addEventListener('loadedmetadata', this.#handleMediaEvent, true)
    options.flow.addEventListener('resize', this.#handleMediaEvent, true)
    options.root.ownerDocument.addEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
    options.root.ownerDocument.addEventListener('load', this.#handleDocumentLoad, true)
    options.root.ownerDocument.defaultView?.addEventListener('resize', this.#handleWindowResize)

    const fonts = options.root.ownerDocument.fonts
    fonts?.addEventListener('loadingdone', this.#handleFontCompletion)
    fonts?.addEventListener('loadingerror', this.#handleFontCompletion)
    if (fonts?.status === 'loading') {
      const generation = ++this.#fontReadyGeneration
      void fonts.ready.then(() => {
        if (!this.#disposed && generation === this.#fontReadyGeneration)
          this.#queueGeometryProbe('font')
      })
    }

    this.#hot = (import.meta as ImportMeta & { hot?: ViteHotContext }).hot
    this.#hot?.on('vite:afterUpdate', this.#handleStyleInvalidation)
  }

  readonly #handleMediaEvent = (event: Event): void => {
    const target = event.target
    if (target instanceof Element && target.matches(MEDIA_SELECTOR))
      this.#queueGeometryProbe('media')
  }

  readonly #handleDocumentLoad = (event: Event): void => {
    const target = event.target
    if (
      target instanceof HTMLLinkElement
      && target.relList.contains('stylesheet')
    ) {
      this.#options.invalidate('style')
    }
  }

  readonly #handleVisibilityChange = (): void => {
    this.#queueGeometryProbe('visibility')
  }

  readonly #handleWindowResize = (): void => {
    this.#queueGeometryProbe('geometry')
  }

  readonly #handleFontCompletion = (): void => {
    this.#queueGeometryProbe('font')
  }

  readonly #handleStyleInvalidation = (): void => {
    this.#options.invalidate('style')
  }

  get generation(): number {
    return this.#generation
  }

  commitBarrier(): number {
    if (this.#disposed)
      return this.#generation

    this.#handleMutations(this.#mutationObserver.takeRecords(), true)
    return this.#generation
  }

  #handleMutations(
    records: MutationRecord[],
    synchronous: boolean,
  ): void {
    if (this.#disposed || records.length === 0)
      return

    records = records.filter(record =>
      !consumeAutofitGeneratedStyleMutation(record),
    )
    if (records.length === 0)
      return

    let contentChanged = false
    let mediaChanged = false
    let styleChanged = false
    let geometryChanged = false
    let styleContextChanged = false
    let mediaTargetsChanged = false
    const diagnostics = this.#options.root.querySelector(
      ':scope > .autofit__diagnostics',
    )

    for (const record of records) {
      const target = record.target
      if (diagnostics?.contains(target))
        continue
      if (this.#options.root.ownerDocument.head?.contains(target)) {
        if (
          record.type === 'characterData'
          || (record.type === 'childList'
            && (
              (target instanceof Element
                && target.matches('style, link[rel~="stylesheet"]'))
              || [...record.addedNodes, ...record.removedNodes].some(isStyleNode)
            ))
          || (record.type === 'attributes'
            && target instanceof Element
            && target.matches('style, link[rel~="stylesheet"]'))
        ) {
          styleChanged = true
        }
        continue
      }

      if (record.type === 'characterData') {
        if (this.#options.flow.contains(target))
          contentChanged = true
        else
          geometryChanged = true
        continue
      }
      if (record.type === 'childList') {
        if (target === this.#options.flow || this.#options.flow.contains(target)) {
          contentChanged = true
          mediaTargetsChanged = true
        }
        else {
          geometryChanged = true
        }
        continue
      }
      if (record.type !== 'attributes' || !(target instanceof Element))
        continue

      if (
        target === this.#options.root
        && record.attributeName === 'class'
        && authoredRootClasses(record.oldValue)
          === authoredRootClasses(target.getAttribute('class'))
      ) {
        continue
      }
      if (
        record.attributeName === 'style'
        && readInlineBaseSpacing(record.oldValue)
          !== readInlineBaseSpacing(target.getAttribute('style'))
      ) {
        styleChanged = true
        continue
      }
      if (
        target.matches(MEDIA_SELECTOR)
        && ['height', 'src', 'width'].includes(record.attributeName ?? '')
      ) {
        mediaChanged = true
        continue
      }
      if (
        record.attributeName === 'class'
        || record.attributeName === 'style'
      ) {
        styleContextChanged = true
      }
      geometryChanged = true
    }

    if (
      !contentChanged
      && !styleChanged
      && !mediaChanged
      && !geometryChanged
    ) {
      return
    }
    this.#generation += 1

    if (mediaTargetsChanged)
      this.#syncMediaResizeTargets()
    if (contentChanged)
      this.#options.invalidate('content')
    else if (styleChanged)
      this.#options.invalidate('style')
    else if (mediaChanged)
      this.#options.invalidate('media')
    else if (geometryChanged) {
      if (synchronous)
        this.#options.invalidate('geometry')
      else
        this.#queueGeometryProbe('geometry', styleContextChanged)
    }
  }

  #syncMediaResizeTargets(): void {
    for (const media of this.#options.flow.querySelectorAll(MEDIA_SELECTOR))
      this.#resizeObserver.observe(media)
  }

  #queueGeometryProbe(
    reason: Extract<
      AutofitInvalidationReason,
      'font' | 'geometry' | 'media' | 'visibility'
    >,
    probeStyleContext = false,
  ): void {
    if (this.#disposed)
      return
    this.#styleContextProbePending ||= probeStyleContext
    this.#textGeometryProbePending ||= reason === 'font'
    if (this.#geometryFrame !== null)
      return

    this.#geometryFrame = requestAnimationFrame(() => {
      this.#geometryFrame = null
      if (this.#disposed)
        return

      const shouldProbeStyleContext = this.#styleContextProbePending
      this.#styleContextProbePending = false
      const shouldProbeTextGeometry = this.#textGeometryProbePending
      this.#textGeometryProbePending = false
      if (shouldProbeStyleContext) {
        let nextStyleContext: string | null = null
        try {
          nextStyleContext = this.#options.probeStyleContext()
        }
        catch {
          nextStyleContext = null
        }
        if (
          nextStyleContext === null
          || nextStyleContext !== this.#lastStyleContext
        ) {
          this.#options.invalidate('style')
          return
        }
      }

      const nextGeometry = geometryFingerprint(
        this.#options.root,
        this.#options.viewport,
        this.#options.flow,
      )
      const nextTextGeometry = shouldProbeTextGeometry
        ? textGeometryFingerprint(this.#options.flow)
        : this.#lastTextGeometry
      const geometryChanged = nextGeometry !== this.#lastGeometry
      const textGeometryChanged = nextTextGeometry !== this.#lastTextGeometry
      if (!geometryChanged && !textGeometryChanged)
        return

      this.#lastGeometry = nextGeometry
      this.#lastTextGeometry = nextTextGeometry
      this.#options.invalidate(textGeometryChanged ? 'font' : reason)
    })
  }

  markGeometry(styleContext?: string): void {
    this.#lastGeometry = geometryFingerprint(
      this.#options.root,
      this.#options.viewport,
      this.#options.flow,
    )
    this.#lastTextGeometry = textGeometryFingerprint(this.#options.flow)
    if (styleContext !== undefined)
      this.#lastStyleContext = styleContext
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#fontReadyGeneration += 1

    if (this.#geometryFrame !== null)
      cancelAnimationFrame(this.#geometryFrame)
    this.#geometryFrame = null
    this.#styleContextProbePending = false
    this.#textGeometryProbePending = false

    this.#resizeObserver.disconnect()
    this.#mutationObserver.disconnect()
    this.#options.flow.removeEventListener('load', this.#handleMediaEvent, true)
    this.#options.flow.removeEventListener('loadedmetadata', this.#handleMediaEvent, true)
    this.#options.flow.removeEventListener('resize', this.#handleMediaEvent, true)
    this.#options.root.ownerDocument.removeEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
    this.#options.root.ownerDocument.removeEventListener(
      'load',
      this.#handleDocumentLoad,
      true,
    )
    this.#options.root.ownerDocument.defaultView?.removeEventListener(
      'resize',
      this.#handleWindowResize,
    )

    const fonts = this.#options.root.ownerDocument.fonts
    fonts?.removeEventListener('loadingdone', this.#handleFontCompletion)
    fonts?.removeEventListener('loadingerror', this.#handleFontCompletion)
    this.#hot?.off?.('vite:afterUpdate', this.#handleStyleInvalidation)
  }
}

export function createAutofitLifecycle(
  options: AutofitLifecycleOptions,
): AutofitLifecycle {
  return new DomAutofitLifecycle(options)
}
