import type {
  AutoImageContainGeometry,
  AutoImageContainInput,
  AutoImageFitGeometry,
  AutoImageFitInput,
  AutoImagePosition,
  AutoImageSplitGeometry,
  AutoImageSplitInput,
} from './types'

export const AUTO_IMAGE_FIT_TOLERANCE = 0.5
export const DEFAULT_AUTO_IMAGE_CAPTION_GAP = 16

export function calculateAutoImageCaptionBlockSize(
  caption: AutoImageFitInput['caption'],
): number {
  return caption ? Math.max(caption.borderBoxBlockSize, caption.scrollBlockSize) : 0
}

export function calculateContainFit(
  input: AutoImageContainInput,
): AutoImageContainGeometry {
  const inlineScale = input.availableInlineSize / input.intrinsicInlineSize
  const blockScale = input.availableBlockSize / input.intrinsicBlockSize
  const scale = Math.min(inlineScale, blockScale)

  return {
    inlineSize: input.intrinsicInlineSize * scale,
    blockSize: input.intrinsicBlockSize * scale,
    scale,
  }
}

function emptyImageGeometry(): Pick<AutoImageFitGeometry, 'imageInlineSize' | 'imageBlockSize'> {
  return { imageInlineSize: 0, imageBlockSize: 0 }
}

export function calculateAutoImageFitGeometry(
  input: AutoImageFitInput,
): AutoImageFitGeometry {
  const captionBlockSize = calculateAutoImageCaptionBlockSize(input.caption)
  const captionGap = input.caption ? (input.captionGap ?? DEFAULT_AUTO_IMAGE_CAPTION_GAP) : 0
  const availableImageBlockSize = input.regionBlockSize - captionBlockSize - captionGap
  const captionInlineOverflow = input.caption !== undefined
    && input.caption.scrollInlineSize > input.regionInlineSize + AUTO_IMAGE_FIT_TOLERANCE

  let reason: AutoImageFitGeometry['reason'] = null
  if (input.regionInlineSize <= AUTO_IMAGE_FIT_TOLERANCE)
    reason = 'zero-inline-space'
  else if (input.regionBlockSize <= AUTO_IMAGE_FIT_TOLERANCE)
    reason = 'zero-block-space'
  else if (captionInlineOverflow)
    reason = 'caption-inline-overflow'
  else if (input.caption && captionBlockSize > input.regionBlockSize + AUTO_IMAGE_FIT_TOLERANCE)
    reason = 'caption-block-overflow'
  else if (input.caption && availableImageBlockSize <= AUTO_IMAGE_FIT_TOLERANCE)
    reason = 'no-image-block-space'

  let imageInlineSize = 0
  let imageBlockSize = 0
  if (reason === null || reason === 'caption-inline-overflow') {
    const fit = calculateContainFit({
      availableInlineSize: input.regionInlineSize,
      availableBlockSize: availableImageBlockSize,
      intrinsicInlineSize: input.intrinsicInlineSize,
      intrinsicBlockSize: input.intrinsicBlockSize,
    })
    if (fit.inlineSize <= AUTO_IMAGE_FIT_TOLERANCE || fit.blockSize <= AUTO_IMAGE_FIT_TOLERANCE) {
      if (reason === null)
        reason = 'no-renderable-image-size'
    }
    else {
      imageInlineSize = fit.inlineSize
      imageBlockSize = fit.blockSize
    }
  }

  if (reason !== null && reason !== 'caption-inline-overflow') {
    ({ imageInlineSize, imageBlockSize } = emptyImageGeometry())
  }

  const groupBlockSize = imageBlockSize + captionGap + captionBlockSize
  return {
    status: reason === null ? 'fit' : 'overflow',
    reason,
    regionInlineSize: input.regionInlineSize,
    regionBlockSize: input.regionBlockSize,
    availableImageBlockSize,
    imageInlineSize,
    imageBlockSize,
    imageInlineOffset: Math.max(0, (input.regionInlineSize - imageInlineSize) / 2),
    captionInlineSize: input.caption ? input.regionInlineSize : 0,
    captionBlockSize,
    captionGap,
    groupBlockSize,
    blockOffset: Math.max(0, (input.regionBlockSize - groupBlockSize) / 2),
    clipped: reason !== null,
  }
}

