import { describe, expect, it } from 'vitest'

import { classifyAutofitContent } from '../../utils/autofit/classify'
import {
  isAutofitClassificationSemanticallyEmpty,
} from '../../utils/autofit/semantic-content'

function createFlow(markup: string): HTMLElement {
  const flow = document.createElement('div')
  flow.innerHTML = markup
  return flow
}

describe('isAutofitClassificationSemanticallyEmpty', () => {
  it('accepts whitespace, comments, and Slidev helper sentinels as empty', () => {
    const classification = classifyAutofitContent(createFlow(`
      \n      <!-- ignored -->
      <v-click-gap></v-click-gap>
      <span data-slidev-v-click-gap></span>
    `))

    expect(isAutofitClassificationSemanticallyEmpty(classification)).toBe(true)
  })

  it('treats any substantive rendered element or text as non-empty', () => {
    expect(isAutofitClassificationSemanticallyEmpty(
      classifyAutofitContent(createFlow('<p>Content</p>')),
    )).toBe(false)
    expect(isAutofitClassificationSemanticallyEmpty(
      classifyAutofitContent(createFlow('Content')),
    )).toBe(false)
  })
})
