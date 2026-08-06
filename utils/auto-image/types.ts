export type AutoImagePosition =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'center'

export interface AutoImageConfig {
  readonly position: AutoImagePosition
  readonly size: number
}

export type AutoImageConfigErrorCode =
  | 'configuration-not-object'
  | 'unknown-property'
  | 'invalid-position-type'
  | 'invalid-position-value'
  | 'invalid-size-type'
  | 'invalid-size-syntax'
  | 'invalid-size-range'

export interface AutoImageConfigError {
  readonly code: AutoImageConfigErrorCode
  readonly property?: string
  readonly value?: unknown
}

export interface NormalizedAutoImageConfig {
  readonly config: AutoImageConfig
  readonly valid: boolean
  readonly errors: readonly AutoImageConfigError[]
}

export type ImageSlotStructuralReason =
  | 'missing-image'
  | 'multiple-images'
  | 'unexpected-image-wrapper'
  | 'unexpected-content'
  | 'multiple-captions'

export interface ImageSlotElementNode {
  readonly kind: 'element'
  readonly tagName: string
  readonly children: readonly ImageSlotNode[]
  /** Attribute names are structural inputs; values are not needed by v1. */
  readonly attributes?: readonly string[]
  /** Test/adaptor metadata that is intentionally ignored by classification. */
  readonly computedDisplay?: string
}

export interface ImageSlotTextNode {
  readonly kind: 'text'
  readonly value: string
}

export interface ImageSlotCommentNode {
  readonly kind: 'comment'
  readonly value?: string
}

export interface ImageSlotRootNode {
  readonly kind: 'root'
  readonly children: readonly ImageSlotNode[]
}

export type ImageSlotNode =
  | ImageSlotElementNode
  | ImageSlotTextNode
  | ImageSlotCommentNode

export type ImageSlotClassification =
  | {
    readonly supported: true
    readonly reason: null
    readonly image: ImageSlotElementNode
    readonly caption: ImageSlotElementNode | null
  }
  | {
    readonly supported: false
    readonly reason: ImageSlotStructuralReason
    readonly image: null
    readonly caption: null
  }

/** One ordered, structurally supported image item for the multi-image path. */
export interface ImageSlotItem {
  readonly image: ImageSlotElementNode
  readonly caption: ImageSlotElementNode | null
  /** The Markdown paragraph root, when the image is Markdown-wrapped. */
  readonly imageWrapper: ImageSlotElementNode | null
}

/**
 * The new ordered classification contract. The existing ImageSlotClassification
 * remains the legacy runtime contract until the Task 3 activation.
 */
export type ImageSlotItemsClassification =
  | {
    readonly supported: true
    readonly reason: null
    readonly items: readonly ImageSlotItem[]
  }
  | {
    readonly supported: false
    readonly reason: ImageSlotStructuralReason
    readonly items: readonly []
  }

export type AutoImageOverflowReason =
  | 'zero-inline-space'
  | 'zero-block-space'
  | 'caption-inline-overflow'
  | 'caption-block-overflow'
  | 'no-image-block-space'
  | 'no-renderable-image-size'

/** Overflow reasons for a coordinated group of two or more image items. */
export type AutoImageGroupOverflowReason =
  | AutoImageOverflowReason
  | 'item-gap-overflow'

export interface AutoImageCaptionMeasurement {
  readonly borderBoxBlockSize: number
  readonly scrollInlineSize: number
  readonly scrollBlockSize: number
}

/** Pure geometry input for one item in a coordinated image group. */
export interface AutoImageGroupItemInput {
  /** The positive intrinsic inline-to-block aspect ratio. */
  readonly aspectRatio: number
  /** Column measurements, or row measurements when no measurer is supplied. */
  readonly caption?: AutoImageCaptionMeasurement
  /** Applied only when this item has a caption measurement. */
  readonly captionGap?: number
}

export interface AutoImageGroupGeometryInput {
  readonly regionInlineSize: number
  readonly regionBlockSize: number
  /** A CSS-resolved gap in pixels; normalization happens in group geometry. */
  readonly itemGap?: number
  readonly items: readonly AutoImageGroupItemInput[]
}

