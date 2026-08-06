<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  calculateAutoImageFitGeometry,
  DEFAULT_AUTO_IMAGE_CAPTION_GAP,
} from '../utils/auto-image/geometry'
import {
  calculateAutoImageColumnGroupGeometry,
  calculateAutoImageRowGroupGeometry,
  DEFAULT_AUTO_IMAGE_ITEM_GAP,
} from '../utils/auto-image/group-geometry'
import {
  readAutoImageGroupDomSnapshot,
} from '../utils/auto-image/dom'
import {
  createAutoImageLifecycle,
} from '../utils/auto-image/lifecycle'
import { areFiniteAutoImageValues } from '../utils/auto-image/finite'
import type {
  AutoImageCaptionMeasurement,
  AutoImageFitGeometry,
  AutoImageGroupGeometry,
  AutoImageGroupItemInput,
  AutoImageGroupOverflowReason,
  AutoImagePosition,
  ImageSlotStructuralReason,
} from '../utils/auto-image/types'
import type {
  AutoImageGroupDomItemSnapshot,
} from '../utils/auto-image/dom'
import type {
  AutoImageInvalidationDetails,
  AutoImageInvalidationReason,
  AutoImageLifecycle,
} from '../utils/auto-image/lifecycle'

type AutoImageState = 'pending' | 'fit' | 'overflow' | 'unsupported'
type AutoImageReason = AutoImageGroupOverflowReason | ImageSlotStructuralReason | 'image-unavailable'

export interface AutoImageStateReport {
  readonly state: AutoImageState
  readonly reason: AutoImageReason | null
}

const props = withDefaults(defineProps<{
  /** Layout-owned input; direct component usage retains the row default. */
  position?: AutoImagePosition
}>(), {
  position: 'center',
})

const emit = defineEmits<{
  'state-change': [report: AutoImageStateReport]
}>()

const root = ref<HTMLElement | null>(null)
const viewport = ref<HTMLElement | null>(null)
const flow = ref<HTMLElement | null>(null)
const state = ref<AutoImageState>('pending')
const reason = ref<AutoImageReason | null>(null)

let lifecycle: AutoImageLifecycle | null = null
let measureFrame: number | null = null
let measureGeneration = 0
let measureCount = 0
let mounted = false
let warningKey: string | null = null
let managedItems: readonly AutoImageGroupDomItemSnapshot[] = []
let retainedPresentationIdentity: AutoImagePresentationIdentity | null = null

const managedProperties = [
  '--slidev-auto-image-image-inline-size',
  '--slidev-auto-image-image-block-size',
  '--slidev-auto-image-image-inline-offset',
  '--slidev-auto-image-image-block-offset',
  '--slidev-auto-image-caption-inline-size',
  '--slidev-auto-image-caption-inline-offset',
  '--slidev-auto-image-caption-block-offset',
] as const

interface AutoImagePresentationIdentity {
  readonly position: AutoImagePosition
  readonly items: readonly {
    readonly image: HTMLImageElement
    readonly caption: HTMLElement | null
    readonly imageWrapper: HTMLElement | null
    readonly source: string
  }[]
}

interface ManagedElementSnapshot {
  readonly element: HTMLElement
  readonly className: string
  readonly itemIndex: string | null
  readonly role: string | null
  readonly properties: readonly (readonly [typeof managedProperties[number], string])[]
}

interface CandidateMeasurementSnapshot {
  readonly managedItems: readonly AutoImageGroupDomItemSnapshot[]
  readonly elements: readonly ManagedElementSnapshot[]
}

function report(): AutoImageStateReport {
  return { state: state.value, reason: reason.value }
}

