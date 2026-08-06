import {
  AUTO_IMAGE_FIT_TOLERANCE,
  calculateAutoImageCaptionBlockSize,
  DEFAULT_AUTO_IMAGE_CAPTION_GAP,
} from './geometry'
import type {
  AutoImageCaptionMeasurement,
  AutoImageGroupGeometry,
  AutoImageGroupGeometryInput,
  AutoImageGroupItemGeometry,
  AutoImageGroupOverflowReason,
  AutoImageRowCandidateSnapshot,
  AutoImageRowCaptionMeasurer,
} from './types'

/** The resolved 1rem default and minimum for coordinated image items. */
export const DEFAULT_AUTO_IMAGE_ITEM_GAP = 16

/**
 * Normalizes an already CSS-resolved item gap. CSS parsing remains at the DOM
 * boundary; the geometry contract receives pixels only.
 */
export function normalizeAutoImageItemGap(
  resolvedGap?: unknown,
): number {
  if (typeof resolvedGap !== 'number' || !Number.isFinite(resolvedGap))
    return DEFAULT_AUTO_IMAGE_ITEM_GAP
  return Math.max(DEFAULT_AUTO_IMAGE_ITEM_GAP, resolvedGap)
}

function captionGap(
  configuredGap: number | undefined,
  caption: AutoImageCaptionMeasurement | undefined,
): number {
  return caption ? (configuredGap ?? DEFAULT_AUTO_IMAGE_CAPTION_GAP) : 0
}

function inputCaptions(input: AutoImageGroupGeometryInput): readonly (AutoImageCaptionMeasurement | undefined)[] {
  return input.items.map(item => item.caption)
}

function captionInlineOverflow(
  cells: readonly AutoImageGroupItemGeometry[],
  captions: readonly (AutoImageCaptionMeasurement | undefined)[],
): boolean {
  return cells.some((cell, index) => {
    const caption = captions[index]
    return caption !== undefined
      && caption.scrollInlineSize > cell.captionInlineSize + AUTO_IMAGE_FIT_TOLERANCE
  })
}

function captionBlockOverflow(
  captions: readonly (AutoImageCaptionMeasurement | undefined)[],
  regionBlockSize: number,
): boolean {
  return captions.some(caption => caption !== undefined
    && calculateAutoImageCaptionBlockSize(caption) > regionBlockSize + AUTO_IMAGE_FIT_TOLERANCE)
}

function rowCellSpan(input: AutoImageGroupGeometryInput, itemGap: number): number {
  return input.regionInlineSize - itemGap * (input.items.length - 1)
}

function groupCaptions(
  input: AutoImageGroupGeometryInput,
  captions: readonly (AutoImageCaptionMeasurement | undefined)[] | undefined,
): readonly (AutoImageCaptionMeasurement | undefined)[] {
  return captions ?? inputCaptions(input)
}

/** The exact finite candidate sequence required for caption-aware row fitting. */
export function calculateAutoImageRowCandidateHeights(
  input: AutoImageGroupGeometryInput,
): readonly number[] {
  const itemGap = normalizeAutoImageItemGap(input.itemGap)
  const cellSpan = rowCellSpan(input, itemGap)
  const aspectRatioSum = input.items.reduce((total, item) => total + item.aspectRatio, 0)
  const hInlineMax = Math.max(0, cellSpan / aspectRatioSum)
  const candidates = [hInlineMax]
  const firstLatticePoint = Math.floor(hInlineMax / AUTO_IMAGE_FIT_TOLERANCE)

  for (let k = firstLatticePoint; k >= 0; k -= 1) {
    const latticePoint = k * AUTO_IMAGE_FIT_TOLERANCE
    if (k === firstLatticePoint && latticePoint === hInlineMax)
      continue
    candidates.push(latticePoint)
  }

  return candidates
}

/**
 * Builds one coherent row measurement snapshot. Captions must have been
 * measured using these exact cell allocations before their extents are passed
 * back into this function.
 */
