import { AutofitGeneratedStyleOwner } from './generated-styles'
import type {
  AutofitClassification,
  AutofitSpacingAdapter,
} from './types'

const LIST_TAGS = new Set(['OL', 'UL'])
const CSS_PRECISION = 1e9

function formatPixelValue(value: number): string {
  const rounded = Math.round(value * CSS_PRECISION) / CSS_PRECISION
  return `${Object.is(rounded, -0) ? 0 : rounded}px`
}

function assertAdjustment(value: number): void {
  if (!Number.isFinite(value))
    throw new RangeError('carrier adjustment must be finite')
}

function isList(element: Element): boolean {
  return LIST_TAGS.has(element.localName.toUpperCase())
}

class DomAutofitSpacingAdapter implements AutofitSpacingAdapter {
  readonly #classification: AutofitClassification
  readonly #styles = new AutofitGeneratedStyleOwner()

  constructor(classification: AutofitClassification) {
    this.#classification = classification
  }

  prepareIntrinsic(): void {
    this.#styles.restoreAll()

    for (const element of this.#classification.marginResetElements) {
      this.#styles.set(element, 'margin-block-start', '0px')
      this.#styles.set(element, 'margin-block-end', '0px')
    }

    const listCarriers = new Set(
      this.#classification.units
        .map(unit => unit.carrier)
        .filter(isList),
    )
    for (const list of listCarriers)
      this.#styles.set(list, 'display', 'flow-root')

  }

  applyAdjustments(adjustments: readonly number[]): void {
    if (adjustments.length !== this.#classification.boundaries.length) {
      throw new RangeError(
        'carrier adjustment count must match semantic boundary count',
      )
    }
    adjustments.forEach(assertAdjustment)
    this.prepareIntrinsic()

    for (const [index, boundary] of this.#classification.boundaries.entries()) {
      this.#styles.set(
        boundary.carrier,
        'margin-block-start',
        formatPixelValue(adjustments[index]),
      )
    }
  }

  cleanup(): void {
    this.#styles.restoreAll()
  }
}

export function createAutofitSpacingAdapter(
  classification: AutofitClassification,
): AutofitSpacingAdapter {
  return new DomAutofitSpacingAdapter(classification)
}
