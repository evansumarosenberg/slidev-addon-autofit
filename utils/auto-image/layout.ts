import type {
  AutoImageConfig,
  AutoImagePosition,
} from './types'

export type AutoImageLayoutStyle = Record<string, string>

export interface AutoImageLayoutGeometryBox {
  readonly inlineSize: number
  readonly blockSize: number
  readonly inlineOffset?: number
  readonly blockOffset?: number
}

export interface AutoImageLayoutGeometrySnapshot {
  readonly position: AutoImagePosition
  readonly size: number
  readonly defaultDeclared: boolean
  readonly autoDeclared: boolean
  readonly footerDeclared: boolean
  readonly stage: AutoImageLayoutGeometryBox
  readonly imageTrack: AutoImageLayoutGeometryBox
  readonly autoTrack: AutoImageLayoutGeometryBox | null
  readonly regionGap: number
}

function fingerprintNumber(value: number | undefined): string {
  if (value === undefined)
    return 'none'
  if (!Number.isFinite(value))
    return String(value)
  return String(value)
}

function fingerprintBox(box: AutoImageLayoutGeometryBox | null): string {
  if (!box)
    return 'none'
  return [
    fingerprintNumber(box.inlineSize),
    fingerprintNumber(box.blockSize),
    fingerprintNumber(box.inlineOffset),
    fingerprintNumber(box.blockOffset),
  ].join(':')
}

/**
 * The split observer compares one current geometry snapshot. Keep the
 * resolved custom-property gap in this key: CSS can change the feasibility of
 * the split without changing either existing track's border box.
 */
export function createAutoImageLayoutGeometryFingerprint(
  snapshot: AutoImageLayoutGeometrySnapshot,
): string {
  return [
    snapshot.position,
    fingerprintNumber(snapshot.size),
    snapshot.defaultDeclared ? 'default' : 'no-default',
    snapshot.autoDeclared ? 'auto' : 'omitted',
    snapshot.footerDeclared ? 'footer' : 'no-footer',
    fingerprintBox(snapshot.stage),
    fingerprintBox(snapshot.imageTrack),
    fingerprintBox(snapshot.autoTrack),
    fingerprintNumber(snapshot.regionGap),
  ].join('|')
}

const REGION_GAP = 'var(--slidev-auto-image-region-gap)'

function remainderTrack(imageSize: string): string {
  return `minmax(0, calc(100% - ${imageSize} - ${REGION_GAP}))`
}

export function createAutoImageStageStyle(
  config: AutoImageConfig,
  autoDeclared: boolean,
): AutoImageLayoutStyle {
  const imageSize = `${config.size}%`

  if (config.position === 'center') {
    return {
      gridTemplateColumns: `minmax(0, 1fr) ${imageSize} minmax(0, 1fr)`,
      gridTemplateRows: autoDeclared
        ? `${imageSize} ${REGION_GAP} ${remainderTrack(imageSize)}`
        : 'minmax(0, 1fr)',
    }
  }

  const imageFirst = config.position === 'left' || config.position === 'top'
  const imageAxis = autoDeclared
    ? imageFirst
      ? `${imageSize} ${REGION_GAP} ${remainderTrack(imageSize)}`
      : `${remainderTrack(imageSize)} ${REGION_GAP} ${imageSize}`
    : config.position === 'left' || config.position === 'top'
      ? `${imageSize} minmax(0, 1fr)`
      : `minmax(0, 1fr) ${imageSize}`

  if (config.position === 'top' || config.position === 'bottom') {
    return {
      gridTemplateColumns: 'minmax(0, 1fr)',
      gridTemplateRows: imageAxis,
    }
  }

  return {
    gridTemplateColumns: imageAxis,
    gridTemplateRows: 'minmax(0, 1fr)',
  }
}

export function createAutoImageImageTrackStyle(
  config: AutoImageConfig,
  autoDeclared: boolean,
): AutoImageLayoutStyle {
  if (config.position === 'center')
    return { gridColumn: '2', gridRow: '1' }

  if (config.position === 'top')
    return { gridColumn: '1', gridRow: '1' }
  if (config.position === 'bottom')
    return { gridColumn: '1', gridRow: autoDeclared ? '3' : '2' }
  if (config.position === 'left')
    return { gridColumn: '1', gridRow: '1' }
  return { gridColumn: autoDeclared ? '3' : '2', gridRow: '1' }
}

export function createAutoImageAutoTrackStyle(
  config: AutoImageConfig,
): AutoImageLayoutStyle {
  if (config.position === 'center')
    return { gridColumn: '1 / -1', gridRow: '3' }
  if (config.position === 'top')
    return { gridColumn: '1', gridRow: '3' }
  if (config.position === 'bottom')
    return { gridColumn: '1', gridRow: '1' }
  if (config.position === 'left')
    return { gridColumn: '3', gridRow: '1' }
  return { gridColumn: '1', gridRow: '1' }
}

function resolveLength(value: string, element: HTMLElement): number {
  const trimmed = value.trim().toLowerCase()
  const match = /^(-?(?:\d+\.?\d*|\.\d+))(px|rem|em)?$/.exec(trimmed)
  if (!match)
    return 16

  const numeric = Number.parseFloat(match[1]!)
  if (!Number.isFinite(numeric))
    return 16
  if (match[2] === 'rem') {
    const rootSize = Number.parseFloat(
      getComputedStyle(element.ownerDocument.documentElement).fontSize,
    )
    return numeric * (Number.isFinite(rootSize) ? rootSize : 16)
  }
  if (match[2] === 'em') {
    const elementSize = Number.parseFloat(getComputedStyle(element).fontSize)
    return numeric * (Number.isFinite(elementSize) ? elementSize : 16)
  }
  return numeric
}

export function readAutoImageRegionGap(element: HTMLElement): number {
  return Math.max(0, resolveLength(
    getComputedStyle(element).getPropertyValue('--slidev-auto-image-region-gap'),
    element,
  ))
}

export function hasAutoImageSplitOverflow(
  config: AutoImageConfig,
  availableInlineSize: number,
  availableBlockSize: number,
  regionGap: number,
  autoDeclared: boolean,
): boolean {
  if (!autoDeclared)
    return false

  const availableAxisSize = config.position === 'top' || config.position === 'bottom' || config.position === 'center'
    ? availableBlockSize
    : availableInlineSize
  const imageAxisSize = availableAxisSize * (config.size / 100)
  return availableAxisSize - imageAxisSize < regionGap
}
