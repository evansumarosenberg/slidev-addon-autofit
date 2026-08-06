export type AutoImageLayoutInvalidationReason =
  | 'content'
  | 'font'
  | 'geometry'
  | 'style'
  | 'visibility'

export interface AutoImageLayoutLifecycleOptions {
  readonly root: HTMLElement
  readonly stage: HTMLElement
  invalidate(reason: AutoImageLayoutInvalidationReason): void
}

export interface AutoImageLayoutLifecycle {
  readonly generation: number
  setTrackTargets(image: HTMLElement | null, auto: HTMLElement | null): void
  commitBarrier(): number
  dispose(): void
}

interface ViteHotContext {
  on(event: string, callback: () => void): void
  off?(event: string, callback: () => void): void
}

interface AutoImageTestHooks {
  invalidations?: string[]
  afterUpdateCallbacks?: Set<() => void>
  fontReadyCallbacks?: Set<() => void>
}

function autoImageTestHooks(): AutoImageTestHooks | undefined {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test'))
    return undefined

  return (window as Window & {
    readonly __slidevAutoImageTestHooks?: AutoImageTestHooks
  }).__slidevAutoImageTestHooks
}

const ROOT_ATTRIBUTES = ['class', 'height', 'hidden', 'src', 'style', 'width']
const HEAD_ATTRIBUTES = ['href', 'media', 'rel']

class DomAutoImageLayoutLifecycle implements AutoImageLayoutLifecycle {
  readonly #options: AutoImageLayoutLifecycleOptions
  readonly #resizeObserver: ResizeObserver
  readonly #mutationObserver: MutationObserver
  readonly #hot: ViteHotContext | undefined
  readonly #testHooks: AutoImageTestHooks | undefined
  #disposed = false
  #generation = 0
  #trackTargets = new Set<Element>()
  #fontReadyGeneration = 0

