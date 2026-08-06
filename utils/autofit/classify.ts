import { AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE } from './types'
import type {
  AutofitClassification,
  AutofitGapKind,
  AutofitSemanticBoundary,
  AutofitSemanticUnit,
  AutofitSemanticUnitKind,
  AutofitUnsupportedOutput,
  AutofitVisualClassification,
  AutofitVisualFragment,
  AutofitVisualUnitOwnership,
  UnsupportedAutofitOutput,
} from './types'

const HEADING_TAGS = new Set([
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
])

const LIST_TAGS = new Set(['UL', 'OL'])

const ATOMIC_TAGS = new Set([
  'BLOCKQUOTE',
  'FIGURE',
  'PRE',
  'TABLE',
])

const MEDIA_TAGS = new Set([
  'AUDIO',
  'CANVAS',
  'EMBED',
  'IFRAME',
  'IMG',
  'OBJECT',
  'PICTURE',
  'SVG',
  'VIDEO',
])

const MEDIA_INLINE_WRAPPER_TAGS = new Set([
  'A',
  'DEL',
  'EM',
  'S',
  'STRONG',
])

const SLIDEV_HELPER_SENTINEL_TAGS = new Set(['V-CLICK-GAP'])

function isElement(node: Node): node is Element {
  return node.nodeType === node.ELEMENT_NODE
}

function isText(node: Node): node is Text {
  return node.nodeType === node.TEXT_NODE
}

function normalizedTagName(element: Element): string {
  return element.localName.toUpperCase()
}

function isHeading(element: Element): boolean {
  return HEADING_TAGS.has(normalizedTagName(element))
}

function isList(element: Element): boolean {
  return LIST_TAGS.has(normalizedTagName(element))
}

function isParagraph(element: Element): boolean {
  return normalizedTagName(element) === 'P'
}

function isListItem(element: Element): boolean {
  return normalizedTagName(element) === 'LI'
}

function isAtomicTag(element: Element): boolean {
  return ATOMIC_TAGS.has(normalizedTagName(element))
}

function isMediaTag(element: Element): boolean {
  return MEDIA_TAGS.has(normalizedTagName(element))
}

function isKnownRoot(element: Element): boolean {
  return isHeading(element)
    || isParagraph(element)
    || isList(element)
    || isAtomicTag(element)
    || isMediaTag(element)
}

function isSlidevHelperSentinel(element: Element): boolean {
  return SLIDEV_HELPER_SENTINEL_TAGS.has(normalizedTagName(element))
    || element.hasAttribute('data-slidev-v-click-gap')
}

function readDisplay(element: Element): string {
  const view = element.ownerDocument.defaultView
  return view?.getComputedStyle(element).display ?? ''
}

interface MediaContentResult {
  readonly onlyMedia: boolean
  readonly hasMedia: boolean
}

function inspectMediaContent(nodes: NodeListOf<ChildNode> | readonly ChildNode[]): MediaContentResult {
  let hasMedia = false

  for (const node of nodes) {
    if (isText(node)) {
      if (node.data.trim() !== '')
        return { onlyMedia: false, hasMedia }
      continue
    }

    if (!isElement(node))
      continue

    if (isMediaTag(node)) {
      hasMedia = true
      continue
    }

    if (MEDIA_INLINE_WRAPPER_TAGS.has(normalizedTagName(node))) {
      const nested = inspectMediaContent(node.childNodes)
      if (!nested.onlyMedia)
        return { onlyMedia: false, hasMedia: hasMedia || nested.hasMedia }
      hasMedia = hasMedia || nested.hasMedia
      continue
    }

    return { onlyMedia: false, hasMedia }
  }

  return { onlyMedia: hasMedia, hasMedia }
}

function isMediaOnlyParagraph(element: Element): boolean {
  return inspectMediaContent(element.childNodes).onlyMedia
}

function collectTextAndMediaFragments(
  node: Node,
  fragments: AutofitVisualFragment[],
  excludedRoots: ReadonlySet<Element>,
): void {
  if (isText(node)) {
    if (node.data.trim() !== '')
      fragments.push({ kind: 'text', node })
    return
  }

  if (!isElement(node) || isSlidevHelperSentinel(node) || excludedRoots.has(node))
    return

  if (isMediaTag(node)) {
    fragments.push({ kind: 'media', node })
    for (const child of node.childNodes)
      collectMediaFragments(child, fragments)
    return
  }

  for (const child of node.childNodes)
    collectTextAndMediaFragments(child, fragments, excludedRoots)
}

