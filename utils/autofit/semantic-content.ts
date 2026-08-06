import type { AutofitClassification } from './types'

/**
 * The semantic-empty decision shared by AutoFit and layout-level probes.
 * Visibility does not participate: classification is based on rendered DOM
 * structure and the existing helper-sentinel rules.
 */
export function isAutofitClassificationSemanticallyEmpty(
  classification: Pick<AutofitClassification, 'units' | 'visual'>,
): boolean {
  return classification.units.length === 0
    && classification.visual.unsupported.length === 0
}
