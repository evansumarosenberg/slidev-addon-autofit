import { describe, expect, it } from 'vitest'

import {
  DEFAULT_AUTO_IMAGE_ITEM_GAP,
  calculateAutoImageColumnGroupGeometry,
  calculateAutoImageRowCandidateHeights,
  calculateAutoImageRowCandidateSnapshot,
  calculateAutoImageRowGroupGeometry,
  normalizeAutoImageItemGap,
} from '../../utils/auto-image/group-geometry'

const caption = (blockSize: number, scrollInlineSize = 0) => ({
  borderBoxBlockSize: blockSize,
  scrollBlockSize: blockSize,
  scrollInlineSize,
})

describe('auto-image group row geometry', () => {
  const row = {
    regionInlineSize: 100,
    regionBlockSize: 80,
    itemGap: 16,
    items: [
      { aspectRatio: 2 },
      { aspectRatio: 0.5 },
      { aspectRatio: 1 },
    ],
  }

  it.each([
    ['zero hInlineMax', 16, [0]],
    ['hInlineMax below the lattice', 16.75, [0.375, 0]],
    ['hInlineMax on the lattice', 17, [0.5, 0]],
    ['hInlineMax between lattice values', 17.25, [0.625, 0.5, 0]],
  ] as const)('builds the exact normative candidate sequence for %s', (_label, regionInlineSize, expected) => {
    expect(calculateAutoImageRowCandidateHeights({
      regionInlineSize,
      regionBlockSize: 100,
      itemGap: 16,
      items: [{ aspectRatio: 1 }, { aspectRatio: 1 }],
    })).toEqual(expected)
  })

  it('keeps hInlineMax before every lattice candidate when it is not identical', () => {
    const candidates = calculateAutoImageRowCandidateHeights({
      regionInlineSize: 17.25,
      regionBlockSize: 100,
      itemGap: 16,
      items: [{ aspectRatio: 1 }, { aspectRatio: 1 }],
    })

    expect(candidates.slice(0, 3)).toEqual([0.625, 0.5, 0])
  })

  it('uses aspect-derived variable cell widths with one equal additive residual', () => {
    const snapshot = calculateAutoImageRowCandidateSnapshot(row, 10, [
      caption(5),
      undefined,
      caption(20),
    ])

    expect(snapshot.cells.map(cell => cell.baseInlineSize)).toEqual([20, 5, 10])
    expect(snapshot.cells.map(cell => cell.inlineSize)).toEqual([31, 16, 21])
    expect(snapshot.cells.map(cell => cell.imageInlineOffset)).toEqual([5.5, 5.5, 5.5])
    expect(snapshot.cells.reduce((total, cell) => total + cell.inlineSize, 0) + 32).toBe(100)
    expect(snapshot.tallestItemBlockSize).toBe(46)
    expect(snapshot.blockOffset).toBe(17)
  })

  it('selects the first feasible normative candidate despite non-monotonic caption measurements', () => {
    const result = calculateAutoImageRowGroupGeometry({
      regionInlineSize: 116,
      regionBlockSize: 70,
      itemGap: 16,
      items: [{ aspectRatio: 1, captionGap: 16 }, { aspectRatio: 1 }],
    }, ({ imageBlockSize }) => [
      caption(imageBlockSize === 50 ? 50 : 0),
      undefined,
    ])

    expect(result).toMatchObject({
      status: 'fit',
      reason: null,
      sharedImageBlockSize: 49.5,
      selectedCandidateHeight: 49.5,
    })
    expect(result.cells.map(cell => cell.inlineSize)).toEqual([50, 50])
  })

  it('keeps selected row output and overflow classification tied to one final caption snapshot', () => {
    let measurementCount = 0
    const result = calculateAutoImageRowGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 100,
      itemGap: 16,
      items: [{ aspectRatio: 1, captionGap: 4 }, { aspectRatio: 1 }],
    }, (snapshot) => {
      measurementCount += 1
      return measurementCount === 2
        ? [caption(13, snapshot.cells[0].inlineSize + 0.51), undefined]
        : [caption(0), undefined]
    })

    expect(measurementCount).toBe(2)
    expect(result).toMatchObject({
      status: 'overflow',
      reason: 'caption-inline-overflow',
      sharedImageBlockSize: 42,
      selectedCandidateHeight: 42,
    })
    expect(result.cells[0]).toMatchObject({
      captionBlockSize: 13,
      captionGap: 4,
      blockSize: 59,
    })
  })

  it('uses one zero-height fallback snapshot with equal fallback cell widths', () => {
    const result = calculateAutoImageRowGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 20,
      itemGap: 16,
      items: [{ aspectRatio: 1, captionGap: 16 }, { aspectRatio: 1, captionGap: 16 }],
    }, () => [caption(10), caption(10)])

    expect(result).toMatchObject({
      status: 'overflow',
      reason: 'no-image-block-space',
      selectedCandidateHeight: null,
      sharedImageBlockSize: 0,
      blockOffset: 0,
    })
    expect(result.cells.map(cell => cell.inlineSize)).toEqual([42, 42])
    expect(result.cells.map(cell => cell.imageBlockSize)).toEqual([0, 0])
  })

  it('reuses the classification zero-height fallback snapshot for final geometry', () => {
    let zeroHeightMeasurements = 0
    const result = calculateAutoImageRowGroupGeometry({
      regionInlineSize: 32,
      regionBlockSize: 20,
      itemGap: 16,
      items: [{ aspectRatio: 1, captionGap: 16 }, { aspectRatio: 1 }],
    }, ({ imageBlockSize }) => {
      if (imageBlockSize !== 0)
        return [caption(10), undefined]

      zeroHeightMeasurements += 1
      return [caption(zeroHeightMeasurements === 2 ? 13 : 100), undefined]
    })

    // The normative candidate sequence measures h = 0 first. The second
    // zero-height measurement is the classification fallback; final geometry
    // must reuse it rather than taking a third measurement.
    expect(zeroHeightMeasurements).toBe(2)
    expect(result).toMatchObject({
      status: 'overflow',
      reason: 'no-image-block-space',
      sharedImageBlockSize: 0,
      groupBlockSize: 29,
      blockOffset: 0,
    })
    expect(result.cells[0]).toMatchObject({
      captionBlockSize: 13,
      blockSize: 29,
    })
  })
})