function publish(nextState: AutoImageState, nextReason: AutoImageReason | null): void {
  const changed = state.value !== nextState || reason.value !== nextReason
  state.value = nextState
  reason.value = nextReason
  if (nextState === 'pending' || nextState === 'fit')
    warningKey = null
  if (changed)
    emit('state-change', report())
  if (!changed)
    return

  if (nextState === 'overflow' && nextReason) {
    const nextKey = `overflow:${nextReason}`
    if (warningKey !== nextKey) {
      warningKey = nextKey
      console.warn(
        `[slidev-theme-umn-autolayout] AUTO IMAGE OVERFLOW (${nextReason}): managed image content exceeds its viewport.`,
      )
    }
  }
  else if (nextState === 'unsupported' && nextReason) {
    const nextKey = `unsupported:${nextReason}`
    if (warningKey !== nextKey) {
      warningKey = nextKey
      console.warn(
        `[slidev-theme-umn-autolayout] AUTO IMAGE UNSUPPORTED (${nextReason}): authored image content is shown without managed sizing.`,
      )
    }
  }
}

function removeManagedProperty(element: HTMLElement | null, property: string): void {
  element?.style.removeProperty(property)
}

function itemSource(image: HTMLImageElement): string {
  return `${image.currentSrc}\u0000${image.getAttribute('src') ?? ''}\u0000${image.getAttribute('srcset') ?? ''}`
}

function presentationIdentity(
  items: readonly AutoImageGroupDomItemSnapshot[],
): AutoImagePresentationIdentity {
  return {
    position: props.position,
    items: items.map(item => ({
      image: item.image,
      caption: item.caption,
      imageWrapper: item.imageWrapper,
      source: itemSource(item.image),
    })),
  }
}

function samePresentationIdentity(
  left: AutoImagePresentationIdentity,
  right: AutoImagePresentationIdentity,
): boolean {
  return left.position === right.position
    && left.items.length === right.items.length
    && left.items.every((item, index) => {
      const current = right.items[index]
      return current?.image === item.image
        && current.caption === item.caption
        && current.imageWrapper === item.imageWrapper
        && current.source === item.source
    })
}

function itemElements(item: AutoImageGroupDomItemSnapshot): readonly HTMLElement[] {
  return [item.image, item.caption, item.imageWrapper].filter(
    (element): element is HTMLElement => element !== null,
  )
}

function removeItemMarkers(item: AutoImageGroupDomItemSnapshot): void {
  for (const element of itemElements(item)) {
    element.classList.remove(
      'auto-image__managed-item',
      'auto-image__managed-image',
      'auto-image__managed-caption',
      'auto-image__managed-image-wrapper',
      'auto-image__omitted-item',
    )
    element.removeAttribute('data-auto-image-item-index')
    element.removeAttribute('data-auto-image-managed-role')
    for (const property of managedProperties)
      removeManagedProperty(element, property)
  }
}

function sameItems(items: readonly AutoImageGroupDomItemSnapshot[]): boolean {
  return items.length === managedItems.length
    && items.every((item, index) => {
      const current = managedItems[index]
      return current?.image === item.image
        && current.caption === item.caption
        && current.imageWrapper === item.imageWrapper
    })
}

function adoptManagedItems(items: readonly AutoImageGroupDomItemSnapshot[]): void {
  if (sameItems(items))
    return
  clearManagedStyles()
  managedItems = items
}

function clearManagedStyles(): void {
  for (const item of managedItems)
    removeItemMarkers(item)
  managedItems = []
}

function discardRetainedPresentation(): void {
  clearManagedStyles()
  retainedPresentationIdentity = null
}

function hasRetainedPresentation(identity: AutoImagePresentationIdentity): boolean {
  return retainedPresentationIdentity !== null
    && samePresentationIdentity(retainedPresentationIdentity, identity)
}

function preparePresentationIdentity(identity: AutoImagePresentationIdentity): boolean {
  if (retainedPresentationIdentity !== null
    && !samePresentationIdentity(retainedPresentationIdentity, identity)) {
    discardRetainedPresentation()
  }
  return hasRetainedPresentation(identity)
}

function snapshotCandidateMeasurement(
  items: readonly AutoImageGroupDomItemSnapshot[],
): CandidateMeasurementSnapshot {
  const elements = [...new Set(items.flatMap(item => itemElements(item)))].map(element => ({
    element,
    className: element.className,
    itemIndex: element.getAttribute('data-auto-image-item-index'),
    role: element.getAttribute('data-auto-image-managed-role'),
    properties: managedProperties.map(property => [property, element.style.getPropertyValue(property)] as const),
  }))
  return { managedItems, elements }
}

