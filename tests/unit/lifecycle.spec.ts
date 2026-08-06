import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AutofitGeneratedStyleOwner,
  AutofitTransitionStyleOwner,
} from '../../utils/autofit/generated-styles'
import { createAutofitLifecycle } from '../../utils/autofit/lifecycle'

function createFixture() {
  const root = document.createElement('div')
  const viewport = document.createElement('div')
  const flow = document.createElement('div')
  const copy = document.createElement('p')
  copy.textContent = 'Before'
  flow.append(copy)
  viewport.append(flow)
  root.append(viewport)
  document.body.replaceChildren(root)
  return { root, viewport, flow, copy }
}

describe('distributed commit barrier', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  it('drains pre-callback author records, advances generation, and coalesces invalidation', async () => {
    const fixture = createFixture()
    const invalidate = vi.fn()
    const lifecycle = createAutofitLifecycle({
      ...fixture,
      probeStyleContext: () => null,
      invalidate,
    })
    const baseline = lifecycle.generation

    fixture.copy.firstChild!.textContent = 'After'
    fixture.copy.classList.add('changed')

    expect(lifecycle.commitBarrier()).toBeGreaterThan(baseline)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith('content')

    await Promise.resolve()
    expect(invalidate).toHaveBeenCalledTimes(1)
    lifecycle.dispose()
  })

  it('reuses generated-style filtering without advancing author generation', () => {
    const fixture = createFixture()
    const invalidate = vi.fn()
    const lifecycle = createAutofitLifecycle({
      ...fixture,
      probeStyleContext: () => null,
      invalidate,
    })
    const baseline = lifecycle.generation
    const styles = new AutofitGeneratedStyleOwner()

    styles.set(fixture.copy, 'margin-block-start', '10px')

    expect(lifecycle.commitBarrier()).toBe(baseline)
    expect(invalidate).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('does not advance generation for managed root state classes', () => {
    const fixture = createFixture()
    fixture.root.className = 'autofit'
    const invalidate = vi.fn()
    const lifecycle = createAutofitLifecycle({
      ...fixture,
      probeStyleContext: () => null,
      invalidate,
    })
    const baseline = lifecycle.generation

    fixture.root.classList.add('autofit--fit')

    expect(lifecycle.commitBarrier()).toBe(baseline)
    expect(invalidate).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('ignores component-owned diagnostic subtree insertions', () => {
    const fixture = createFixture()
    const diagnostics = document.createElement('div')
    diagnostics.className = 'autofit__diagnostics'
    fixture.root.append(diagnostics)
    const invalidate = vi.fn()
    const lifecycle = createAutofitLifecycle({
      ...fixture,
      probeStyleContext: () => null,
      invalidate,
    })
    const baseline = lifecycle.generation

    const badge = document.createElement('span')
    badge.className = 'autofit__unsupported-badge'
    badge.textContent = 'AUTOFIT UNSUPPORTED'
    diagnostics.append(badge)

    expect(lifecycle.commitBarrier()).toBe(baseline)
    expect(invalidate).not.toHaveBeenCalled()
    lifecycle.dispose()
  })

  it('does not let generated writes hide a later author style/class record', () => {
    const fixture = createFixture()
    const invalidate = vi.fn()
    const lifecycle = createAutofitLifecycle({
      ...fixture,
      probeStyleContext: () => null,
      invalidate,
    })
    const baseline = lifecycle.generation
    const styles = new AutofitGeneratedStyleOwner()

    styles.set(fixture.copy, 'margin-block-start', '10px')
    fixture.copy.style.fontSize = '20px'
    fixture.copy.classList.add('author-change')

    expect(lifecycle.commitBarrier()).toBeGreaterThan(baseline)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith('geometry')
    lifecycle.dispose()
  })
})

describe('font geometry invalidation', () => {
  afterEach(() => {
    document.body.replaceChildren()
    vi.restoreAllMocks()
  })

  function installFontGeometryHarness() {
    const originalFonts = Object.getOwnPropertyDescriptor(document, 'fonts')
    const fonts = new EventTarget() as FontFaceSet
    Object.defineProperties(fonts, {
      ready: { configurable: true, value: Promise.resolve(fonts) },
      status: { configurable: true, value: 'loaded' },
    })
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: fonts,
    })

    let textTop = 10
    vi.spyOn(document, 'createRange').mockImplementation(() => ({
      detach: vi.fn(),
      getClientRects: () => [new DOMRect(0, textTop, 40, 12)],
      selectNodeContents: vi.fn(),
    }) as unknown as Range)

    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })

    return {
      fonts,
      frames,
      restoreFonts() {
        if (originalFonts)
          Object.defineProperty(document, 'fonts', originalFonts)
        else
          delete (document as Document & { fonts?: FontFaceSet }).fonts
      },
      setTextTop(value: number) {
        textTop = value
      },
    }
  }

  it('invalidates when font completion changes text ranges but not element boxes', () => {
    const harness = installFontGeometryHarness()
    try {
      const fixture = createFixture()
      const invalidate = vi.fn()
      const lifecycle = createAutofitLifecycle({
        ...fixture,
        probeStyleContext: () => null,
        invalidate,
      })

      harness.setTextTop(11)
      harness.fonts.dispatchEvent(new Event('loadingdone'))
      expect(harness.frames).toHaveLength(1)
      harness.frames.shift()!(0)

      expect(invalidate).toHaveBeenCalledTimes(1)
      expect(invalidate).toHaveBeenCalledWith('font')
      lifecycle.dispose()
    }
    finally {
      harness.restoreFonts()
    }
  })

  it('keeps unchanged font completion events scheduler-inert', () => {
    const harness = installFontGeometryHarness()
    try {
      const fixture = createFixture()
      const invalidate = vi.fn()
      const lifecycle = createAutofitLifecycle({
        ...fixture,
        probeStyleContext: () => null,
        invalidate,
      })

      harness.fonts.dispatchEvent(new Event('loadingdone'))
      expect(harness.frames).toHaveLength(1)
      harness.frames.shift()!(0)

      expect(invalidate).not.toHaveBeenCalled()
      lifecycle.dispose()
    }
    finally {
      harness.restoreFonts()
    }
  })
})