describe('auto-image group column geometry', () => {
  it('uses a shared width, aspect-derived heights, and full-region captions', () => {
    const result = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 200,
      itemGap: 16,
      items: [
        { aspectRatio: 2, caption: caption(10), captionGap: 4 },
        { aspectRatio: 0.5 },
      ],
    })

    expect(result).toMatchObject({
      status: 'fit',
      reason: null,
      sharedImageInlineSize: 68,
      actualItemGap: 16,
      groupBlockSize: 200,
    })
    expect(result.cells.map(cell => cell.imageBlockSize)).toEqual([34, 136])
    expect(result.cells.map(cell => cell.captionInlineSize)).toEqual([100, 0])
  })

  it('distributes surplus block space evenly into column gaps when width limits the fit', () => {
    const result = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 50,
      regionBlockSize: 300,
      itemGap: 16,
      items: [
        { aspectRatio: 2, caption: caption(10), captionGap: 4 },
        { aspectRatio: 0.5 },
      ],
    })

    expect(result).toMatchObject({
      status: 'fit',
      sharedImageInlineSize: 50,
      actualItemGap: 161,
      groupBlockSize: 300,
      blockOffset: 0,
    })
    expect(result.cells[1].blockOffset).toBe(200)
  })

  it('retains positive image boxes and residual-distributed gaps during caption inline overflow', () => {
    const result = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 50,
      regionBlockSize: 300,
      itemGap: 16,
      items: [
        { aspectRatio: 2, caption: caption(10, 50.51), captionGap: 4 },
        { aspectRatio: 0.5 },
      ],
    })

    expect(result).toMatchObject({
      status: 'overflow',
      reason: 'caption-inline-overflow',
      sharedImageInlineSize: 50,
      actualItemGap: 161,
      groupBlockSize: 300,
    })
    expect(result.cells.map(cell => cell.imageInlineSize)).toEqual([50, 50])
    expect(result.cells.map(cell => cell.imageBlockSize)).toEqual([25, 100])
    expect(result.cells.map(cell => cell.captionInlineSize)).toEqual([50, 0])
    expect(result.cells[1].blockOffset).toBe(200)
  })

  it('uses exact minimum gaps and block-start clipping for zero-width item-gap overflow', () => {
    const result = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 10,
      itemGap: 16,
      items: [{ aspectRatio: 1 }, { aspectRatio: 1 }],
    })

    expect(result).toMatchObject({
      status: 'overflow',
      reason: 'item-gap-overflow',
      sharedImageInlineSize: 0,
      actualItemGap: 16,
      groupBlockSize: 16,
      blockOffset: 0,
    })
    expect(result.cells.map(cell => cell.blockOffset)).toEqual([0, 16])
  })

  it('centers a short zero-image column group and starts an over-height group at block-start', () => {
    const centered = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 100,
      itemGap: 16,
      items: [{ aspectRatio: 0.001 }, { aspectRatio: 0.001 }],
    })
    const overHeight = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 100,
      itemGap: 16,
      items: [
        { aspectRatio: 1, caption: caption(60), captionGap: 16 },
        { aspectRatio: 1, caption: caption(60), captionGap: 16 },
      ],
    })

    expect(centered).toMatchObject({
      reason: 'no-renderable-image-size',
      groupBlockSize: 16,
      blockOffset: 42,
    })
    expect(overHeight).toMatchObject({
      reason: 'no-image-block-space',
      groupBlockSize: 168,
      blockOffset: 0,
    })
  })
})