function restoreCandidateMeasurement(snapshot: CandidateMeasurementSnapshot): void {
  for (const element of snapshot.elements) {
    element.element.className = element.className
    if (element.itemIndex === null)
      element.element.removeAttribute('data-auto-image-item-index')
    else
      element.element.setAttribute('data-auto-image-item-index', element.itemIndex)
    if (element.role === null)
      element.element.removeAttribute('data-auto-image-managed-role')
    else
      element.element.setAttribute('data-auto-image-managed-role', element.role)
    for (const [property, value] of element.properties) {
      if (value)
        element.element.style.setProperty(property, value)
      else
        element.element.style.removeProperty(property)
    }
  }
  managedItems = snapshot.managedItems
}

function markManaged(item: AutoImageGroupDomItemSnapshot, index: number): void {
  item.image.classList.remove('auto-image__omitted-item')
  item.image.classList.add('auto-image__managed-item', 'auto-image__managed-image')
  item.image.setAttribute('data-auto-image-item-index', String(index))
  item.image.setAttribute('data-auto-image-managed-role', 'image')
  if (item.imageWrapper) {
    item.imageWrapper.classList.remove('auto-image__omitted-item')
    item.imageWrapper.classList.add(
      'auto-image__managed-item',
      'auto-image__managed-image-wrapper',
    )
    item.imageWrapper.setAttribute('data-auto-image-item-index', String(index))
    item.imageWrapper.setAttribute('data-auto-image-managed-role', 'image-wrapper')
  }
  if (item.caption) {
    item.caption.classList.remove('auto-image__omitted-item')
    item.caption.classList.add('auto-image__managed-item', 'auto-image__managed-caption')
    item.caption.setAttribute('data-auto-image-item-index', String(index))
    item.caption.setAttribute('data-auto-image-managed-role', 'caption')
  }
}

function markOmitted(item: AutoImageGroupDomItemSnapshot): void {
  for (const element of itemElements(item)) {
    element.classList.remove(
      'auto-image__managed-item',
      'auto-image__managed-image',
      'auto-image__managed-caption',
      'auto-image__managed-image-wrapper',
    )
    element.removeAttribute('data-auto-image-item-index')
    element.removeAttribute('data-auto-image-managed-role')
    for (const property of managedProperties)
      removeManagedProperty(element, property)
    element.classList.add('auto-image__omitted-item')
  }
}

function setManagedProperty(element: HTMLElement, property: string, value: number): void {
  if (!Number.isFinite(value))
    return
  const formatted = `${value}px`
  if (element.style.getPropertyValue(property) !== formatted)
    element.style.setProperty(property, formatted)
}

function contentBoxSize(element: HTMLElement): {
  readonly inlineSize: number
  readonly blockSize: number
} {
  const computed = getComputedStyle(element)
  const horizontalEdges = Number.parseFloat(computed.paddingLeft || '0')
    + Number.parseFloat(computed.paddingRight || '0')
    + Number.parseFloat(computed.borderLeftWidth || '0')
    + Number.parseFloat(computed.borderRightWidth || '0')
  const verticalEdges = Number.parseFloat(computed.paddingTop || '0')
    + Number.parseFloat(computed.paddingBottom || '0')
    + Number.parseFloat(computed.borderTopWidth || '0')
    + Number.parseFloat(computed.borderBottomWidth || '0')
  const inlineBoxSize = Number.parseFloat(computed.width || '0')
  const blockBoxSize = Number.parseFloat(computed.height || '0')
  const borderBox = computed.boxSizing === 'border-box'
  return {
    inlineSize: Math.max(0, inlineBoxSize - (borderBox ? horizontalEdges : 0)),
    blockSize: Math.max(0, blockBoxSize - (borderBox ? verticalEdges : 0)),
  }
}

