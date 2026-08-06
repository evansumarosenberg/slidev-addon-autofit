import type {
  ImageSlotClassification,
  ImageSlotElementNode,
  ImageSlotItem,
  ImageSlotItemsClassification,
  ImageSlotNode,
  ImageSlotRootNode,
  ImageSlotStructuralReason,
} from './types'

export const IMAGE_SLOT_SEMANTIC_INLINE_TAGS = Object.freeze([
  'A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DEL', 'DFN',
  'EM', 'I', 'INS', 'KBD', 'MARK', 'Q', 'RP', 'RT', 'RUBY', 'S', 'SAMP',
  'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR',
] as const)

const SEMANTIC_INLINE_TAGS = new Set<string>(IMAGE_SLOT_SEMANTIC_INLINE_TAGS)

type RootKind =
  | { readonly kind: 'image'; readonly root: ImageSlotElementNode }
  | { readonly kind: 'caption'; readonly root: ImageSlotElementNode }
  | { readonly kind: 'invalid'; readonly reason: ImageSlotStructuralReason }

interface RootAnalysis {
  readonly node: ImageSlotNode
  readonly imageCount: number
}

const EMPTY_IMAGE_SLOT_ITEMS: readonly [] = Object.freeze([]) as readonly []

function normalizedTagName(element: ImageSlotElementNode): string {
  return element.tagName.toUpperCase()
}

function isElement(node: ImageSlotNode): node is ImageSlotElementNode {
  return node.kind === 'element'
}

function isIgnoredSentinel(element: ImageSlotElementNode): boolean {
  if (normalizedTagName(element) === 'V-CLICK-GAP')
    return true

  return element.attributes?.some(attribute =>
    attribute.toLowerCase() === 'data-slidev-v-click-gap') ?? false
}

function isSubstantiveNode(node: ImageSlotNode): boolean {
  if (node.kind === 'text')
    return node.value.trim() !== ''
  if (node.kind === 'comment')
    return false
  return !isIgnoredSentinel(node)
}

function substantiveChildren(nodes: readonly ImageSlotNode[]): ImageSlotNode[] {
  return nodes.filter(isSubstantiveNode)
}

function countImages(node: ImageSlotNode): number {
  if (!isElement(node) || isIgnoredSentinel(node))
    return 0

  const count = normalizedTagName(node) === 'IMG' ? 1 : 0
  return count + node.children.reduce((total, child) => total + countImages(child), 0)
}

function isCaptionContent(node: ImageSlotNode): boolean {
  if (node.kind === 'text' || node.kind === 'comment')
    return true
  if (isIgnoredSentinel(node))
    return true

  return SEMANTIC_INLINE_TAGS.has(normalizedTagName(node))
    && node.children.every(isCaptionContent)
}

function isCaptionParagraph(node: ImageSlotNode): node is ImageSlotElementNode {
  return isElement(node)
    && normalizedTagName(node) === 'P'
    && node.children.every(isCaptionContent)
}

function isImageRoot(node: ImageSlotNode): node is ImageSlotElementNode {
  if (!isElement(node))
    return false

  if (normalizedTagName(node) === 'IMG')
    return true

  if (normalizedTagName(node) !== 'P')
    return false

  const children = substantiveChildren(node.children)
  return children.length === 1
    && isElement(children[0])
    && normalizedTagName(children[0]) === 'IMG'
}

function imageFromRoot(root: ImageSlotElementNode): ImageSlotElementNode {
  if (normalizedTagName(root) === 'IMG')
    return root

  return substantiveChildren(root.children)[0] as ImageSlotElementNode
}

function imageWrapperFromRoot(root: ImageSlotElementNode): ImageSlotElementNode | null {
  return normalizedTagName(root) === 'P' ? root : null
}

function analyzeRoots(root: ImageSlotRootNode): readonly RootAnalysis[] {
  return substantiveChildren(root.children).map(node => ({
    node,
    imageCount: countImages(node),
  }))
}

