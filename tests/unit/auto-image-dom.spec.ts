import { describe, expect, it } from 'vitest'

import {
  readAutoImageDomSnapshot,
  readAutoImageGroupDomSnapshot,
} from '../../utils/auto-image/dom'

function createFlow(markup: string): HTMLElement {
  const flow = document.createElement('div')
  flow.innerHTML = markup
  return flow
}

describe('readAutoImageGroupDomSnapshot', () => {
  it('maps ordered model items to their live images, captions, and Markdown wrappers', () => {
    const flow = createFlow(`
      <img id="first-image">
      <p id="first-caption">First <strong>caption</strong></p>
      <!-- ignored -->
      <v-click-gap></v-click-gap>
      <p id="second-wrapper"><img id="second-image"></p>
      <p id="second-caption">Second caption</p>
      <img id="third-image">
    `)

    const snapshot = readAutoImageGroupDomSnapshot(flow)

    expect(snapshot.classification).toMatchObject({ supported: true, reason: null })
    expect(snapshot.items).toHaveLength(3)
    expect(snapshot.items.map(item => ({
      image: item.image?.id,
      caption: item.caption?.id ?? null,
      imageWrapper: item.imageWrapper?.id ?? null,
    }))).toEqual([
      { image: 'first-image', caption: 'first-caption', imageWrapper: null },
      { image: 'second-image', caption: 'second-caption', imageWrapper: 'second-wrapper' },
      { image: 'third-image', caption: null, imageWrapper: null },
    ])
  })
})

describe('readAutoImageDomSnapshot', () => {
  it('preserves the mounted legacy single-image snapshot and rejects multiple valid roots', () => {
    const supported = readAutoImageDomSnapshot(createFlow(`
      <p id="wrapper"><img id="image"></p>
      <p id="caption">Caption</p>
    `))

    expect(supported.classification).toMatchObject({ supported: true, reason: null })
    expect(supported.image?.id).toBe('image')
    expect(supported.caption?.id).toBe('caption')
    expect(supported.imageWrapper?.id).toBe('wrapper')

    const multiple = readAutoImageDomSnapshot(createFlow('<img><p><img></p>'))
    expect(multiple.classification).toMatchObject({
      supported: false,
      reason: 'multiple-images',
    })
    expect(multiple.image).toBeNull()
    expect(multiple.caption).toBeNull()
    expect(multiple.imageWrapper).toBeNull()
  })
})