describe('transition suppression ownership', () => {
  it('restores authored shorthand declarations exactly', () => {
    const target = document.createElement('p')
    target.style.setProperty('transition', 'all 410ms ease-in')
    const authored = target.style.cssText
    const transitions = new AutofitTransitionStyleOwner()

    transitions.suppress(target)
    expect(target.style.getPropertyValue('transition-property')).toBe('none')
    expect(target.style.getPropertyPriority('transition-property'))
      .toBe('important')

    transitions.restoreAll()
    expect(target.style.cssText).toBe(authored)
  })

  it('keeps exact authored transitions across unrelated inline edits', () => {
    const target = document.createElement('p')
    target.style.cssText = 'color: red; transition: all 410ms ease-in;'
    const transitions = new AutofitTransitionStyleOwner()

    transitions.suppress(target)
    target.style.setProperty('color', 'blue')
    transitions.suppress(target)
    transitions.restoreAll()

    expect(target.style.color).toBe('blue')
    expect(target.style.getPropertyValue('transition'))
      .toBe('all 410ms ease-in')
    expect(target.style.getPropertyPriority('transition')).toBe('')
  })

  it('adopts authored shorthand edits and their priority during a lease', () => {
    const target = document.createElement('p')
    target.style.setProperty('transition', 'all 410ms ease-in')
    const transitions = new AutofitTransitionStyleOwner()

    transitions.suppress(target)
    target.style.setProperty(
      'transition',
      'opacity 725ms linear 125ms',
      'important',
    )
    transitions.suppress(target)
    expect(target.style.getPropertyValue('transition-property')).toBe('none')
    expect(target.style.getPropertyPriority('transition-property'))
      .toBe('important')
    transitions.restoreAll()

    expect(target.style.getPropertyValue('transition'))
      .toBe('opacity 725ms linear 125ms')
    expect(target.style.getPropertyPriority('transition')).toBe('important')
  })

  it('merges authored longhand edits with untouched transition declarations', () => {
    const target = document.createElement('p')
    target.style.setProperty('transition', 'all 410ms ease-in 20ms')
    const transitions = new AutofitTransitionStyleOwner()

    transitions.suppress(target)
    target.style.setProperty('transition-duration', '900ms', 'important')
    target.style.setProperty('transition-timing-function', 'steps(2)')
    target.style.setProperty('transition-delay', '75ms')
    transitions.suppress(target)
    target.style.setProperty('transition-property', 'opacity, color')
    transitions.suppress(target)
    transitions.restoreAll()

    expect(target.style.transitionProperty).toBe('opacity, color')
    expect(target.style.getPropertyPriority('transition-property')).toBe('')
    expect(target.style.transitionDuration).toBe('900ms')
    expect(target.style.getPropertyPriority('transition-duration'))
      .toBe('important')
    expect(target.style.transitionTimingFunction).toBe('steps(2)')
    expect(target.style.transitionDelay).toBe('75ms')
  })

  it('preserves mixed transition and unrelated edits across repeated leases', () => {
    const target = document.createElement('p')
    target.style.cssText = 'color: red; transition: all 300ms ease;'
    const transitions = new AutofitTransitionStyleOwner()

    transitions.suppress(target)
    target.style.setProperty('color', 'green')
    target.style.setProperty('transition-duration', '600ms')
    transitions.suppress(target)
    transitions.restoreAll()
    expect(target.style.color).toBe('green')
    expect(target.style.transitionDuration).toBe('600ms')
    expect(target.style.getPropertyValue('transition'))
      .toBe('all 300ms ease')

    transitions.suppress(target)
    target.style.setProperty('transition-delay', '80ms', 'important')
    transitions.suppress(target)
    transitions.restoreAll()
    expect(target.style.color).toBe('green')
    expect(target.style.transitionDuration).toBe('600ms')
    expect(target.style.transitionDelay).toBe('80ms')
    expect(target.style.getPropertyPriority('transition-delay'))
      .toBe('important')
  })

  it('consumes generated re-suppression records but retains author transition and style records', () => {
    const fixture = createFixture()
    const invalidate = vi.fn()
    const lifecycle = createAutofitLifecycle({
      ...fixture,
      probeStyleContext: () => null,
      invalidate,
    })
    const baseline = lifecycle.generation
    fixture.copy.style.setProperty('transition', 'all 300ms ease')
    lifecycle.commitBarrier()
    invalidate.mockClear()
    const transitions = new AutofitTransitionStyleOwner()

    transitions.suppress(fixture.copy)
    fixture.copy.style.setProperty(
      'transition',
      'opacity 700ms linear',
      'important',
    )
    fixture.copy.style.setProperty('color', 'purple')
    transitions.suppress(fixture.copy)

    expect(lifecycle.commitBarrier()).toBeGreaterThan(baseline)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalledWith('geometry')

    invalidate.mockClear()
    transitions.restoreAll()
    const restoredGeneration = lifecycle.commitBarrier()
    expect(invalidate).not.toHaveBeenCalled()
    expect(lifecycle.commitBarrier()).toBe(restoredGeneration)
    expect(invalidate).not.toHaveBeenCalled()
    expect(fixture.copy.style.getPropertyValue('transition'))
      .toBe('opacity 700ms linear')
    expect(fixture.copy.style.getPropertyPriority('transition'))
      .toBe('important')
    expect(fixture.copy.style.color).toBe('purple')
    lifecycle.dispose()
  })
})