export function calculateAutoImageRowCandidateSnapshot(
  input: AutoImageGroupGeometryInput,
  imageBlockSize: number,
  measuredCaptions?: readonly (AutoImageCaptionMeasurement | undefined)[],
  zeroHeightFallback = false,
): AutoImageRowCandidateSnapshot {
  const itemGap = normalizeAutoImageItemGap(input.itemGap)
  const cellSpan = rowCellSpan(input, itemGap)
  const captions = groupCaptions(input, measuredCaptions)
  const baseInlineSizes = input.items.map(item => imageBlockSize * item.aspectRatio)
  const baseInlineTotal = baseInlineSizes.reduce((total, width) => total + width, 0)
  const residualInlineSize = cellSpan - baseInlineTotal
  const extraInlineSize = zeroHeightFallback
    ? Math.max(0, cellSpan) / input.items.length
    : residualInlineSize / input.items.length
  let inlineOffset = 0

  const cells = input.items.map((item, index) => {
    const caption = captions[index]
    const imageInlineSize = zeroHeightFallback ? 0 : baseInlineSizes[index]
    const inlineSize = zeroHeightFallback
      ? extraInlineSize
      : baseInlineSizes[index] + extraInlineSize
    const currentInlineOffset = inlineOffset
    const resolvedCaptionGap = captionGap(item.captionGap, caption)
    const resolvedCaptionBlockSize = calculateAutoImageCaptionBlockSize(caption)
    const blockSize = imageBlockSize + resolvedCaptionGap + resolvedCaptionBlockSize
    inlineOffset += inlineSize + (index === input.items.length - 1 ? 0 : itemGap)

    return {
      index,
      inlineSize,
      blockSize,
      inlineOffset: currentInlineOffset,
      blockOffset: 0,
      baseInlineSize: baseInlineSizes[index],
      imageInlineSize,
      imageBlockSize,
      imageInlineOffset: (inlineSize - imageInlineSize) / 2,
      imageBlockOffset: 0,
      captionInlineSize: caption ? inlineSize : 0,
      captionBlockSize: resolvedCaptionBlockSize,
      captionGap: resolvedCaptionGap,
      captionBlockOffset: caption ? imageBlockSize + resolvedCaptionGap : 0,
      interItemGapAfter: index === input.items.length - 1 ? 0 : itemGap,
    } satisfies AutoImageGroupItemGeometry
  })
  const tallestItemBlockSize = Math.max(...cells.map(cell => cell.blockSize))

  return {
    imageBlockSize,
    cellSpan,
    residualInlineSize,
    extraInlineSize,
    captions,
    cells,
    tallestItemBlockSize,
    groupBlockSize: tallestItemBlockSize,
    blockOffset: Math.max(0, (input.regionBlockSize - tallestItemBlockSize) / 2),
  }
}

function measureRowSnapshot(
  input: AutoImageGroupGeometryInput,
  imageBlockSize: number,
  measureCaptions: AutoImageRowCaptionMeasurer | undefined,
  zeroHeightFallback = false,
): AutoImageRowCandidateSnapshot {
  const probe = calculateAutoImageRowCandidateSnapshot(
    input,
    imageBlockSize,
    undefined,
    zeroHeightFallback,
  )
  const captions = measureCaptions ? measureCaptions(probe) : inputCaptions(input)
  return calculateAutoImageRowCandidateSnapshot(
    input,
    imageBlockSize,
    captions,
    zeroHeightFallback,
  )
}

function rowOverflowReason(
  input: AutoImageGroupGeometryInput,
  snapshot: AutoImageRowCandidateSnapshot,
  selected: boolean,
  itemGap: number,
): AutoImageGroupOverflowReason | null {
  if (input.regionInlineSize <= AUTO_IMAGE_FIT_TOLERANCE)
    return 'zero-inline-space'
  if (input.regionBlockSize <= AUTO_IMAGE_FIT_TOLERANCE)
    return 'zero-block-space'
  if (rowCellSpan(input, itemGap) <= AUTO_IMAGE_FIT_TOLERANCE)
    return 'item-gap-overflow'
  if (captionInlineOverflow(snapshot.cells, snapshot.captions))
    return 'caption-inline-overflow'
  if (captionBlockOverflow(snapshot.captions, input.regionBlockSize))
    return 'caption-block-overflow'
  if (!selected) {
    const fixedBlockSize = Math.max(...snapshot.cells.map(cell => cell.captionGap + cell.captionBlockSize))
    return input.regionBlockSize - fixedBlockSize <= AUTO_IMAGE_FIT_TOLERANCE
      ? 'no-image-block-space'
      : 'no-renderable-image-size'
  }
  return null
}

