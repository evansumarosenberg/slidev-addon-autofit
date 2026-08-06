import { describe, expect, it } from 'vitest'

import type { ImageSlotNode } from '../../utils/auto-image/types'
import {
  classifyImageSlot,
  classifyImageSlotItems,
} from '../../utils/auto-image/classify'

const text = (value: string): ImageSlotNode => ({ kind: 'text', value })
const comment = (value = ''): ImageSlotNode => ({ kind: 'comment', value })
const element = (
  tagName: string,
  children: readonly ImageSlotNode[] = [],
  options: { readonly attributes?: readonly string[]; readonly computedDisplay?: string } = {},
): ImageSlotNode => ({
  kind: 'element',
  tagName,
  children,
  ...options,
})
const image = (options?: { readonly computedDisplay?: string }): ImageSlotNode =>
  element('img', [], options)
const paragraph = (...children: ImageSlotNode[]): ImageSlotNode => element('p', children)
const sentinel = (): ImageSlotNode => element('V-CLICK-GAP')
const attributeSentinel = (): ImageSlotNode => element('div', [], {
  attributes: ['data-slidev-v-click-gap'],
})

describe('classifyImageSlot', () => {
  it('accepts a direct image root', () => {
    const result = classifyImageSlot({ kind: 'root', children: [image()] })

    expect(result).toMatchObject({
      supported: true,
      reason: null,
      caption: null,
      image: { kind: 'element', tagName: 'img' },
    })
  })

  it('accepts a Markdown image-only paragraph and one following caption', () => {
    const result = classifyImageSlot({
      kind: 'root',
      children: [
        paragraph(text('  '), comment('generated'), image(), sentinel()),
        paragraph(text('A '), element('em', [text('formatted')]), text(' caption')),
      ],
    })

    expect(result).toMatchObject({
      supported: true,
      reason: null,
      image: { kind: 'element', tagName: 'img' },
      caption: { kind: 'element', tagName: 'p' },
    })
  })

  it.each([
    'A', 'ABBR', 'B', 'BDI', 'BDO', 'BR', 'CITE', 'CODE', 'DATA', 'DEL',
    'DFN', 'EM', 'I', 'INS', 'KBD', 'MARK', 'Q', 'RP', 'RT', 'RUBY', 'S',
    'SAMP', 'SMALL', 'SPAN', 'STRONG', 'SUB', 'SUP', 'TIME', 'U', 'VAR', 'WBR',
  ])('accepts semantic-inline caption tag %s recursively', (tagName) => {
    const result = classifyImageSlot({
      kind: 'root',
      children: [image(), paragraph(element(tagName, [element('span', [text('caption')])]))],
    })

    expect(result.supported).toBe(true)
    expect(result.reason).toBeNull()
  })

  it('uses rendered tag structure rather than computed display', () => {
    expect(classifyImageSlot({
      kind: 'root',
      children: [image({ computedDisplay: 'block' }), paragraph(element('span', [text('caption')], {
        computedDisplay: 'block',
      }))],
    }).supported).toBe(true)

    expect(classifyImageSlot({
      kind: 'root',
      children: [image(), paragraph(element('custom-caption', [text('caption')], {
        computedDisplay: 'inline',
      }))],
    }).reason).toBe('unexpected-content')
  })

  it.each([
    ['missing-image', { kind: 'root', children: [text('text')] }],
    ['multiple-images', { kind: 'root', children: [image(), paragraph(image())] }],
    ['unexpected-image-wrapper', { kind: 'root', children: [element('a', [image()])] }],
    ['unexpected-content', { kind: 'root', children: [text('before'), image()] }],
    ['multiple-captions', { kind: 'root', children: [image(), paragraph(text('one')), paragraph(text('two'))] }],
  ] as const)('returns the closed structural reason %s', (reason, root) => {
    const result = classifyImageSlot(root)

    expect(result).toMatchObject({ supported: false, reason })
    expect(result.image).toBeNull()
    expect(result.caption).toBeNull()
  })

  it('follows the approved multiply-invalid precedence examples', () => {
    expect(classifyImageSlot({
      kind: 'root',
      children: [text('before'), image(), image(), paragraph(text('caption'))],
    }).reason).toBe('multiple-images')

    expect(classifyImageSlot({
      kind: 'root',
      children: [element('a', [image()])],
    }).reason).toBe('unexpected-image-wrapper')

    expect(classifyImageSlot({
      kind: 'root',
      children: [paragraph(text('caption before')), image()],
    }).reason).toBe('unexpected-content')

    expect(classifyImageSlot({
      kind: 'root',
      children: [image(), paragraph(text('caption')), element('ul', [element('li', [text('list')])])],
    }).reason).toBe('unexpected-content')
  })

  it('ignores whitespace, comments, and Slidev helper sentinels', () => {
    const result = classifyImageSlot({
      kind: 'root',
      children: [
        text('\n\t'),
        comment('ignored'),
        sentinel(),
        attributeSentinel(),
        image(),
        paragraph(sentinel(), attributeSentinel(), comment(), text('caption')),
        text('  '),
      ],
    })

    expect(result.supported).toBe(true)
    expect(result.reason).toBeNull()
  })

  it.each([
    element('figure', [image()]),
    element('picture', [image()]),
    element('span', [element('span', [image()])]),
  ])('rejects wrappers around the only image', (root) => {
    expect(classifyImageSlot({ kind: 'root', children: [root] }).reason)
      .toBe('unexpected-image-wrapper')
  })

  it('preserves the legacy global image-count precedence through the compatibility adapter', () => {
    expect(classifyImageSlot({
      kind: 'root',
      children: [image(), paragraph(image())],
    })).toMatchObject({ supported: false, reason: 'multiple-images' })

    expect(classifyImageSlot({
      kind: 'root',
      children: [
        element('a', [image()]),
        text('other invalid content'),
        paragraph(image()),
      ],
    })).toMatchObject({ supported: false, reason: 'multiple-images' })

    expect(classifyImageSlot({
      kind: 'root',
      children: [text('before'), element('a', [image()])],
    })).toMatchObject({ supported: false, reason: 'unexpected-image-wrapper' })
  })
})

