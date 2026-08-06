import { classifyImageSlot, classifyImageSlotItems } from './classify'
import type {
  ImageSlotClassification,
  ImageSlotElementNode,
  ImageSlotItemsClassification,
  ImageSlotNode,
  ImageSlotRootNode,
} from './types'

export interface AutoImageDomSnapshot {
  readonly root: ImageSlotRootNode
  readonly classification: ImageSlotClassification
  readonly image: HTMLImageElement | null
  readonly caption: HTMLElement | null
  readonly imageWrapper: HTMLElement | null
}

export interface AutoImageGroupDomItemSnapshot {
  readonly image: HTMLImageElement
  readonly caption: HTMLElement | null
  readonly imageWrapper: HTMLElement | null
}

export interface AutoImageGroupDomSnapshot {
  readonly root: ImageSlotRootNode
  readonly classification: ImageSlotItemsClassification
  readonly items: readonly AutoImageGroupDomItemSnapshot[]
}

function createNodeMap(root: HTMLElement): {
  readonly model: ImageSlotRootNode
  readonly elements: WeakMap<ImageSlotElementNode, Element>
} {
  const elements = new WeakMap<ImageSlotElementNode, Element>()

  function createNode(node: ChildNode): ImageSlotNode {
    if (node.nodeType === Node.TEXT_NODE)
      return { kind: 'text', value: node.nodeValue ?? '' }
    if (node.nodeType === Node.COMMENT_NODE)
      return { kind: 'comment', value: node.nodeValue ?? '' }

    const element = node as Element
    const model: ImageSlotElementNode = {
      kind: 'element',
      tagName: element.tagName,
      attributes: [...element.attributes].map(attribute => attribute.name),
      children: [...element.childNodes].map(createNode),
    }
    elements.set(model, element)
    return model
  }

  return {
    model: {
      kind: 'root',
      children: [...root.childNodes].map(createNode),
    },
    elements,
  }
}

function mappedImage(
  elements: WeakMap<ImageSlotElementNode, Element>,
  model: ImageSlotElementNode,
): HTMLImageElement {
  const element = elements.get(model)
  if (!(element instanceof HTMLImageElement))
    throw new TypeError('Image-slot model did not map to an HTMLImageElement.')
  return element
}

function mappedHTMLElement(
  elements: WeakMap<ImageSlotElementNode, Element>,
  model: ImageSlotElementNode | null,
): HTMLElement | null {
  if (!model)
    return null
  const element = elements.get(model)
  return element instanceof HTMLElement ? element : null
}

/** Returns all ordered live image targets for the new group runtime path. */
export function readAutoImageGroupDomSnapshot(flow: HTMLElement): AutoImageGroupDomSnapshot {
  const { model, elements } = createNodeMap(flow)
  const classification = classifyImageSlotItems(model)
  const items = classification.supported
    ? classification.items.map(item => ({
        image: mappedImage(elements, item.image),
        caption: mappedHTMLElement(elements, item.caption),
        imageWrapper: mappedHTMLElement(elements, item.imageWrapper),
      }))
    : []

  return { root: model, classification, items }
}

/**
 * The current runtime snapshot. It remains deliberately single-image-only
 * until Task 3 switches AutoImage.vue to readAutoImageGroupDomSnapshot.
 */
export function readAutoImageDomSnapshot(flow: HTMLElement): AutoImageDomSnapshot {
  const { model, elements } = createNodeMap(flow)
  const classification = classifyImageSlot(model)
  const image = classification.supported
    ? elements.get(classification.image)
    : null
  const caption = classification.supported && classification.caption
    ? elements.get(classification.caption)
    : null
  const imageElement = image instanceof HTMLImageElement ? image : null
  const captionElement = caption instanceof HTMLElement ? caption : null
  const imageWrapper = imageElement?.parentElement !== flow
    && imageElement?.parentElement instanceof HTMLElement
    && imageElement.parentElement.localName === 'p'
    ? imageElement.parentElement
    : null

  return {
    root: model,
    classification,
    image: imageElement,
    caption: captionElement,
    imageWrapper,
  }
}