/**
 * Selects the first feasible exact candidate, then rebuilds its measurement
 * snapshot once for deterministic final row geometry.
 */
export function calculateAutoImageRowGroupGeometry(
  input: AutoImageGroupGeometryInput,
  measureCaptions?: AutoImageRowCaptionMeasurer,
): AutoImageGroupGeometry {
  const itemGap = normalizeAutoImageItemGap(input.itemGap)
  let selectedCandidateHeight: number | null = null
  let selectedSnapshot: AutoImageRowCandidateSnapshot | null = null

  for (const candidateHeight of calculateAutoImageRowCandidateHeights(input)) {
    const snapshot = measureRowSnapshot(input, candidateHeight, measureCaptions)
    const inlineFits = snapshot.residualInlineSize >= -AUTO_IMAGE_FIT_TOLERANCE
    const blockFits = snapshot.tallestItemBlockSize <= input.regionBlockSize + AUTO_IMAGE_FIT_TOLERANCE
    if (candidateHeight > AUTO_IMAGE_FIT_TOLERANCE && inlineFits && blockFits) {
      selectedCandidateHeight = candidateHeight
      selectedSnapshot = measureRowSnapshot(input, candidateHeight, measureCaptions)
      break
    }
  }

  const snapshot = selectedSnapshot ?? measureRowSnapshot(input, 0, measureCaptions, true)
  const reason = rowOverflowReason(input, snapshot, selectedSnapshot !== null, itemGap)
  const retainImages = reason === null || reason === 'caption-inline-overflow'
  const finalSnapshot = snapshot

  return {
    orientation: 'row',
    status: reason === null ? 'fit' : 'overflow',
    reason,
    regionInlineSize: input.regionInlineSize,
    regionBlockSize: input.regionBlockSize,
    itemGap,
    actualItemGap: itemGap,
    sharedImageInlineSize: null,
    sharedImageBlockSize: retainImages ? finalSnapshot.imageBlockSize : 0,
    selectedCandidateHeight: retainImages ? selectedCandidateHeight : null,
    cells: finalSnapshot.cells,
    groupBlockSize: finalSnapshot.groupBlockSize,
    blockOffset: finalSnapshot.blockOffset,
    clipped: reason !== null,
  }
}

function calculateColumnCells(
  input: AutoImageGroupGeometryInput,
  imageInlineSize: number,
  actualItemGap: number,
): readonly AutoImageGroupItemGeometry[] {
  let blockOffset = 0
  return input.items.map((item, index) => {
    const caption = item.caption
    const imageBlockSize = imageInlineSize / item.aspectRatio
    const resolvedCaptionGap = captionGap(item.captionGap, caption)
    const resolvedCaptionBlockSize = calculateAutoImageCaptionBlockSize(caption)
    const blockSize = imageBlockSize + resolvedCaptionGap + resolvedCaptionBlockSize
    const currentBlockOffset = blockOffset
    const interItemGapAfter = index === input.items.length - 1 ? 0 : actualItemGap
    blockOffset += blockSize + interItemGapAfter

    return {
      index,
      inlineSize: input.regionInlineSize,
      blockSize,
      inlineOffset: 0,
      blockOffset: currentBlockOffset,
      baseInlineSize: imageInlineSize,
      imageInlineSize,
      imageBlockSize,
      imageInlineOffset: (input.regionInlineSize - imageInlineSize) / 2,
      imageBlockOffset: 0,
      captionInlineSize: caption ? input.regionInlineSize : 0,
      captionBlockSize: resolvedCaptionBlockSize,
      captionGap: resolvedCaptionGap,
      captionBlockOffset: caption ? imageBlockSize + resolvedCaptionGap : 0,
      interItemGapAfter,
    } satisfies AutoImageGroupItemGeometry
  })
}

