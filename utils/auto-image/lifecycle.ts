export type AutoImageInvalidationReason =
  | 'content'
  | 'font'
  | 'geometry'
  | 'media'
  | 'style'
  | 'visibility'

export interface AutoImageInvalidationDetails {
  readonly sourceChanged?: boolean
}

export interface AutoImageLifecycleOptions {
  readonly root: HTMLElement
  readonly viewport: HTMLElement
  readonly flow: HTMLElement
  invalidate(
    reason: AutoImageInvalidationReason,
    details?: AutoImageInvalidationDetails,
  ): void
}

export interface AutoImageLifecycle {
  readonly generation: number
  setMediaTargets(targets: readonly HTMLElement[]): void
  commitBarrier(): number
  /**
   * Drops mutation records caused by the component's own synchronous geometry
   * writes. Call this only after a coherent managed snapshot has been applied.
   */
  commitManagedMutations(): void
  dispose(): void
}

const OBSERVED_ATTRIBUTES = ['class', 'height', 'hidden', 'src', 'style', 'width']

interface ViteHotContext {
  on(event: string, callback: () => void): void
  off?(event: string, callback: () => void): void
}

interface AutoImageTestHooks {
  activeInstances: number
  invalidations: AutoImageInvalidationReason[]
  afterUpdateCallbacks: Set<() => void>
  fontReadyCallbacks: Set<() => void>
  triggerAfterUpdate(): void
  triggerFontReady(): void
}

function autoImageTestHooks(): AutoImageTestHooks | undefined {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test'))
    return undefined

  return (window as Window & {
    readonly __slidevAutoImageTestHooks?: AutoImageTestHooks
  }).__slidevAutoImageTestHooks
}

class DomAutoImageLifecycle implements AutoImageLifecycle {
  readonly #options: AutoImageLifecycleOptions
  readonly #resizeObserver: ResizeObserver
  readonly #mutationObserver: MutationObserver
  readonly #hot: ViteHotContext | undefined
  readonly #testHooks: AutoImageTestHooks | undefined
  #disposed = false
  #generation = 0
  #fontReadyGeneration = 0
  #mediaTargets = new Set<Element>()
  #managedTargetBoxes = new Map<Element, { readonly inlineSize: number, readonly blockSize: number }>()

