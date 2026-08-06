interface InlineStyleValue {
  readonly value: string
  readonly priority: string
}

interface OwnedInlineStyle {
  authored: InlineStyleValue
  generated: InlineStyleValue
}

interface StyleableElement extends Element {
  readonly style: CSSStyleDeclaration
}

interface ExpectedGeneratedStyleMutation {
  readonly oldValue: string | null
}

interface InlineDeclaration {
  readonly property: string
  readonly value: string
  readonly priority: string
}

interface OwnedTransitionStyle {
  authoredTransitionCssText: string
  readonly authoredOverrides: Map<string, InlineStyleValue>
  generatedDeclarations: Map<string, InlineStyleValue>
}

const expectedGeneratedStyleMutations
  = new WeakMap<Element, ExpectedGeneratedStyleMutation[]>()

function isStyleable(element: Element): element is StyleableElement {
  return 'style' in element
    && typeof (element as Partial<StyleableElement>).style?.setProperty === 'function'
}

function applyGeneratedStyleMutation(
  element: StyleableElement,
  mutate: () => void,
): void {
  const oldValue = element.getAttribute('style')
  mutate()
  if (element.getAttribute('style') === oldValue)
    return

  const pending = expectedGeneratedStyleMutations.get(element) ?? []
  pending.push({ oldValue })
  expectedGeneratedStyleMutations.set(element, pending)
}

export function consumeAutofitGeneratedStyleMutation(
  record: MutationRecord,
): boolean {
  if (
    record.type !== 'attributes'
    || record.attributeName !== 'style'
    || !(record.target instanceof Element)
  ) {
    return false
  }

  const pending = expectedGeneratedStyleMutations.get(record.target)
  if (!pending || pending.length === 0 || pending[0].oldValue !== record.oldValue)
    return false

  pending.shift()
  if (pending.length === 0)
    expectedGeneratedStyleMutations.delete(record.target)
  return true
}

/** Owns temporary inline declarations and restores the exact authored values. */
export class AutofitGeneratedStyleOwner {
  readonly #owned = new Map<StyleableElement, Map<string, OwnedInlineStyle>>()

  set(
    element: Element,
    property: string,
    value: string,
    priority = 'important',
  ): void {
    if (!isStyleable(element))
      throw new TypeError(`autofit cannot style ${element.localName}`)

    let elementOwned = this.#owned.get(element)
    if (!elementOwned) {
      elementOwned = new Map()
      this.#owned.set(element, elementOwned)
    }

    const current = readInlineStyle(element.style, property)
    let owned = elementOwned.get(property)
    if (!owned) {
      owned = {
        authored: current,
        generated: current,
      }
      elementOwned.set(property, owned)
    }
    else if (!sameInlineStyle(current, owned.generated)) {
      owned.authored = current
    }

    applyGeneratedStyleMutation(element, () => {
      element.style.setProperty(property, value, priority)
    })
    owned.generated = readInlineStyle(element.style, property)
  }

  restoreAll(): void {
    for (const [element, properties] of this.#owned) {
      for (const [property, owned] of properties) {
        const current = readInlineStyle(element.style, property)
        if (!sameInlineStyle(current, owned.generated))
          continue

        applyGeneratedStyleMutation(element, () => {
          if (owned.authored.value === '')
            element.style.removeProperty(property)
          else
            element.style.setProperty(
              property,
              owned.authored.value,
              owned.authored.priority,
            )
        })
      }
    }

    this.#owned.clear()
  }
}

function readTransitionDeclarations(
  style: CSSStyleDeclaration,
): readonly InlineDeclaration[] {
  const declarations: InlineDeclaration[] = []
  for (let index = 0; index < style.length; index += 1) {
    const property = style.item(index)
    if (property !== 'transition' && !property.startsWith('transition-'))
      continue
    declarations.push({
      property,
      value: style.getPropertyValue(property),
      priority: style.getPropertyPriority(property),
    })
  }
  return declarations
}

function removeTransitionDeclarations(style: CSSStyleDeclaration): void {
  const properties = readTransitionDeclarations(style)
    .map(declaration => declaration.property)
  for (const property of properties)
    style.removeProperty(property)
}

function transitionCssText(
  element: StyleableElement,
  cssText: string | null,
): string {
  const extractor = element.ownerDocument.createElement('div').style
  extractor.cssText = cssText ?? ''
  const nonTransitionProperties: string[] = []
  for (let index = 0; index < extractor.length; index += 1) {
    const property = extractor.item(index)
    if (property !== 'transition' && !property.startsWith('transition-'))
      nonTransitionProperties.push(property)
  }
  for (const property of nonTransitionProperties)
    extractor.removeProperty(property)
  return extractor.cssText
}