function captionMeasurement(caption: HTMLElement): AutoImageCaptionMeasurement {
  const computed = getComputedStyle(caption)
  const borderBlock = Number.parseFloat(computed.borderTopWidth || '0')
    + Number.parseFloat(computed.borderBottomWidth || '0')
  const paddingBlock = Number.parseFloat(computed.paddingTop || '0')
    + Number.parseFloat(computed.paddingBottom || '0')
  const declaredBlockSize = Number.parseFloat(computed.height || '0')
  const borderBox = computed.boxSizing === 'border-box'
  return {
    borderBoxBlockSize: declaredBlockSize + (borderBox ? 0 : borderBlock + paddingBlock),
    scrollInlineSize: caption.scrollWidth,
    scrollBlockSize: caption.scrollHeight,
  }
}

function resolveCssLength(element: HTMLElement, property: string, fallback: number): number {
  const value = getComputedStyle(element).getPropertyValue(property).trim()
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/i.exec(value)
  if (!match)
    return fallback
  const numeric = Number.parseFloat(match[1]!)
  if (!Number.isFinite(numeric))
    return fallback
  if (match[2]?.toLowerCase() === 'rem') {
    const rootFontSize = Number.parseFloat(
      getComputedStyle(element.ownerDocument.documentElement).fontSize,
    )
    return numeric * (Number.isFinite(rootFontSize) ? rootFontSize : fallback)
  }
  if (match[2]?.toLowerCase() === 'em') {
    const fontSize = Number.parseFloat(getComputedStyle(element).fontSize)
    return numeric * (Number.isFinite(fontSize) ? fontSize : fallback)
  }
  return numeric
}

function resolveCaptionGap(element: HTMLElement): number {
  return resolveCssLength(element, '--slidev-auto-image-caption-gap', DEFAULT_AUTO_IMAGE_CAPTION_GAP)
}

function resolveItemGap(element: HTMLElement): number {
  return resolveCssLength(element, '--slidev-auto-image-item-gap', DEFAULT_AUTO_IMAGE_ITEM_GAP)
}

function applySingleGeometry(
  item: AutoImageGroupDomItemSnapshot,
  geometry: AutoImageFitGeometry,
): void {
  markManaged(item, 0)
  setManagedProperty(item.image, '--slidev-auto-image-image-inline-size', geometry.imageInlineSize)
  setManagedProperty(item.image, '--slidev-auto-image-image-block-size', geometry.imageBlockSize)
  setManagedProperty(item.image, '--slidev-auto-image-image-inline-offset', geometry.imageInlineOffset)
  setManagedProperty(item.image, '--slidev-auto-image-image-block-offset', geometry.blockOffset)
  if (item.caption) {
    setManagedProperty(item.caption, '--slidev-auto-image-caption-inline-size', geometry.captionInlineSize)
    setManagedProperty(item.caption, '--slidev-auto-image-caption-inline-offset', 0)
    setManagedProperty(
      item.caption,
      '--slidev-auto-image-caption-block-offset',
      geometry.blockOffset + geometry.imageBlockSize + geometry.captionGap,
    )
  }
}

function measureCaptionsAtInlineSizes(
  items: readonly AutoImageGroupDomItemSnapshot[],
  inlineSizes: readonly number[],
): readonly (AutoImageCaptionMeasurement | undefined)[] {
  // Apply the complete candidate allocation before any layout read. Caption
  // wraps can change discontinuously, so a candidate is only meaningful as
  // one shared rendered snapshot (multiple-images design §5.4).
  for (const [index, item] of items.entries()) {
    if (!item.caption)
      continue
    markManaged(item, index)
    setManagedProperty(
      item.caption,
      '--slidev-auto-image-caption-inline-size',
      inlineSizes[index]!,
    )
  }

  return items.map(item => item.caption ? captionMeasurement(item.caption) : undefined)
}