function collectMediaFragments(
  node: Node,
  fragments: AutofitVisualFragment[],
): void {
  if (!isElement(node))
    return

  if (isMediaTag(node)) {
    fragments.push({ kind: 'media', node })
  }

  for (const child of node.childNodes)
    collectMediaFragments(child, fragments)
}

function compareUnsupportedDocumentOrder(
  left: AutofitUnsupportedOutput,
  right: AutofitUnsupportedOutput,
): number {
  if (left.node === right.node) {
    return AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE.indexOf(left.reason)
      - AUTOFIT_UNSUPPORTED_REASON_PRECEDENCE.indexOf(right.reason)
  }

  const position = left.node.compareDocumentPosition(right.node)
  if (position & Node.DOCUMENT_POSITION_FOLLOWING)
    return -1
  if (position & Node.DOCUMENT_POSITION_PRECEDING)
    return 1
  return 0
}

function buildListItemOwnership(
  unit: AutofitSemanticUnit,
  separatelyClassifiedRoots: ReadonlySet<Element>,
  unsupported: AutofitUnsupportedOutput[],
): AutofitVisualUnitOwnership {
  const fragments: AutofitVisualFragment[] = []
  let enteredClassifiedChild = false
  let missingLeadingReported = false

  for (const node of unit.root.childNodes) {
    if (isText(node)) {
      if (node.data.trim() === '')
        continue
      if (enteredClassifiedChild) {
        unsupported.push({
          reason: 'list-item-noncontiguous-content',
          node,
        })
      }
      else {
        fragments.push({ kind: 'text', node })
      }
      continue
    }

    if (!isElement(node) || isSlidevHelperSentinel(node))
      continue

    const startsClassifiedChild = isList(node)
      || separatelyClassifiedRoots.has(node)
    if (startsClassifiedChild) {
      if (!enteredClassifiedChild && fragments.length === 0 && !missingLeadingReported) {
        unsupported.push({
          reason: 'list-item-missing-leading-content',
          node: unit.root,
        })
        missingLeadingReported = true
      }
      enteredClassifiedChild = true
      continue
    }

    if (enteredClassifiedChild) {
      unsupported.push({
        reason: 'list-item-noncontiguous-content',
        node,
      })
      continue
    }

    collectTextAndMediaFragments(node, fragments, separatelyClassifiedRoots)
  }

  return { unit, fragments }
}

function buildVisualClassification(
  units: readonly AutofitSemanticUnit[],
  boundaries: readonly AutofitSemanticBoundary[],
  structuralUnsupported: readonly UnsupportedAutofitOutput[],
): AutofitVisualClassification {
  const unsupported: AutofitUnsupportedOutput[] = [...structuralUnsupported]
  const allRoots = new Set(units.map(unit => unit.root))
  const visualUnits = units.map((unit): AutofitVisualUnitOwnership => {
    if (unit.kind === 'atomic') {
      return {
        unit,
        fragments: [{ kind: 'atomic-root', node: unit.root }],
      }
    }

    if (unit.kind === 'media') {
      if (!isParagraph(unit.root)) {
        return {
          unit,
          fragments: [{ kind: 'media', node: unit.root }],
        }
      }

      const fragments: AutofitVisualFragment[] = []
      collectMediaFragments(unit.root, fragments)
      return { unit, fragments }
    }

    const separatelyClassifiedRoots = new Set(allRoots)
    separatelyClassifiedRoots.delete(unit.root)
    if (unit.kind === 'list-item') {
      return buildListItemOwnership(
        unit,
        separatelyClassifiedRoots,
        unsupported,
      )
    }

    const fragments: AutofitVisualFragment[] = []
    collectTextAndMediaFragments(
      unit.root,
      fragments,
      separatelyClassifiedRoots,
    )
    return { unit, fragments }
  })

  const visualBoundaries = boundaries.map((boundary, index) => ({
    kind: boundary.kind,
    carrier: boundary.carrier,
    preceding: visualUnits[index],
    following: visualUnits[index + 1],
  }))

  return {
    units: visualUnits,
    boundaries: visualBoundaries,
    unsupported: unsupported.sort(compareUnsupportedDocumentOrder),
  }
}

