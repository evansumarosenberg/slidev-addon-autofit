import { describe, expect, it } from 'vitest'

import {
  AUTO_IMAGE_FIT_TOLERANCE,
  calculateAutoImageFitGeometry,
  calculateAutoImageSplitGeometry,
  calculateContainFit,
} from '../../utils/auto-image/geometry'
import {
  createAutoImageAutoTrackStyle,
  createAutoImageLayoutGeometryFingerprint,
  createAutoImageStageStyle,
  hasAutoImageSplitOverflow,
} from '../../utils/auto-image/layout'

describe('auto-image contain geometry', () => {
  it('uses the largest aspect-preserving landscape fit when upscaling', () => {
    expect(calculateContainFit({
      availableInlineSize: 400,
      availableBlockSize: 200,
      intrinsicInlineSize: 200,
      intrinsicBlockSize: 100,
    })).toEqual({
      inlineSize: 400,
      blockSize: 200,
      scale: 2,
    })
  })

  it('uses the largest aspect-preserving portrait fit when downscaling', () => {
    expect(calculateContainFit({
      availableInlineSize: 300,
      availableBlockSize: 200,
      intrinsicInlineSize: 400,
      intrinsicBlockSize: 800,
    })).toEqual({
      inlineSize: 100,
      blockSize: 200,
      scale: 0.25,
    })
  })

  it('keeps a square source square', () => {
    expect(calculateContainFit({
      availableInlineSize: 320,
      availableBlockSize: 240,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 100,
    })).toEqual({
      inlineSize: 240,
      blockSize: 240,
      scale: 2.4,
    })
  })

  it('measures caption space first and centers the complete figure group', () => {
    const result = calculateAutoImageFitGeometry({
      regionInlineSize: 400,
      regionBlockSize: 300,
      intrinsicInlineSize: 200,
      intrinsicBlockSize: 100,
      captionGap: 16,
      caption: {
        borderBoxBlockSize: 40,
        scrollInlineSize: 400,
        scrollBlockSize: 40,
      },
    })

    expect(result).toMatchObject({
      status: 'fit',
      reason: null,
      availableImageBlockSize: 244,
      imageInlineSize: 400,
      imageBlockSize: 200,
      imageInlineOffset: 0,
      captionInlineSize: 400,
      captionBlockSize: 40,
      captionGap: 16,
      groupBlockSize: 256,
      blockOffset: 22,
      clipped: false,
    })
  })

  it('centers a captionless image as the image itself', () => {
    expect(calculateAutoImageFitGeometry({
      regionInlineSize: 500,
      regionBlockSize: 300,
      intrinsicInlineSize: 400,
      intrinsicBlockSize: 100,
    })).toMatchObject({
      status: 'fit',
      imageInlineSize: 500,
      imageBlockSize: 125,
      imageInlineOffset: 0,
      captionInlineSize: 0,
      captionBlockSize: 0,
      captionGap: 0,
      groupBlockSize: 125,
      blockOffset: 87.5,
    })
  })

  it.each([
    ['zero-inline-space', {
      regionInlineSize: AUTO_IMAGE_FIT_TOLERANCE,
      regionBlockSize: 100,
    }, {
      status: 'overflow',
      reason: 'zero-inline-space',
      regionInlineSize: AUTO_IMAGE_FIT_TOLERANCE,
      regionBlockSize: 100,
      availableImageBlockSize: 100,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: AUTO_IMAGE_FIT_TOLERANCE / 2,
      captionInlineSize: 0,
      captionBlockSize: 0,
      captionGap: 0,
      groupBlockSize: 0,
      blockOffset: 50,
      clipped: true,
    }],
    ['zero-block-space', {
      regionInlineSize: 100,
      regionBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
    }, {
      status: 'overflow',
      reason: 'zero-block-space',
      regionInlineSize: 100,
      regionBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
      availableImageBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 0,
      captionBlockSize: 0,
      captionGap: 0,
      groupBlockSize: 0,
      blockOffset: AUTO_IMAGE_FIT_TOLERANCE / 2,
      clipped: true,
    }],
    ['caption-inline-overflow', {
      regionInlineSize: 100,
      regionBlockSize: 100,
      caption: { borderBoxBlockSize: 10, scrollInlineSize: 100.51, scrollBlockSize: 10 },
    }, {
      status: 'overflow',
      reason: 'caption-inline-overflow',
      regionInlineSize: 100,
      regionBlockSize: 100,
      availableImageBlockSize: 74,
      imageInlineSize: 74,
      imageBlockSize: 74,
      imageInlineOffset: 13,
      captionInlineSize: 100,
      captionBlockSize: 10,
      captionGap: 16,
      groupBlockSize: 100,
      blockOffset: 0,
      clipped: true,
    }],
    ['caption-block-overflow', {
      regionInlineSize: 100,
      regionBlockSize: 100,
      caption: { borderBoxBlockSize: 100.51, scrollInlineSize: 100, scrollBlockSize: 100.51 },
    }, {
      status: 'overflow',
      reason: 'caption-block-overflow',
      regionInlineSize: 100,
      regionBlockSize: 100,
      availableImageBlockSize: 100 - 100.51 - 16,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 100,
      captionBlockSize: 100.51,
      captionGap: 16,
      groupBlockSize: 116.51,
      blockOffset: 0,
      clipped: true,
    }],
    ['no-image-block-space', {
      regionInlineSize: 100,
      regionBlockSize: 20,
      caption: { borderBoxBlockSize: 10, scrollInlineSize: 100, scrollBlockSize: 10 },
      captionGap: 10,
    }, {
      status: 'overflow',
      reason: 'no-image-block-space',
      regionInlineSize: 100,
      regionBlockSize: 20,
      availableImageBlockSize: 0,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 100,
      captionBlockSize: 10,
      captionGap: 10,
      groupBlockSize: 20,
      blockOffset: 0,
      clipped: true,
    }],
    ['no-renderable-image-size', {
      regionInlineSize: 100,
      regionBlockSize: 1,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 1000,
    }, {
      status: 'overflow',
      reason: 'no-renderable-image-size',
      regionInlineSize: 100,
      regionBlockSize: 1,
      availableImageBlockSize: 1,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 0,
      captionBlockSize: 0,
      captionGap: 0,
      groupBlockSize: 0,
      blockOffset: 0.5,
      clipped: true,
    }],
  ] as const)('publishes closed overflow reason %s with exact geometry', (reason, overrides, expected) => {
    const result = calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: 100,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 100,
      ...overrides,
    })

    expect(result).toEqual(expected)
  })

  it('does not classify exact caption-inline tolerance as overflow', () => {
    expect(calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: 100,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 100,
      caption: {
        borderBoxBlockSize: 10,
        scrollInlineSize: 100 + AUTO_IMAGE_FIT_TOLERANCE,
        scrollBlockSize: 10,
      },
    })).toEqual({
      status: 'fit',
      reason: null,
      regionInlineSize: 100,
      regionBlockSize: 100,
      availableImageBlockSize: 74,
      imageInlineSize: 74,
      imageBlockSize: 74,
      imageInlineOffset: 13,
      captionInlineSize: 100,
      captionBlockSize: 10,
      captionGap: 16,
      groupBlockSize: 100,
      blockOffset: 0,
      clipped: false,
    })
  })

  it('gives zero-inline-space precedence over all later overflow reasons', () => {
    expect(calculateAutoImageFitGeometry({
      regionInlineSize: AUTO_IMAGE_FIT_TOLERANCE,
      regionBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
      caption: {
        borderBoxBlockSize: 1,
        scrollInlineSize: 1.01,
        scrollBlockSize: 1,
      },
    })).toEqual({
      status: 'overflow',
      reason: 'zero-inline-space',
      regionInlineSize: AUTO_IMAGE_FIT_TOLERANCE,
      regionBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
      availableImageBlockSize: -16.5,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: AUTO_IMAGE_FIT_TOLERANCE / 2,
      captionInlineSize: AUTO_IMAGE_FIT_TOLERANCE,
      captionBlockSize: 1,
      captionGap: 16,
      groupBlockSize: 17,
      blockOffset: 0,
      clipped: true,
    })
  })

  it('gives zero-block-space precedence over caption overflow at the tolerance boundary', () => {
    expect(calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
      caption: {
        borderBoxBlockSize: 1,
        scrollInlineSize: 100.51,
        scrollBlockSize: 1,
      },
    })).toEqual({
      status: 'overflow',
      reason: 'zero-block-space',
      regionInlineSize: 100,
      regionBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
      availableImageBlockSize: -16.5,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 100,
      captionBlockSize: 1,
      captionGap: 16,
      groupBlockSize: 17,
      blockOffset: 0,
      clipped: true,
    })
  })

  it('gives caption-inline-overflow precedence over caption-block-overflow', () => {
    expect(calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: 100,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 100,
      caption: {
        borderBoxBlockSize: 101,
        scrollInlineSize: 100.51,
        scrollBlockSize: 101,
      },
    })).toEqual({
      status: 'overflow',
      reason: 'caption-inline-overflow',
      regionInlineSize: 100,
      regionBlockSize: 100,
      availableImageBlockSize: -17,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 100,
      captionBlockSize: 101,
      captionGap: 16,
      groupBlockSize: 117,
      blockOffset: 0,
      clipped: true,
    })
  })

  it('uses no-image-block-space at the exact remaining-image tolerance', () => {
    expect(calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: 26.5,
      captionGap: 16,
      caption: {
        borderBoxBlockSize: 10,
        scrollInlineSize: 100,
        scrollBlockSize: 10,
      },
    })).toEqual({
      status: 'overflow',
      reason: 'no-image-block-space',
      regionInlineSize: 100,
      regionBlockSize: 26.5,
      availableImageBlockSize: AUTO_IMAGE_FIT_TOLERANCE,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 100,
      captionBlockSize: 10,
      captionGap: 16,
      groupBlockSize: 26,
      blockOffset: 0.25,
      clipped: true,
    })
  })

  it('uses no-renderable-image-size when a fitted dimension equals the tolerance', () => {
    expect(calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: 5,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 1000,
    })).toEqual({
      status: 'overflow',
      reason: 'no-renderable-image-size',
      regionInlineSize: 100,
      regionBlockSize: 5,
      availableImageBlockSize: 5,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 0,
      captionBlockSize: 0,
      captionGap: 0,
      groupBlockSize: 0,
      blockOffset: 2.5,
      clipped: true,
    })
  })

  it('keeps a caption-inline overflow reason when no positive image can render', () => {
    const result = calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: 20,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 100,
      captionGap: 10,
      caption: {
        borderBoxBlockSize: 10,
        scrollInlineSize: 100.51,
        scrollBlockSize: 10,
      },
    })

    expect(result).toEqual({
      status: 'overflow',
      reason: 'caption-inline-overflow',
      regionInlineSize: 100,
      regionBlockSize: 20,
      availableImageBlockSize: 0,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 100,
      captionBlockSize: 10,
      captionGap: 10,
      groupBlockSize: 20,
      blockOffset: 0,
      clipped: true,
    })
  })

  it('retains caption and gap geometry while clipping an over-height group', () => {
    const result = calculateAutoImageFitGeometry({
      regionInlineSize: 100,
      regionBlockSize: 30,
      intrinsicInlineSize: 100,
      intrinsicBlockSize: 100,
      captionGap: 10,
      caption: {
        borderBoxBlockSize: 25,
        scrollInlineSize: 100,
        scrollBlockSize: 25,
      },
    })

    expect(result).toEqual({
      status: 'overflow',
      reason: 'no-image-block-space',
      regionInlineSize: 100,
      regionBlockSize: 30,
      availableImageBlockSize: -5,
      imageInlineSize: 0,
      imageBlockSize: 0,
      imageInlineOffset: 50,
      captionInlineSize: 100,
      captionBlockSize: 25,
      captionGap: 10,
      groupBlockSize: 35,
      blockOffset: 0,
      clipped: true,
    })
  })
})