  constructor(options: AutoImageLifecycleOptions) {
    this.#options = options
    this.#testHooks = autoImageTestHooks()
    if ((import.meta.env.DEV || import.meta.env.MODE === 'test')
      && this.#testHooks) {
      this.#testHooks.activeInstances += 1
    }
    this.#resizeObserver = new ResizeObserver(entries => {
      if (entries.some(entry => !this.#isManagedGeometryCommit(entry)))
        this.#invalidate('geometry')
    })
    this.#mutationObserver = new MutationObserver(records => {
      this.#handleMutations(records)
    })

    this.#resizeObserver.observe(options.root)
    this.#resizeObserver.observe(options.viewport)
    this.#resizeObserver.observe(options.flow)
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
    options.flow.addEventListener('error', this.#handleMediaEvent, true)
    options.root.ownerDocument.addEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
    options.root.ownerDocument.addEventListener('load', this.#handleDocumentLoad, true)
    options.root.ownerDocument.defaultView?.addEventListener('resize', this.#handleWindowResize)

    const fonts = options.root.ownerDocument.fonts
    fonts?.addEventListener('loadingdone', this.#handleFontCompletion)
    fonts?.addEventListener('loadingerror', this.#handleFontCompletion)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.fontReadyCallbacks.add(this.#handleFontReady)
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
      this.#testHooks?.afterUpdateCallbacks.add(this.#handleStyleInvalidation)
  }

  #invalidate(
    reason: AutoImageInvalidationReason,
    details?: AutoImageInvalidationDetails,
  ): void {
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.invalidations.push(reason)
    this.#options.invalidate(reason, details)
  }

  readonly #handleMediaEvent = (event: Event): void => {
    const target = event.target
    if (!(target instanceof HTMLImageElement))
      return
    this.#invalidate('media')
  }

  readonly #handleDocumentLoad = (event: Event): void => {
    const target = event.target
    if (
      target instanceof HTMLLinkElement
      && target.relList.contains('stylesheet')
    ) {
      this.#invalidate('style')
    }
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

    let reason: AutoImageInvalidationReason = 'geometry'
    let details: AutoImageInvalidationDetails | undefined
    for (const record of records) {
      const target = record.target
      if (this.#options.root.ownerDocument.head?.contains(target)) {
        reason = 'style'
        continue
      }
      if (record.type === 'childList' || record.type === 'characterData') {
        reason = this.#options.flow.contains(target) || target === this.#options.flow
          ? 'content'
          : 'geometry'
        continue
      }
      if (record.type !== 'attributes' || !(target instanceof Element))
        continue

      if (target === this.#options.root.parentElement
        || target.parentElement && this.#options.root.contains(target.parentElement) === false) {
        reason = 'style'
        continue
      }
      if (record.attributeName === 'src' && target instanceof HTMLImageElement) {
        reason = 'media'
        details = { sourceChanged: true }
        continue
      }
      if (record.attributeName === 'class' || record.attributeName === 'style') {
        reason = 'style'
      }
      else if (record.attributeName === 'hidden') {
        reason = 'visibility'
      }
      else if (target instanceof HTMLImageElement && ['height', 'width'].includes(record.attributeName ?? '')) {
        reason = 'media'
      }
      else {
        reason = 'geometry'
      }
    }

    this.#generation += 1
    this.#invalidate(reason, details)
  }

  setMediaTargets(targets: readonly HTMLElement[]): void {
    const nextTargets = new Set<Element>(targets)
    for (const target of this.#mediaTargets) {
      if (!nextTargets.has(target))
        this.#resizeObserver.unobserve(target)
    }
    for (const target of nextTargets) {
      if (!this.#mediaTargets.has(target))
        this.#resizeObserver.observe(target)
    }
    this.#mediaTargets = nextTargets
    for (const target of this.#managedTargetBoxes.keys()) {
      if (!nextTargets.has(target))
        this.#managedTargetBoxes.delete(target)
    }
  }

  get generation(): number {
    return this.#generation
  }

  commitBarrier(): number {
    if (this.#disposed)
      return this.#generation
    this.#handleMutations(this.#mutationObserver.takeRecords())
    return this.#generation
  }

  commitManagedMutations(): void {
    if (this.#disposed)
      return
    this.#mutationObserver.takeRecords()
    this.#managedTargetBoxes.clear()
    for (const target of this.#mediaTargets)
      this.#managedTargetBoxes.set(target, this.#contentBox(target))
  }

  #contentBox(target: Element): { readonly inlineSize: number, readonly blockSize: number } {
    const computed = getComputedStyle(target)
    return {
      inlineSize: Number.parseFloat(computed.width) || 0,
      blockSize: Number.parseFloat(computed.height) || 0,
    }
  }

  #isManagedGeometryCommit(entry: ResizeObserverEntry): boolean {
    const expected = this.#managedTargetBoxes.get(entry.target)
    if (!expected)
      return false
    const tolerance = 0.5
    return Math.abs(entry.contentRect.width - expected.inlineSize) <= tolerance
      && Math.abs(entry.contentRect.height - expected.blockSize) <= tolerance
  }

  dispose(): void {
    if (this.#disposed)
      return
    this.#disposed = true
    this.#fontReadyGeneration += 1
    this.#resizeObserver.disconnect()
    this.#mutationObserver.disconnect()
    this.#options.flow.removeEventListener('load', this.#handleMediaEvent, true)
    this.#options.flow.removeEventListener('error', this.#handleMediaEvent, true)
    this.#options.root.ownerDocument.removeEventListener(
      'visibilitychange',
      this.#handleVisibilityChange,
    )
    this.#options.root.ownerDocument.removeEventListener('load', this.#handleDocumentLoad, true)
    this.#options.root.ownerDocument.defaultView?.removeEventListener('resize', this.#handleWindowResize)
    const fonts = this.#options.root.ownerDocument.fonts
    fonts?.removeEventListener('loadingdone', this.#handleFontCompletion)
    fonts?.removeEventListener('loadingerror', this.#handleFontCompletion)
    if (import.meta.env.DEV || import.meta.env.MODE === 'test')
      this.#testHooks?.fontReadyCallbacks.delete(this.#handleFontReady)
    this.#hot?.off?.('vite:afterUpdate', this.#handleStyleInvalidation)
    if ((import.meta.env.DEV || import.meta.env.MODE === 'test')
      && this.#testHooks) {
      this.#testHooks?.afterUpdateCallbacks.delete(this.#handleStyleInvalidation)
      this.#testHooks.activeInstances -= 1
    }
  }
}

export function createAutoImageLifecycle(
  options: AutoImageLifecycleOptions,
): AutoImageLifecycle {
  return new DomAutoImageLifecycle(options)
}