function groupInputs(
  items: readonly AutoImageGroupDomItemSnapshot[],
  captionMeasurements: readonly (AutoImageCaptionMeasurement | undefined)[],
): readonly AutoImageGroupItemInput[] {
  const container = root.value!
  return items.map((item, index) => ({
    aspectRatio: item.image.naturalWidth / item.image.naturalHeight,
    caption: item.caption ? captionMeasurements[index] : undefined,
    captionGap: item.caption ? resolveCaptionGap(container) : undefined,
  }))
}

function applyGroupGeometry(
  items: readonly AutoImageGroupDomItemSnapshot[],
  geometry: AutoImageGroupGeometry,
): void {
  for (const cell of geometry.cells) {
    const item = items[cell.index]!
    markManaged(item, cell.index)
    setManagedProperty(item.image, '--slidev-auto-image-image-inline-size', cell.imageInlineSize)
    setManagedProperty(item.image, '--slidev-auto-image-image-block-size', cell.imageBlockSize)
    setManagedProperty(
      item.image,
      '--slidev-auto-image-image-inline-offset',
      cell.inlineOffset + cell.imageInlineOffset,
    )
    setManagedProperty(
      item.image,
      '--slidev-auto-image-image-block-offset',
      geometry.blockOffset + cell.blockOffset + cell.imageBlockOffset,
    )
    if (item.caption) {
      setManagedProperty(item.caption, '--slidev-auto-image-caption-inline-size', cell.captionInlineSize)
      setManagedProperty(item.caption, '--slidev-auto-image-caption-inline-offset', cell.inlineOffset)
      setManagedProperty(
        item.caption,
        '--slidev-auto-image-caption-block-offset',
        geometry.blockOffset + cell.blockOffset + cell.captionBlockOffset,
      )
    }
  }
}

function calculateGroupGeometry(
  items: readonly AutoImageGroupDomItemSnapshot[],
  region: { readonly inlineSize: number, readonly blockSize: number },
): AutoImageGroupGeometry {
  const container = root.value!
  const itemGap = resolveItemGap(container)
  const initialCaptions = items.map(item => item.caption
    ? { borderBoxBlockSize: 0, scrollInlineSize: 0, scrollBlockSize: 0 }
    : undefined)

  if (props.position === 'left' || props.position === 'right') {
    const captions = measureCaptionsAtInlineSizes(
      items,
      items.map(() => region.inlineSize),
    )
    return calculateAutoImageColumnGroupGeometry({
      regionInlineSize: region.inlineSize,
      regionBlockSize: region.blockSize,
      itemGap,
      items: groupInputs(items, captions),
    })
  }

  return calculateAutoImageRowGroupGeometry({
    regionInlineSize: region.inlineSize,
    regionBlockSize: region.blockSize,
    itemGap,
    items: groupInputs(items, initialCaptions),
  }, snapshot => measureCaptionsAtInlineSizes(
    items,
    snapshot.cells.map(cell => cell.captionInlineSize),
  ))
}

function publishPending(): void {
  discardRetainedPresentation()
  publish('pending', null)
}

function hasUsableIntrinsicSize(image: HTMLImageElement): boolean {
  return image.naturalWidth > 0 && image.naturalHeight > 0
}

function hasFiniteCaptionMeasurement(
  measurement: AutoImageCaptionMeasurement | undefined,
): boolean {
  return measurement === undefined || areFiniteAutoImageValues([
    measurement.borderBoxBlockSize,
    measurement.scrollInlineSize,
    measurement.scrollBlockSize,
  ])
}

function hasFiniteSingleGeometry(
  geometry: AutoImageFitGeometry,
  caption: AutoImageCaptionMeasurement | undefined,
): boolean {
  return hasFiniteCaptionMeasurement(caption)
    && areFiniteAutoImageValues([
      geometry.regionInlineSize,
      geometry.regionBlockSize,
      geometry.availableImageBlockSize,
      geometry.imageInlineSize,
      geometry.imageBlockSize,
      geometry.imageInlineOffset,
      geometry.captionInlineSize,
      geometry.captionBlockSize,
      geometry.captionGap,
      geometry.groupBlockSize,
      geometry.blockOffset,
    ])
}