describe('auto-image group common geometry contracts', () => {
  it('normalizes the item gap to the required 1rem minimum', () => {
    expect(normalizeAutoImageItemGap()).toBe(DEFAULT_AUTO_IMAGE_ITEM_GAP)
    expect(normalizeAutoImageItemGap(24)).toBe(24)
    expect(normalizeAutoImageItemGap(8)).toBe(DEFAULT_AUTO_IMAGE_ITEM_GAP)
    expect(normalizeAutoImageItemGap(-1)).toBe(DEFAULT_AUTO_IMAGE_ITEM_GAP)
    expect(normalizeAutoImageItemGap(Number.NaN)).toBe(DEFAULT_AUTO_IMAGE_ITEM_GAP)
    expect(normalizeAutoImageItemGap('24px')).toBe(DEFAULT_AUTO_IMAGE_ITEM_GAP)
  })

  it.each([
    ['zero-inline-space', 0.5, 100, 16, () => [caption(100, 1000), caption(100, 1000)]],
    ['zero-block-space', 100, 0.5, 16, () => [caption(100, 1000), caption(100, 1000)]],
    ['item-gap-overflow', 32, 100, 16, () => [undefined, undefined, undefined]],
    ['caption-inline-overflow', 100, 100, 16, (snapshot: { cells: readonly { inlineSize: number }[] }) => [caption(0, snapshot.cells[0].inlineSize + 0.51), undefined]],
    ['caption-block-overflow', 100, 100, 16, () => [caption(100.51), undefined]],
    ['no-image-block-space', 100, 20, 16, () => [caption(10), undefined]],
    ['no-renderable-image-size', 17, 100, 16, () => [undefined, undefined]],
  ] as const)('uses multi-image overflow precedence for %s', (reason, regionInlineSize, regionBlockSize, itemGap, measureCaptions) => {
    const result = calculateAutoImageRowGroupGeometry({
      regionInlineSize,
      regionBlockSize,
      itemGap,
      items: [
        { aspectRatio: 1, captionGap: 16 },
        { aspectRatio: 1 },
        ...(reason === 'item-gap-overflow' ? [{ aspectRatio: 1 }] : []),
      ],
    }, measureCaptions)

    expect(result.reason).toBe(reason)
    expect(result.status).toBe('overflow')
    expect(result.cells.every(cell => cell.imageInlineSize === 0 && cell.imageBlockSize === 0)).toBe(reason !== 'caption-inline-overflow')
  })

  it('gives item-gap overflow precedence over caption errors', () => {
    const result = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 32,
      itemGap: 16,
      items: [
        { aspectRatio: 1, caption: caption(100.51, 1000), captionGap: 16 },
        { aspectRatio: 1 },
        { aspectRatio: 1 },
      ],
    })

    expect(result.reason).toBe('item-gap-overflow')
  })

  it('gives caption inline overflow precedence over caption block overflow', () => {
    const result = calculateAutoImageColumnGroupGeometry({
      regionInlineSize: 100,
      regionBlockSize: 100,
      itemGap: 16,
      items: [
        { aspectRatio: 1, caption: caption(100.51, 1000), captionGap: 16 },
        { aspectRatio: 1 },
      ],
    })

    expect(result.reason).toBe('caption-inline-overflow')
  })
})