function readTransitionDeclarationMap(
  style: CSSStyleDeclaration,
): Map<string, InlineStyleValue> {
  return new Map(readTransitionDeclarations(style).map(declaration => [
    declaration.property,
    {
      value: declaration.value,
      priority: declaration.priority,
    },
  ]))
}

function sameOptionalInlineStyle(
  left: InlineStyleValue | undefined,
  right: InlineStyleValue | undefined,
): boolean {
  if (!left || !right)
    return left === right
  return sameInlineStyle(left, right)
}

function oneDeclarationCssText(
  element: StyleableElement,
  property: string,
  value: InlineStyleValue,
): string {
  const style = element.ownerDocument.createElement('div').style
  style.setProperty(property, value.value, value.priority)
  return style.cssText
}

function adoptAuthoredTransitionChanges(
  element: StyleableElement,
  owned: OwnedTransitionStyle,
): void {
  const current = readTransitionDeclarationMap(element.style)
  const generated = owned.generatedDeclarations
  const currentShorthand = current.get('transition')
  const generatedShorthand = generated.get('transition')
  if (!sameOptionalInlineStyle(currentShorthand, generatedShorthand)) {
    owned.authoredTransitionCssText = currentShorthand
      ? oneDeclarationCssText(element, 'transition', currentShorthand)
      : ''
    owned.authoredOverrides.clear()
  }

  const properties = new Set([
    ...current.keys(),
    ...generated.keys(),
  ])
  properties.delete('transition')
  for (const property of properties) {
    const value = current.get(property)
    const generatedValue = generated.get(property)
    if (sameOptionalInlineStyle(value, generatedValue))
      continue
    if (
      property === 'transition-property'
      && value?.value === 'none'
      && value.priority === 'important'
    ) {
      continue
    }
    owned.authoredOverrides.set(property, value ?? {
      value: '',
      priority: '',
    })
  }
}

function authoredTransitionCssText(
  element: StyleableElement,
  owned: OwnedTransitionStyle,
): string {
  const style = element.ownerDocument.createElement('div').style
  style.cssText = owned.authoredTransitionCssText
  for (const [property, authored] of owned.authoredOverrides) {
    if (authored.value === '')
      style.removeProperty(property)
    else
      style.setProperty(property, authored.value, authored.priority)
  }
  return style.cssText
}

function suppressTransitionProperty(element: StyleableElement): void {
  applyGeneratedStyleMutation(element, () => {
    const current = readInlineStyle(element.style, 'transition-property')
    if (
      current.value === 'none'
      && current.priority === 'important'
    ) {
      return
    }
    element.style.setProperty('transition-property', 'none', 'important')
  })
}

/**
 * Restores uncontested authored declarations exactly and merges transition
 * edits made while suppression is active by property value and priority.
 */
export class AutofitTransitionStyleOwner {
  readonly #owned = new Map<StyleableElement, OwnedTransitionStyle>()

  suppress(element: Element): void {
    if (!isStyleable(element))
      throw new TypeError(`autofit cannot style ${element.localName}`)

    let owned = this.#owned.get(element)
    if (owned) {
      adoptAuthoredTransitionChanges(element, owned)
    }
    else {
      owned = {
        authoredTransitionCssText: transitionCssText(
          element,
          element.getAttribute('style'),
        ),
        authoredOverrides: new Map(),
        generatedDeclarations: new Map(),
      }
      this.#owned.set(element, owned)
    }

    suppressTransitionProperty(element)
    owned.generatedDeclarations = readTransitionDeclarationMap(element.style)
  }

  restoreAll(): void {
    for (const [element, owned] of this.#owned) {
      adoptAuthoredTransitionChanges(element, owned)
      applyGeneratedStyleMutation(element, () => {
        const merger = element.ownerDocument.createElement('div').style
        merger.cssText = element.style.cssText
        removeTransitionDeclarations(merger)
        const mergedCssText = [
          merger.cssText,
          authoredTransitionCssText(element, owned),
        ].filter(Boolean).join(' ')
        if (mergedCssText === '')
          element.removeAttribute('style')
        else
          element.setAttribute('style', mergedCssText)
      })
    }
    this.#owned.clear()
  }
}

function readInlineStyle(
  style: CSSStyleDeclaration,
  property: string,
): InlineStyleValue {
  return {
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  }
}

function sameInlineStyle(
  left: InlineStyleValue,
  right: InlineStyleValue,
): boolean {
  return left.value === right.value && left.priority === right.priority
}