function splitAxis(position: AutoImagePosition): 'inline' | 'block' {
  return position === 'top' || position === 'bottom' ? 'block' : 'inline'
}

function splitOrder(position: AutoImagePosition): AutoImageSplitGeometry['order'] {
  if (position === 'center')
    return 'center'
  return position === 'right' || position === 'bottom' ? 'auto-first' : 'image-first'
}

export function calculateAutoImageSplitGeometry(
  input: AutoImageSplitInput,
): AutoImageSplitGeometry {
  const axis = splitAxis(input.position)
  const order = splitOrder(input.position)
  const availableAxisSize = axis === 'inline'
    ? input.availableInlineSize
    : input.availableBlockSize
  const imageAxisSize = availableAxisSize * input.imagePercentage / 100

  if (input.position === 'center') {
    const blankSide = (input.availableInlineSize - imageAxisSize) / 2
    return {
      position: input.position,
      axis,
      order,
      imagePercentage: input.imagePercentage,
      imageAxisSize,
      autoAxisSize: 0,
      gapSize: 0,
      splitOverflow: false,
      imageAxisOffset: blankSide,
      autoAxisOffset: 0,
      blankBefore: blankSide,
      blankAfter: blankSide,
      imageInlineSize: imageAxisSize,
      imageBlockSize: input.availableBlockSize,
      autoInlineSize: 0,
      autoBlockSize: 0,
      imageInlineOffset: blankSide,
      imageBlockOffset: 0,
      autoInlineOffset: 0,
      autoBlockOffset: 0,
    }
  }

  const gapSize = input.autoDeclared ? input.regionGap : 0
  const remainderBeforeGap = availableAxisSize - imageAxisSize
  const autoAxisSize = input.autoDeclared
    ? Math.max(0, remainderBeforeGap - gapSize)
    : 0
  const splitOverflow = input.autoDeclared && remainderBeforeGap < gapSize
  const imageAxisOffset = input.autoDeclared
    ? order === 'auto-first' ? autoAxisSize + gapSize : 0
    : order === 'auto-first' ? availableAxisSize - imageAxisSize : 0
  const autoAxisOffset = order === 'auto-first' ? 0 : imageAxisSize + gapSize

  const imageInlineSize = axis === 'inline' ? imageAxisSize : input.availableInlineSize
  const imageBlockSize = axis === 'block' ? imageAxisSize : input.availableBlockSize
  const autoInlineSize = axis === 'inline' ? autoAxisSize : input.availableInlineSize
  const autoBlockSize = axis === 'block' ? autoAxisSize : input.availableBlockSize
  const imageInlineOffset = axis === 'inline' ? imageAxisOffset : 0
  const imageBlockOffset = axis === 'block' ? imageAxisOffset : 0
  const autoInlineOffset = axis === 'inline' ? autoAxisOffset : 0
  const autoBlockOffset = axis === 'block' ? autoAxisOffset : 0
  const blankAxisSize = input.autoDeclared
    ? 0
    : Math.max(0, availableAxisSize - imageAxisSize)

  return {
    position: input.position,
    axis,
    order,
    imagePercentage: input.imagePercentage,
    imageAxisSize,
    autoAxisSize,
    gapSize,
    splitOverflow,
    imageAxisOffset,
    autoAxisOffset,
    blankBefore: order === 'auto-first' ? blankAxisSize : 0,
    blankAfter: order === 'image-first' ? blankAxisSize : 0,
    imageInlineSize,
    imageBlockSize,
    autoInlineSize,
    autoBlockSize,
    imageInlineOffset,
    imageBlockOffset,
    autoInlineOffset,
    autoBlockOffset,
  }
}
