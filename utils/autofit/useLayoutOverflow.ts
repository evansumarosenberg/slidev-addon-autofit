import type { Ref } from 'vue'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { AUTOFIT_DIAGNOSTIC_PREFIX } from './diagnostic-prefix'

const LAYOUT_OVERFLOW_TOLERANCE = 0.5

interface LayoutOverflowElements {
  readonly layout: Ref<HTMLElement | null>
  readonly main: Ref<HTMLElement | null>
  readonly footer: Ref<HTMLElement | null>
}

interface LayoutCoordinateSpace {
  readonly rect: DOMRect
  readonly inlineScale: number
  readonly blockScale: number
  readonly contentTop: number
  readonly contentRight: number
  readonly contentBottom: number
  readonly contentLeft: number
}

interface LocalBounds {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

const CLIPPING_OVERFLOW_VALUES = new Set([
  'auto',
  'clip',
  'hidden',
  'scroll',
])

function pixelValue(value: string): number {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function readLayoutCoordinateSpace(layout: HTMLElement): LayoutCoordinateSpace | null {
  const rect = layout.getBoundingClientRect()
  if (layout.clientWidth <= 0 || layout.clientHeight <= 0)
    return null

  const inlineScale = rect.width / layout.clientWidth
  const blockScale = rect.height / layout.clientHeight
  if (!(inlineScale > 0) || !(blockScale > 0))
    return null

  const style = getComputedStyle(layout)
  return {
    rect,
    inlineScale,
    blockScale,
    contentTop: pixelValue(style.paddingTop),
    contentRight: layout.clientWidth - pixelValue(style.paddingRight),
    contentBottom: layout.clientHeight - pixelValue(style.paddingBottom),
    contentLeft: pixelValue(style.paddingLeft),
  }
}

function toLocalBounds(
  rect: DOMRect,
  coordinates: LayoutCoordinateSpace,
): LocalBounds {
  return {
    top: (rect.top - coordinates.rect.top) / coordinates.blockScale,
    right: (rect.right - coordinates.rect.left) / coordinates.inlineScale,
    bottom: (rect.bottom - coordinates.rect.top) / coordinates.blockScale,
    left: (rect.left - coordinates.rect.left) / coordinates.inlineScale,
  }
}

function readClippedDescendantBounds(
  descendant: Element,
  region: HTMLElement,
  coordinates: LayoutCoordinateSpace,
): LocalBounds | null {
  const rectangle = descendant.getBoundingClientRect()
  let bounds = toLocalBounds(rectangle, coordinates)

  for (
    let ancestor = descendant.parentElement;
    ancestor && ancestor !== region;
    ancestor = ancestor.parentElement
  ) {
    const style = getComputedStyle(ancestor)
    const clipsInline = CLIPPING_OVERFLOW_VALUES.has(style.overflowX)
    const clipsBlock = CLIPPING_OVERFLOW_VALUES.has(style.overflowY)
    if (!clipsInline && !clipsBlock)
      continue

    const clip = toLocalBounds(ancestor.getBoundingClientRect(), coordinates)
    bounds = {
      top: clipsBlock ? Math.max(bounds.top, clip.top) : bounds.top,
      right: clipsInline ? Math.min(bounds.right, clip.right) : bounds.right,
      bottom: clipsBlock ? Math.min(bounds.bottom, clip.bottom) : bounds.bottom,
      left: clipsInline ? Math.max(bounds.left, clip.left) : bounds.left,
    }

    if (bounds.right <= bounds.left || bounds.bottom <= bounds.top)
      return null
  }

  return bounds
}

function readRenderedRegionBounds(
  region: HTMLElement,
  coordinates: LayoutCoordinateSpace,
): LocalBounds {
  const regionBounds = toLocalBounds(region.getBoundingClientRect(), coordinates)
  const bounds = {
    top: regionBounds.top,
    right: Math.max(regionBounds.right, regionBounds.left + region.scrollWidth),
    bottom: Math.max(regionBounds.bottom, regionBounds.top + region.scrollHeight),
    left: regionBounds.left,
  }

  for (const descendant of region.querySelectorAll('*')) {
    if (descendant.getClientRects().length === 0)
      continue

    const descendantBounds = readClippedDescendantBounds(
      descendant,
      region,
      coordinates,
    )
    if (!descendantBounds)
      continue

    bounds.top = Math.min(bounds.top, descendantBounds.top)
    bounds.right = Math.max(bounds.right, descendantBounds.right)
    bounds.bottom = Math.max(bounds.bottom, descendantBounds.bottom)
    bounds.left = Math.min(bounds.left, descendantBounds.left)
  }

  return bounds
}

function regionOverflows(
  region: HTMLElement,
  coordinates: LayoutCoordinateSpace,
): boolean {
  const bounds = readRenderedRegionBounds(region, coordinates)

  return bounds.left < coordinates.contentLeft - LAYOUT_OVERFLOW_TOLERANCE
    || bounds.right > coordinates.contentRight + LAYOUT_OVERFLOW_TOLERANCE
    || bounds.top < coordinates.contentTop - LAYOUT_OVERFLOW_TOLERANCE
    || bounds.bottom > coordinates.contentBottom + LAYOUT_OVERFLOW_TOLERANCE
}

export function useLayoutOverflow(elements: LayoutOverflowElements) {
  const overflowing = ref(false)
  let animationFrame: number | null = null
  let resizeObserver: ResizeObserver | null = null
  let mutationObserver: MutationObserver | null = null

  function evaluate(): void {
    animationFrame = null
    const layout = elements.layout.value
    if (!layout)
      return

    const coordinates = readLayoutCoordinateSpace(layout)
    if (!coordinates)
      return

    const nextOverflowing = [elements.main.value, elements.footer.value]
      .some(region => region !== null && regionOverflows(region, coordinates))

    if (nextOverflowing && !overflowing.value) {
      console.warn(
        `${AUTOFIT_DIAGNOSTIC_PREFIX} LAYOUT OVERFLOW: fixed main/footer content exceeds the padded slide content box.`,
      )
    }

    overflowing.value = nextOverflowing
  }

  function schedule(): void {
    if (animationFrame !== null)
      return

    animationFrame = requestAnimationFrame(evaluate)
  }

  function rebindObservers(): void {
    if (!resizeObserver || !mutationObserver)
      return

    resizeObserver.disconnect()
    mutationObserver.disconnect()

    for (const element of [elements.layout.value, elements.main.value, elements.footer.value]) {
      if (element)
        resizeObserver.observe(element)
    }

    for (const region of [elements.main.value, elements.footer.value]) {
      if (region) {
        mutationObserver.observe(region, {
          attributes: true,
          characterData: true,
          childList: true,
          subtree: true,
        })
      }
    }
  }

  onMounted(() => {
    resizeObserver = new ResizeObserver(schedule)
    mutationObserver = new MutationObserver(schedule)

    rebindObservers()

    window.addEventListener('resize', schedule)
    schedule()
  })

  watch(
    [elements.layout, elements.main, elements.footer],
    () => {
      rebindObservers()
      schedule()
    },
    { flush: 'post' },
  )

  onBeforeUnmount(() => {
    if (animationFrame !== null)
      cancelAnimationFrame(animationFrame)

    resizeObserver?.disconnect()
    mutationObserver?.disconnect()
    window.removeEventListener('resize', schedule)
  })

  return {
    overflowing,
    refreshLayoutOverflow: schedule,
  }
}