  constructor(options: AutoImageLayoutLifecycleOptions) {
    this.#options = options
    this.#testHooks = autoImageTestHooks()
    this.#resizeObserver = new ResizeObserver(() => this.#invalidate('geometry'))
    this.#mutationObserver = new MutationObserver(records => {
      this.#handleMutations(records)
    })

    this.#resizeObserver.observe(options.root)
    this.#resizeObserver.observe(options.stage)
    this.#mutationObserver.observe(options.root, {
      attributeFilter: ROOT_ATTRIBUTES,
      attributes: true,
      characterData: true,
      childList: true,
      subtree: false,
    })
    this.#mutationObserver.observe(options.stage, {
      attributeFilter: ROOT_ATTRIBUTES,
      attributes: true,
      characterData: true,
      childList: true,
      subtree: false,
    })
    for (
      let ancestor = options.root.parentElement;
      ancestor;
      ancestor = ancestor.parentElement
    ) {
      this.#mutationObserver.observe(ancestor, {
        attributeFilter: ['class', 'hidden', 'style'],
        attributes: true,
      })
    }
    if (options.root.ownerDocument.head) {
      this.#mutationObserver.observe(options.root.ownerDocument.head, {
        attributeFilter: HEAD_ATTRIBUTES,
        attributes: true,
        characterData: true,
        childList: true,
        subtree: true,
      })
    }

    options.root.ownerDocument.addEventListener('load', this.#handleDocumentLoad, true)
    options.root.ownerDocument.addEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
    options.root.ownerDocument.defaultView?.addEventListener('resize', this.#handleWindowResize)

    const fonts = options.root.ownerDocument.fonts
    fonts?.addEventListener('loadingdone', this.#handleFontCompletion)
    fonts?.addEventListener('loadingerror', this.#handleFontCompletion)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.fontReadyCallbacks?.add(this.#handleFontReady)
    if (fonts) {
      const generation = ++this.#fontReadyGeneration
      void fonts.ready.then(() => {
        if (!this.#disposed && generation === this.#fontReadyGeneration)
          this.#handleFontReady()
      })
    }

    this.#hot = (import.meta as ImportMeta & { hot?: ViteHotContext }).hot
    this.#hot?.on('vite:afterUpdate', this.#handleStyleInvalidation)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.afterUpdateCallbacks?.add(this.#handleStyleInvalidation)
  }

  #invalidate(reason: AutoImageLayoutInvalidationReason): void {
    if (this.#disposed)
      return
    this.#generation += 1
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.invalidations?.push(`layout:${reason}`)
    this.#options.invalidate(reason)
  }

  readonly #handleDocumentLoad = (event: Event): void => {
    const target = event.target
    if (target instanceof HTMLLinkElement && target.relList.contains('stylesheet'))
      this.#invalidate('style')
  }

  readonly #handleVisibilityChange = (): void => {
    this.#invalidate('visibility')
  }

  readonly #handleWindowResize = (): void => {
    this.#invalidate('geometry')
  }

  readonly #handleFontCompletion = (): void => {
    this.#invalidate('font')
  }

  readonly #handleFontReady = (): void => {
    this.#invalidate('font')
  }

  readonly #handleStyleInvalidation = (): void => {
    this.#invalidate('style')
  }

  #handleMutations(records: MutationRecord[]): void {
    if (this.#disposed || records.length === 0)
      return

    let reason: AutoImageLayoutInvalidationReason = 'geometry'
    for (const record of records) {
      const target = record.target
      if (this.#options.root.ownerDocument.head?.contains(target)) {
        reason = 'style'
        continue
      }
      if (record.type === 'characterData') {
        reason = 'content'
        continue
      }
      if (record.type === 'childList') {
        reason = this.#options.stage.contains(target)
          ? 'content'
          : 'geometry'
        continue
      }
      if (record.type !== 'attributes' || !(target instanceof Element))
        continue

      if (target === this.#options.root.parentElement
        || !this.#options.root.contains(target)) {
        reason = 'style'
      }
      else if (record.attributeName === 'hidden') {
        reason = 'visibility'
      }
      else if (record.attributeName === 'class' || record.attributeName === 'style') {
        reason = 'style'
      }
      else {
        reason = 'geometry'
      }
    }
    this.#invalidate(reason)
  }

  setTrackTargets(image: HTMLElement | null, auto: HTMLElement | null): void {
    const nextTargets = new Set<Element>([
      ...(image ? [image] : []),
      ...(auto ? [auto] : []),
    ])
    for (const target of this.#trackTargets) {
      if (!nextTargets.has(target))
        this.#resizeObserver.unobserve(target)
    }
    for (const target of nextTargets) {
      if (!this.#trackTargets.has(target))
        this.#resizeObserver.observe(target)
    }
    this.#trackTargets = nextTargets
  }

  get generation(): number {
    return this.#generation
  }

  commitBarrier(): number {
    if (!this.#disposed)
      this.#handleMutations(this.#mutationObserver.takeRecords())
    return this.#generation
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#fontReadyGeneration += 1
    this.#resizeObserver.disconnect()
    this.#mutationObserver.disconnect()
    this.#options.root.ownerDocument.removeEventListener('load', this.#handleDocumentLoad, true)
    this.#options.root.ownerDocument.removeEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
    this.#options.root.ownerDocument.defaultView?.removeEventListener('resize', this.#handleWindowResize)
    const fonts = this.#options.root.ownerDocument.fonts
    fonts?.removeEventListener('loadingdone', this.#handleFontCompletion)
    fonts?.removeEventListener('loadingerror', this.#handleFontCompletion)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.fontReadyCallbacks?.delete(this.#handleFontReady)
    this.#hot?.off?.('vite:afterUpdate', this.#handleStyleInvalidation)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.afterUpdateCallbacks?.delete(this.#handleStyleInvalidation)
  }
}

export function createAutoImageLayoutLifecycle(
  options: AutoImageLayoutLifecycleOptions,
): AutoImageLayoutLifecycle {
  return new DomAutoImageLayoutLifecycle(options)
}