function hasFiniteGroupGeometry(geometry: AutoImageGroupGeometry): boolean {
  const values = [
    geometry.regionInlineSize,
    geometry.regionBlockSize,
    geometry.itemGap,
    geometry.actualItemGap,
    geometry.groupBlockSize,
    geometry.blockOffset,
  ]
  if (geometry.sharedImageInlineSize !== null)
    values.push(geometry.sharedImageInlineSize)
  if (geometry.sharedImageBlockSize !== null)
    values.push(geometry.sharedImageBlockSize)
  if (geometry.selectedCandidateHeight !== null)
    values.push(geometry.selectedCandidateHeight)
  for (const cell of geometry.cells) {
    values.push(
      cell.index,
      cell.inlineSize,
      cell.blockSize,
      cell.inlineOffset,
      cell.blockOffset,
      cell.baseInlineSize,
      cell.imageInlineSize,
      cell.imageBlockSize,
      cell.imageInlineOffset,
      cell.imageBlockOffset,
      cell.captionInlineSize,
      cell.captionBlockSize,
      cell.captionGap,
      cell.captionBlockOffset,
      cell.interItemGapAfter,
    )
  }
  return areFiniteAutoImageValues(values)
}

function calculateSingleGeometry(
  item: AutoImageGroupDomItemSnapshot,
  region: { readonly inlineSize: number, readonly blockSize: number },
): { readonly geometry: AutoImageFitGeometry, readonly caption: AutoImageCaptionMeasurement | undefined } {
  const caption = item.caption ? captionMeasurement(item.caption) : undefined
  const geometry = calculateAutoImageFitGeometry({
    regionInlineSize: region.inlineSize,
    regionBlockSize: region.blockSize,
    intrinsicInlineSize: item.image.naturalWidth,
    intrinsicBlockSize: item.image.naturalHeight,
    caption,
    captionGap: caption ? resolveCaptionGap(root.value!) : 0,
  })
  return { geometry, caption }
}

function retainFinitePresentation(
  identity: AutoImagePresentationIdentity,
  nextState: AutoImageState,
  nextReason: AutoImageReason | null,
): void {
  retainedPresentationIdentity = identity
  publish(nextState, nextReason)
}

function handleNonCommittableMeasurement(
  snapshot: CandidateMeasurementSnapshot,
  retainsCurrentPresentation: boolean,
): void {
  restoreCandidateMeasurement(snapshot)
  if (!retainsCurrentPresentation)
    publishPending()
}