describe('auto-image split geometry', () => {
  it('includes the resolved region gap when track boxes are unchanged', () => {
    const base = {
      position: 'left' as const,
      size: 40,
      defaultDeclared: true,
      autoDeclared: true,
      footerDeclared: true,
      stage: { inlineSize: 1000, blockSize: 500 },
      imageTrack: { inlineSize: 400, blockSize: 500 },
      autoTrack: { inlineSize: 584, blockSize: 500 },
      regionGap: 16,
    }

    expect(createAutoImageLayoutGeometryFingerprint(base)).not.toBe(
      createAutoImageLayoutGeometryFingerprint({
        ...base,
        regionGap: 32,
      }),
    )
  })

  it('distinguishes supported sub-pixel geometry without quantization', () => {
    const base = {
      position: 'left' as const,
      size: 40,
      defaultDeclared: true,
      autoDeclared: true,
      footerDeclared: true,
      stage: { inlineSize: 1000.0004, blockSize: 500.0004 },
      imageTrack: { inlineSize: 400.0004, blockSize: 500.0004 },
      autoTrack: { inlineSize: 584.0004, blockSize: 500.0004 },
      regionGap: 15.9994,
    }

    expect(createAutoImageLayoutGeometryFingerprint(base)).not.toBe(
      createAutoImageLayoutGeometryFingerprint({
        ...base,
        stage: { inlineSize: 1000.00045, blockSize: 500.00045 },
        imageTrack: { inlineSize: 400.00045, blockSize: 500.00045 },
        autoTrack: { inlineSize: 584.00045, blockSize: 500.00045 },
        regionGap: 15.99945,
      }),
    )
  })

  it.each([
    ['left', 1000.0004, 800.0004],
    ['right', 1000.0004, 800.0004],
    ['top', 1000.0004, 800.0004],
    ['bottom', 1000.0004, 800.0004],
    ['center', 1000.0004, 800.0004],
  ] as const)('keeps an exact %s 100%% allocation below a zero gap', (position, availableInlineSize, availableBlockSize) => {
    expect(hasAutoImageSplitOverflow(
      { position, size: 100 },
      availableInlineSize,
      availableBlockSize,
      0,
      true,
    )).toBe(false)
  })

  it.each([
    ['left', 'inline', 'image-first'],
    ['right', 'inline', 'auto-first'],
    ['top', 'block', 'image-first'],
    ['bottom', 'block', 'auto-first'],
  ] as const)('uses the approved %s axis and order', (position, axis, order) => {
    const result = calculateAutoImageSplitGeometry({
      position,
      availableInlineSize: 1000,
      availableBlockSize: 800,
      imagePercentage: 40,
      regionGap: 16,
      autoDeclared: true,
    })

    expect(result).toMatchObject({ axis, order, imagePercentage: 40 })
    if (axis === 'inline') {
      expect(result.imageAxisSize).toBe(400)
      expect(result.autoAxisSize).toBe(584)
    }
    else {
      expect(result.imageAxisSize).toBe(320)
      expect(result.autoAxisSize).toBe(464)
    }
  })

  it('uses the complete available dimension before deducting the gap', () => {
    const result = calculateAutoImageSplitGeometry({
      position: 'left',
      availableInlineSize: 1000,
      availableBlockSize: 500,
      imagePercentage: 50,
      regionGap: 100,
      autoDeclared: true,
    })

    expect(result.imageAxisSize).toBe(500)
    expect(result.autoAxisSize).toBe(400)
    expect(result.gapSize).toBe(100)
    expect(result.splitOverflow).toBe(false)
  })

  it('deducts the gap only for a declared AutoFit region', () => {
    const result = calculateAutoImageSplitGeometry({
      position: 'right',
      availableInlineSize: 1000,
      availableBlockSize: 500,
      imagePercentage: 40,
      regionGap: 100,
      autoDeclared: false,
    })

    expect(result).toMatchObject({
      imageAxisSize: 400,
      autoAxisSize: 0,
      gapSize: 0,
      splitOverflow: false,
      imageAxisOffset: 600,
      blankBefore: 600,
      blankAfter: 0,
    })
  })

  it('keeps the omitted AutoFit remainder blank on the image trailing side', () => {
    const result = calculateAutoImageSplitGeometry({
      position: 'left',
      availableInlineSize: 1000,
      availableBlockSize: 500,
      imagePercentage: 40,
      regionGap: 100,
      autoDeclared: false,
    })

    expect(result).toMatchObject({
      imageAxisSize: 400,
      imageAxisOffset: 0,
      blankBefore: 0,
      blankAfter: 600,
      gapSize: 0,
      splitOverflow: false,
    })
  })

  it.each([
    [0, false, 0, false],
    [100, false, 0, false],
    [98, true, 0, true],
    [96, true, 0, false],
    [40, true, 56, false],
  ] as const)('handles percentage %s and gap remainder', (imagePercentage, autoDeclared, autoAxisSize, splitOverflow) => {
    const result = calculateAutoImageSplitGeometry({
      position: 'left',
      availableInlineSize: 100,
      availableBlockSize: 200,
      imagePercentage,
      regionGap: 4,
      autoDeclared,
    })

    expect(result).toMatchObject({ autoAxisSize, splitOverflow })
  })

  it('keeps the authoritative image and gap when the remainder is infeasible', () => {
    const result = calculateAutoImageSplitGeometry({
      position: 'bottom',
      availableInlineSize: 300,
      availableBlockSize: 100,
      imagePercentage: 100,
      regionGap: 16,
      autoDeclared: true,
    })

    expect(result).toMatchObject({
      imageAxisSize: 100,
      autoAxisSize: 0,
      gapSize: 16,
      splitOverflow: true,
      autoAxisOffset: 0,
      imageAxisOffset: 16,
    })
  })

  it('centers a center image with equal blank-side allocation and no AutoFit', () => {
    const result = calculateAutoImageSplitGeometry({
      position: 'center',
      availableInlineSize: 1000,
      availableBlockSize: 500,
      imagePercentage: 40,
      regionGap: 16,
      autoDeclared: false,
    })

    expect(result).toMatchObject({
      axis: 'inline',
      order: 'center',
      imageAxisSize: 400,
      autoAxisSize: 0,
      gapSize: 0,
      splitOverflow: false,
      imageAxisOffset: 300,
      blankBefore: 300,
      blankAfter: 300,
    })
  })

  it('places center AutoFit below a centered image in the block remainder', () => {
    const result = calculateAutoImageSplitGeometry({
      position: 'center',
      availableInlineSize: 1000,
      availableBlockSize: 500,
      imagePercentage: 40,
      regionGap: 16,
      autoDeclared: true,
    })

    expect(result).toMatchObject({
      axis: 'block',
      order: 'center',
      imageInlineSize: 400,
      imageBlockSize: 200,
      imageInlineOffset: 300,
      autoInlineSize: 1000,
      autoBlockSize: 284,
      autoBlockOffset: 216,
      gapSize: 16,
      splitOverflow: false,
    })
    expect(createAutoImageStageStyle({ position: 'center', size: 40 }, true)).toEqual({
      gridTemplateColumns: 'minmax(0, 1fr) 40% minmax(0, 1fr)',
      gridTemplateRows: '40% var(--slidev-auto-image-region-gap) minmax(0, calc(100% - 40% - var(--slidev-auto-image-region-gap)))',
    })
    expect(createAutoImageAutoTrackStyle({ position: 'center', size: 40 })).toEqual({
      gridColumn: '1 / -1',
      gridRow: '3',
    })
    expect(hasAutoImageSplitOverflow({ position: 'center', size: 100 }, 1000, 500, 16, true)).toBe(true)
  })
})