class ClassificationBuilder {
  readonly #units: AutofitSemanticUnit[] = []
  readonly #boundaries: AutofitSemanticBoundary[] = []
  readonly #marginResetElements = new Set<Element>()
  readonly #unsupported: UnsupportedAutofitOutput[] = []
  #fullGapCount = 0
  #halfGapCount = 0
  #headingGroupActive = false

  classify(flowRoot: Element): AutofitClassification {
    for (const node of flowRoot.childNodes)
      this.#classifyRootNode(node)

    const classification = {
      units: this.#units,
      boundaries: this.#boundaries,
      marginResetElements: [...this.#marginResetElements],
      gapCounts: {
        full: this.#fullGapCount,
        half: this.#halfGapCount,
      },
      unsupported: this.#unsupported,
    }

    return {
      ...classification,
      visual: buildVisualClassification(
        classification.units,
        classification.boundaries,
        classification.unsupported,
      ),
    }
  }

  #classifyRootNode(node: Node): void {
    if (isText(node)) {
      if (node.data.trim() !== '') {
        this.#unsupported.push({
          reason: 'root-text',
          node,
        })
      }
      return
    }

    if (!isElement(node) || isSlidevHelperSentinel(node))
      return

    if (isHeading(node)) {
      this.#addUnit(node, 'heading', node, 'full')
      this.#headingGroupActive = true
      return
    }

    if (isParagraph(node)) {
      if (isMediaOnlyParagraph(node)) {
        this.#addAtomicUnit(node, 'media')
        return
      }

      this.#addUnit(
        node,
        'paragraph',
        node,
        this.#headingGroupActive ? 'half' : 'full',
      )
      return
    }

    if (isList(node)) {
      this.#classifyList(node, this.#headingGroupActive ? 'half' : 'full')
      return
    }

    if (!isKnownRoot(node) && readDisplay(node) === 'contents') {
      this.#unsupported.push({
        reason: 'display-contents-root',
        node,
      })
      return
    }

    this.#addAtomicUnit(node, isMediaTag(node) ? 'media' : 'atomic')
  }

  #addAtomicUnit(
    element: Element,
    kind: Extract<AutofitSemanticUnitKind, 'atomic' | 'media'>,
  ): void {
    this.#addUnit(element, kind, element, 'full')
    this.#headingGroupActive = false
  }

  #classifyList(list: Element, siblingGap: AutofitGapKind): void {
    const items = [...list.children].filter(isListItem)

    for (const [index, item] of items.entries()) {
      const carrier = index === 0 ? list : item
      this.#addUnit(item, 'list-item', carrier, siblingGap)
      this.#classifyListItemContents(item)
    }
  }

  #classifyListItemContents(item: Element): void {
    let hasLeadingContent = false

    for (const node of item.childNodes) {
      if (isText(node)) {
        if (node.data.trim() !== '')
          hasLeadingContent = true
        continue
      }

      if (!isElement(node) || isSlidevHelperSentinel(node))
        continue

      if (isParagraph(node)) {
        this.#marginResetElements.add(node)

        if (!hasLeadingContent) {
          hasLeadingContent = true
          continue
        }

        this.#addUnit(
          node,
          isMediaOnlyParagraph(node) ? 'media' : 'paragraph',
          node,
          'half',
        )
        continue
      }

      if (isList(node)) {
        this.#classifyList(node, 'half')
        hasLeadingContent = true
        continue
      }

      hasLeadingContent = true
    }
  }

  #addUnit(
    root: Element,
    kind: AutofitSemanticUnitKind,
    carrier: Element,
    requestedGap: AutofitGapKind,
  ): void {
    const incomingGap = this.#units.length === 0 ? null : requestedGap
    const unit: AutofitSemanticUnit = {
      root,
      kind,
      incomingGap,
      carrier,
    }

    this.#units.push(unit)
    this.#marginResetElements.add(root)
    this.#marginResetElements.add(carrier)

    if (!incomingGap)
      return

    this.#boundaries.push({
      kind: incomingGap,
      carrier,
      before: root,
    })

    if (incomingGap === 'full')
      this.#fullGapCount += 1
    else
      this.#halfGapCount += 1
  }
}

export function classifyAutofitContent(flowRoot: Element): AutofitClassification {
  return new ClassificationBuilder().classify(flowRoot)
}