export interface AutoImageGroupItemGeometry {
  readonly index: number
  /** The item cell's inline allocation. */
  readonly inlineSize: number
  /** The item block extent, excluding its following inter-item gap. */
  readonly blockSize: number
  /** The cell's inline offset within the group. */
  readonly inlineOffset: number
  /** The item's block offset within the group. */
  readonly blockOffset: number
  /** Row image-derived width before residual allocation; column shared width. */
  readonly baseInlineSize: number
  readonly imageInlineSize: number
  readonly imageBlockSize: number
  /** The image offset within its cell. */
  readonly imageInlineOffset: number
  readonly imageBlockOffset: number
  readonly captionInlineSize: number
  readonly captionBlockSize: number
  readonly captionGap: number
  readonly captionBlockOffset: number
  readonly interItemGapAfter: number
}

export interface AutoImageRowCandidateSnapshot {
  readonly imageBlockSize: number
  readonly cellSpan: number
  readonly residualInlineSize: number
  readonly extraInlineSize: number
  /** Caption measurements taken after applying this snapshot's cell widths. */
  readonly captions: readonly (AutoImageCaptionMeasurement | undefined)[]
  readonly cells: readonly AutoImageGroupItemGeometry[]
  readonly tallestItemBlockSize: number
  readonly groupBlockSize: number
  readonly blockOffset: number
}

export type AutoImageRowCaptionMeasurer = (
  snapshot: AutoImageRowCandidateSnapshot,
) => readonly (AutoImageCaptionMeasurement | undefined)[]

export interface AutoImageGroupGeometry {
  readonly orientation: 'row' | 'column'
  readonly status: 'fit' | 'overflow'
  readonly reason: AutoImageGroupOverflowReason | null
  readonly regionInlineSize: number
  readonly regionBlockSize: number
  readonly itemGap: number
  readonly actualItemGap: number
  readonly sharedImageInlineSize: number | null
  readonly sharedImageBlockSize: number | null
  /** The selected row candidate, or null for a row zero-height fallback. */
  readonly selectedCandidateHeight: number | null
  readonly cells: readonly AutoImageGroupItemGeometry[]
  readonly groupBlockSize: number
  readonly blockOffset: number
  readonly clipped: boolean
}

export interface AutoImageFitInput {
  readonly regionInlineSize: number
  readonly regionBlockSize: number
  readonly intrinsicInlineSize: number
  readonly intrinsicBlockSize: number
  readonly caption?: AutoImageCaptionMeasurement
  readonly captionGap?: number
}

export interface AutoImageContainInput {
  readonly availableInlineSize: number
  readonly availableBlockSize: number
  readonly intrinsicInlineSize: number
  readonly intrinsicBlockSize: number
}

export interface AutoImageContainGeometry {
  readonly inlineSize: number
  readonly blockSize: number
  readonly scale: number
}

export interface AutoImageFitGeometry {
  readonly status: 'fit' | 'overflow'
  readonly reason: AutoImageOverflowReason | null
  readonly regionInlineSize: number
  readonly regionBlockSize: number
  readonly availableImageBlockSize: number
  readonly imageInlineSize: number
  readonly imageBlockSize: number
  readonly imageInlineOffset: number
  readonly captionInlineSize: number
  readonly captionBlockSize: number
  readonly captionGap: number
  readonly groupBlockSize: number
  readonly blockOffset: number
  readonly clipped: boolean
}

export interface AutoImageSplitInput {
  readonly position: AutoImagePosition
  readonly availableInlineSize: number
  readonly availableBlockSize: number
  readonly imagePercentage: number
  readonly regionGap: number
  readonly autoDeclared: boolean
}

export interface AutoImageSplitGeometry {
  readonly position: AutoImagePosition
  readonly axis: 'inline' | 'block'
  readonly order: 'image-first' | 'auto-first' | 'center'
  readonly imagePercentage: number
  readonly imageAxisSize: number
  readonly autoAxisSize: number
  readonly gapSize: number
  readonly splitOverflow: boolean
  readonly imageAxisOffset: number
  readonly autoAxisOffset: number
  readonly blankBefore: number
  readonly blankAfter: number
  readonly imageInlineSize: number
  readonly imageBlockSize: number
  readonly autoInlineSize: number
  readonly autoBlockSize: number
  readonly imageInlineOffset: number
  readonly imageBlockOffset: number
  readonly autoInlineOffset: number
  readonly autoBlockOffset: number
}