describe('classifyImageSlotItems', () => {
  it('associates every image with its immediately following caption in a fully-captioned sequence', () => {
    const firstImage = image()
    const firstCaption = paragraph(text('first caption'))
    const secondImageElement = image()
    const secondImage = paragraph(secondImageElement)
    const secondCaption = paragraph(text('second caption'))
    const thirdImage = image()
    const thirdCaption = paragraph(element('strong', [text('third caption')]))

    expect(classifyImageSlotItems({
      kind: 'root',
      children: [
        firstImage,
        firstCaption,
        secondImage,
        secondCaption,
        thirdImage,
        thirdCaption,
      ],
    })).toEqual({
      supported: true,
      reason: null,
      items: [
        { image: firstImage, imageWrapper: null, caption: firstCaption },
        { image: secondImageElement, imageWrapper: secondImage, caption: secondCaption },
        { image: thirdImage, imageWrapper: null, caption: thirdCaption },
      ],
    })
  })

  it('associates all-captioned, partially captioned, and uncaptioned ordered image sequences', () => {
    const result = classifyImageSlotItems({
      kind: 'root',
      children: [
        image(),
        paragraph(text('first caption')),
        paragraph(text('\n'), image(), comment(), sentinel()),
        image(),
        paragraph(element('strong', [text('third caption')])),
      ],
    })

    expect(result).toMatchObject({
      supported: true,
      reason: null,
      items: [
        {
          image: { tagName: 'img' },
          imageWrapper: null,
          caption: { tagName: 'p' },
        },
        {
          image: { tagName: 'img' },
          imageWrapper: { tagName: 'p' },
          caption: null,
        },
        {
          image: { tagName: 'img' },
          imageWrapper: null,
          caption: { tagName: 'p' },
        },
      ],
    })
  })

  it('treats adjacent images as caption omission and ignores non-substantive roots', () => {
    const result = classifyImageSlotItems({
      kind: 'root',
      children: [
        text('\n'),
        comment(),
        sentinel(),
        attributeSentinel(),
        image(),
        comment('between images'),
        paragraph(image()),
        text('  '),
      ],
    })

    expect(result).toMatchObject({
      supported: true,
      reason: null,
      items: [
        { image: { tagName: 'img' }, caption: null },
        { image: { tagName: 'img' }, caption: null },
      ],
    })
  })

  it('has no fixed item-count limit', () => {
    const result = classifyImageSlotItems({
      kind: 'root',
      children: Array.from({ length: 12 }, () => image()),
    })

    expect(result).toMatchObject({ supported: true, reason: null })
    expect(result.supported && result.items).toHaveLength(12)
  })

  it('returns the unsupported-wrapper reason when an unsupported image root precedes a valid image', () => {
    expect(classifyImageSlotItems({
      kind: 'root',
      children: [element('a', [image()]), image()],
    })).toEqual({
      supported: false,
      reason: 'unexpected-image-wrapper',
      items: [],
    })
  })

  it('discards preceding valid items when a later root is invalid', () => {
    expect(classifyImageSlotItems({
      kind: 'root',
      children: [
        image(),
        paragraph(text('first caption')),
        image(),
        paragraph(text('second caption')),
        element('ul', [element('li', [text('unsupported content')])]),
      ],
    })).toEqual({
      supported: false,
      reason: 'unexpected-content',
      items: [],
    })
  })

  it.each([
    ['missing-image', [paragraph(text('caption only'))]],
    ['multiple-images', [paragraph(image(), image())]],
    ['unexpected-image-wrapper', [element('a', [image()])]],
    ['unexpected-content', [paragraph(text('caption before')), image()]],
    ['multiple-captions', [image(), paragraph(text('one')), paragraph(text('two'))]],
    ['unexpected-image-wrapper', [image(), element('figure', [image()])]],
    ['multiple-images', [image(), paragraph(image(), image())]],
  ] as const)('uses the approved ordered-parser reason precedence for %s', (reason, children) => {
    expect(classifyImageSlotItems({ kind: 'root', children }).reason).toBe(reason)
  })
})