function columnGroupBlockSize(cells: readonly AutoImageGroupItemGeometry[]): number {
  return cells.reduce((total, cell) => total + cell.blockSize + cell.interItemGapAfter, 0)
}

/**
 * Calculates a shared-width, caption-aware column. Its zero-width snapshots
 * intentionally retain only the required minimum gaps.
 */
export function calculateAutoImageColumnGroupGeometry(
  input: AutoImageGroupGeometryInput,
): AutoImageGroupGeometry {
  const itemGap = normalizeAutoImageItemGap(input.itemGap)
  const captions = inputCaptions(input)
  const fixedBlockSize = input.items.reduce((total, item, index) => {
    const itemCaption = captions[index]
    return total + captionGap(item.captionGap, itemCaption) + calculateAutoImageCaptionBlockSize(itemCaption)
  }, 0)
  const reciprocalAspectRatioSum = input.items.reduce(
    (total, item) => total + 1 / item.aspectRatio,
    0,
  )
  const minimumGapBlockSize = itemGap * (input.items.length - 1)
  const availableImageBlockSize = input.regionBlockSize - fixedBlockSize - minimumGapBlockSize
  const blockLimitedImageInlineSize = availableImageBlockSize / reciprocalAspectRatioSum
  const candidateImageInlineSize = Math.min(input.regionInlineSize, blockLimitedImageInlineSize)
  const positiveImageSize = candidateImageInlineSize > AUTO_IMAGE_FIT_TOLERANCE

  let reason: AutoImageGroupOverflowReason | null = null
  if (input.regionInlineSize <= AUTO_IMAGE_FIT_TOLERANCE)
    reason = 'zero-inline-space'
  else if (input.regionBlockSize <= AUTO_IMAGE_FIT_TOLERANCE)
    reason = 'zero-block-space'
  else if (input.regionBlockSize - minimumGapBlockSize <= AUTO_IMAGE_FIT_TOLERANCE)
    reason = 'item-gap-overflow'
  else {
    const captionCells = calculateColumnCells(input, 0, itemGap)
    if (captionInlineOverflow(captionCells, captions))
      reason = 'caption-inline-overflow'
    else if (captionBlockOverflow(captions, input.regionBlockSize))
      reason = 'caption-block-overflow'
    else if (!positiveImageSize) {
      reason = availableImageBlockSize <= AUTO_IMAGE_FIT_TOLERANCE
        ? 'no-image-block-space'
        : 'no-renderable-image-size'
    }
  }

  const retainImages = positiveImageSize && (reason === null || reason === 'caption-inline-overflow')
  if (!retainImages) {
    const cells = calculateColumnCells(input, 0, itemGap)
    const groupBlockSize = columnGroupBlockSize(cells)
    return {
      orientation: 'column',
      status: 'overflow',
      reason: reason ?? 'no-renderable-image-size',
      regionInlineSize: input.regionInlineSize,
      regionBlockSize: input.regionBlockSize,
      itemGap,
      actualItemGap: itemGap,
      sharedImageInlineSize: 0,
      sharedImageBlockSize: null,
      selectedCandidateHeight: null,
      cells,
      groupBlockSize,
      blockOffset: Math.max(0, (input.regionBlockSize - groupBlockSize) / 2),
      clipped: true,
    }
  }

  const minimumGapCells = calculateColumnCells(input, candidateImageInlineSize, itemGap)
  const residualBlockSize = input.regionBlockSize - columnGroupBlockSize(minimumGapCells)
  const actualItemGap = itemGap + residualBlockSize / (input.items.length - 1)
  const cells = calculateColumnCells(input, candidateImageInlineSize, actualItemGap)

  return {
    orientation: 'column',
    status: reason === null ? 'fit' : 'overflow',
    reason,
    regionInlineSize: input.regionInlineSize,
    regionBlockSize: input.regionBlockSize,
    itemGap,
    actualItemGap,
    sharedImageInlineSize: candidateImageInlineSize,
    sharedImageBlockSize: null,
    selectedCandidateHeight: null,
    cells,
    groupBlockSize: columnGroupBlockSize(cells),
    blockOffset: 0,
    clipped: reason !== null,
  }
}