function classifyRoot({ node, imageCount }: RootAnalysis): RootKind {
  if (isImageRoot(node))
    return { kind: 'image', root: node }
  if (imageCount >= 2)
    return { kind: 'invalid', reason: 'multiple-images' }
  if (imageCount === 1)
    return { kind: 'invalid', reason: 'unexpected-image-wrapper' }
  if (isCaptionParagraph(node))
    return { kind: 'caption', root: node }
  return { kind: 'invalid', reason: 'unexpected-content' }
}

function unsupportedItems(reason: ImageSlotStructuralReason): ImageSlotItemsClassification {
  return {
    supported: false,
    reason,
    items: EMPTY_IMAGE_SLOT_ITEMS,
  }
}

function unsupportedLegacy(reason: ImageSlotStructuralReason): ImageSlotClassification {
  return {
    supported: false,
    reason,
    image: null,
    caption: null,
  }
}

/**
 * Classifies the complete image slot into ordered image items for the future
 * group runtime. This contract intentionally accepts separate valid image
 * roots; the still-mounted legacy classifier below does not.
 */
export function classifyImageSlotItems(root: ImageSlotRootNode): ImageSlotItemsClassification {
  const roots = analyzeRoots(root)
  const imageCount = roots.reduce((total, entry) => total + entry.imageCount, 0)
  if (imageCount === 0)
    return unsupportedItems('missing-image')

  const items: ImageSlotItem[] = []
  let expected: 'image' | 'image-or-caption' = 'image'

  for (const rootEntry of roots) {
    const classifiedRoot = classifyRoot(rootEntry)
    if (classifiedRoot.kind === 'invalid')
      return unsupportedItems(classifiedRoot.reason)

    if (classifiedRoot.kind === 'image') {
      items.push({
        image: imageFromRoot(classifiedRoot.root),
        imageWrapper: imageWrapperFromRoot(classifiedRoot.root),
        caption: null,
      })
      expected = 'image-or-caption'
      continue
    }

    if (expected === 'image') {
      return unsupportedItems(items.some(item => item.caption)
        ? 'multiple-captions'
        : 'unexpected-content')
    }

    const currentItem = items.at(-1)
    if (!currentItem)
      return unsupportedItems('unexpected-content')

    items[items.length - 1] = { ...currentItem, caption: classifiedRoot.root }
    expected = 'image'
  }

  return {
    supported: true,
    reason: null,
    items,
  }
}

/**
 * Compatibility adapter for the currently mounted single-image runtime.
 * It deliberately retains the historical slot-wide image-count precedence
 * while sharing the structural root predicates with the ordered classifier.
 */
export function classifyImageSlot(root: ImageSlotRootNode): ImageSlotClassification {
  const roots = analyzeRoots(root)
  const imageCount = roots.reduce((total, entry) => total + entry.imageCount, 0)

  if (imageCount === 0)
    return unsupportedLegacy('missing-image')
  if (imageCount >= 2)
    return unsupportedLegacy('multiple-images')

  const imageRootIndex = roots.findIndex(entry => entry.imageCount > 0)
  const imageRoot = roots[imageRootIndex]?.node
  if (!imageRoot || !isImageRoot(imageRoot))
    return unsupportedLegacy('unexpected-image-wrapper')
  if (imageRootIndex !== 0)
    return unsupportedLegacy('unexpected-content')

  const followingRoots = roots.slice(1).map(entry => entry.node)
  if (followingRoots.length === 0) {
    return {
      supported: true,
      reason: null,
      image: imageFromRoot(imageRoot),
      caption: null,
    }
  }

  if (followingRoots.length === 1 && isCaptionParagraph(followingRoots[0]!)) {
    return {
      supported: true,
      reason: null,
      image: imageFromRoot(imageRoot),
      caption: followingRoots[0] as ImageSlotElementNode,
    }
  }

  if (followingRoots.length >= 2 && followingRoots.every(isCaptionParagraph))
    return unsupportedLegacy('multiple-captions')

  return unsupportedLegacy('unexpected-content')
}