function measure(generation: number): void {
  if (!mounted || generation !== measureGeneration || !root.value || !viewport.value || !flow.value)
    return

  lifecycle?.commitBarrier()
  if (!mounted || generation !== measureGeneration)
    return
  measureCount += 1
  if (import.meta.env.DEV || import.meta.env.MODE === 'test')
    root.value.setAttribute('data-auto-image-measure-count', String(measureCount))

  try {
    const snapshot = readAutoImageGroupDomSnapshot(flow.value)
    lifecycle?.setMediaTargets(snapshot.items.flatMap(item => [item.image, item.caption].filter(
      (target): target is HTMLElement => target !== null,
    )))
    if (!snapshot.classification.supported) {
      discardRetainedPresentation()
      publish('unsupported', snapshot.classification.reason)
      return
    }

    const items = snapshot.items
    const identity = presentationIdentity(items)
    const retainsCurrentPresentation = preparePresentationIdentity(identity)
    const singleItem = items.length === 1 ? items[0]! : null
    if (singleItem) {
      if (!singleItem.image.complete) {
        publishPending()
        return
      }
      if (!hasUsableIntrinsicSize(singleItem.image)) {
        discardRetainedPresentation()
        publish('unsupported', 'image-unavailable')
        return
      }
      const candidate = snapshotCandidateMeasurement(items)
      const { geometry, caption } = calculateSingleGeometry(
        singleItem,
        contentBoxSize(viewport.value),
      )
      if (!hasFiniteSingleGeometry(geometry, caption)) {
        handleNonCommittableMeasurement(candidate, retainsCurrentPresentation)
        return
      }
      adoptManagedItems(items)
      applySingleGeometry(singleItem, geometry)
      retainFinitePresentation(identity, geometry.status, geometry.reason)
      return
    }

    if (items.some(item => !item.image.complete)) {
      publishPending()
      return
    }

    const failed = new Set(items.filter(item => !hasUsableIntrinsicSize(item.image)))
    const survivors = items.filter(item => !failed.has(item))

    if (survivors.length === 0) {
      discardRetainedPresentation()
      adoptManagedItems(items)
      for (const item of items)
        markOmitted(item)
      publish('unsupported', 'image-unavailable')
      return
    }

    const region = contentBoxSize(viewport.value)
    if (survivors.length === 1) {
      if (failed.size > 0)
        discardRetainedPresentation()
      const candidate = snapshotCandidateMeasurement(items)
      const { geometry, caption } = calculateSingleGeometry(survivors[0]!, region)
      if (!hasFiniteSingleGeometry(geometry, caption)) {
        handleNonCommittableMeasurement(candidate, failed.size === 0 && retainsCurrentPresentation)
        return
      }
      adoptManagedItems(items)
      for (const item of items) {
        if (failed.has(item))
          markOmitted(item)
      }
      applySingleGeometry(survivors[0]!, geometry)
      retainFinitePresentation(identity, failed.size > 0 ? 'unsupported' : geometry.status, failed.size > 0
        ? 'image-unavailable'
        : geometry.reason)
      return
    }

    if (failed.size > 0)
      discardRetainedPresentation()
    const candidate = snapshotCandidateMeasurement(items)
    const geometry = calculateGroupGeometry(survivors, region)
    if (!hasFiniteGroupGeometry(geometry)) {
      handleNonCommittableMeasurement(candidate, failed.size === 0 && retainsCurrentPresentation)
      return
    }
    adoptManagedItems(items)
    for (const item of items) {
      if (failed.has(item))
        markOmitted(item)
    }
    applyGroupGeometry(survivors, geometry)
    retainFinitePresentation(identity, failed.size > 0 ? 'unsupported' : geometry.status, failed.size > 0
      ? 'image-unavailable'
      : geometry.reason)
  }
  finally {
    // Candidate caption sizing and final offsets are implementation details,
    // not author invalidations. Consuming their synchronous records prevents a
    // captioned group from scheduling itself forever.
    lifecycle?.commitManagedMutations()
  }
}

function requestMeasure(
  _reason: AutoImageInvalidationReason,
  details?: AutoImageInvalidationDetails,
): void {
  measureGeneration += 1
  if (details?.sourceChanged)
    publishPending()
  if (measureFrame !== null)
    return
  const generation = measureGeneration
  measureFrame = requestAnimationFrame(() => {
    measureFrame = null
    measure(generation === measureGeneration ? generation : measureGeneration)
  })
}

watch(() => props.position, () => requestMeasure('geometry'))

onMounted(async () => {
  await nextTick()
  if (!root.value || !viewport.value || !flow.value)
    return
  mounted = true
  lifecycle = createAutoImageLifecycle({
    root: root.value,
    viewport: viewport.value,
    flow: flow.value,
    invalidate: requestMeasure,
  })
  requestMeasure('content')
})

onBeforeUnmount(() => {
  mounted = false
  measureGeneration += 1
  if (measureFrame !== null)
    cancelAnimationFrame(measureFrame)
  measureFrame = null
  lifecycle?.dispose()
  lifecycle = null
})
</script>

<template>
  <div
    ref="root"
    class="auto-image"
    :class="`auto-image--${state}`"
    :data-auto-image-state="state"
    :data-auto-image-overflow-reason="state === 'overflow' ? reason : undefined"
    :data-auto-image-unsupported-reason="state === 'unsupported' ? reason : undefined"
  >
    <div ref="viewport" class="auto-image__viewport">
      <div ref="flow" class="auto-image__flow">
        <slot />
      </div>
    </div>
  </div>
</template>
