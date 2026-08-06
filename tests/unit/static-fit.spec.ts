import { describe, expect, it, vi } from 'vitest'

import { classifyAutofitContent } from '../../utils/autofit/classify'
import {
  calculateAutofitCoordinatedTargetAlignment,
  createAutofitStaticFitSession,
  createAutofitCoordinatedAlignedTargetPresentation,
  createAutofitCoordinatedTargetPresentation,
  extractAutofitCoordinatedGapPlan,
  resolveAutofitCoordinatedAlignedTargetApplication,
  resolveAutofitCoordinatedTargetApplication,
  resolveAutofitRestoredBaseVerification,
} from '../../utils/autofit/static-fit'
import type {
  AutofitStaticFitResult,
  AutofitStaticPresentation,
} from '../../utils/autofit/static-fit'

const measuredGeometry = {
  status: 'measured' as const,
  viewportBounds: {
    left: 0,
    right: 100,
    top: 0,
    bottom: 100,
    width: 100,
    height: 100,
  },
  contentInlineExtent: 50,
  contentBlockExtent: 50,
  emptySpace: 50,
  fits: true,
}

const expected = [{ target: 16 }]

describe('restored base verification precedence', () => {
  it.each([
    { status: 'deferred', reason: 'no-measurable-host' },
    { status: 'empty' },
    { ...measuredGeometry, fits: false },
  ] as const)('retries restored geometry loss instead of reporting unsupported', (geometry) => {
    expect(resolveAutofitRestoredBaseVerification({
      geometry,
      visual: {
        status: 'measured',
        realizedWhitespace: [16],
      },
      expected,
    })).toEqual({ status: 'stale' })
  })

  it('retries a deferred restored visual measurement', () => {
    expect(resolveAutofitRestoredBaseVerification({
      geometry: measuredGeometry,
      visual: {
        status: 'deferred',
        reason: 'invalid-host-scale',
      },
      expected,
    })).toEqual({ status: 'stale' })
  })

  it.each([
    'visual-rect-missing',
    'visual-target-nonfinite',
    'visual-edge-nonfinite',
    'carrier-adjustment-nonfinite',
  ] as const)('preserves typed restored visual reason %s', (reason) => {
    expect(resolveAutofitRestoredBaseVerification({
      geometry: measuredGeometry,
      visual: { status: 'unsupported', reason },
      expected,
    })).toEqual({ status: 'unsupported', reason })
  })

  it('reserves base-gap-verification for measured tolerance failure', () => {
    expect(resolveAutofitRestoredBaseVerification({
      geometry: measuredGeometry,
      visual: {
        status: 'measured',
        realizedWhitespace: [15.499],
      },
      expected,
    })).toEqual({
      status: 'unsupported',
      reason: 'base-gap-verification',
    })
  })

  it('accepts verified restored base gaps', () => {
    expect(resolveAutofitRestoredBaseVerification({
      geometry: measuredGeometry,
      visual: {
        status: 'measured',
        realizedWhitespace: [15.5],
      },
      expected,
    })).toEqual({ status: 'valid' })
  })
})

const target = {} as Element

function presentation(options: {
  readonly alignment?: { readonly before: number; readonly after: number }
  readonly boundaries?: readonly {
    readonly kind: 'full' | 'half'
    readonly target: number
    readonly adjustment?: number
  }[]
} = {}): AutofitStaticPresentation {
  return {
    signature: { units: [], boundaries: [] },
    typography: [],
    scale: 1,
    boundaries: (options.boundaries ?? []).map(boundary => ({
      kind: boundary.kind,
      carrier: target,
      target: boundary.target,
      adjustment: boundary.adjustment ?? 0,
    })),
    alignment: options.alignment ?? { before: 0, after: 0 },
    residualBlockOffset: 0,
  }
}

function distributedResult(source: AutofitStaticPresentation): AutofitStaticFitResult {
  return {
    tier: 2,
    scale: 1,
    overflow: false,
    effectiveAlignment: 'distributed',
    gapCounts: {
      full: source.boundaries.filter(boundary => boundary.kind === 'full').length,
      half: source.boundaries.filter(boundary => boundary.kind === 'half').length,
    },
    presentation: source,
  }
}

const synchronizedGeometry = {
  ...measuredGeometry,
  status: 'measured' as const,
  fits: true,
}

describe('coordinated distributed gap plan', () => {
  it('extracts verified full and half targets without averaging observed whitespace', () => {
    const source = presentation({
      boundaries: [
        { kind: 'full', target: 25, adjustment: 999 },
        { kind: 'full', target: 25, adjustment: -300 },
        { kind: 'half', target: 11, adjustment: 200 },
      ],
    })

    expect(extractAutofitCoordinatedGapPlan(distributedResult(source))).toEqual({
      targets: { fullTarget: 25, halfTarget: 11 },
      provenance: { full: 'observed', half: 'observed' },
    })
  })

  it.each([
    {
      boundaries: [{ kind: 'full' as const, target: 18 }],
      expected: {
        targets: { fullTarget: 18, halfTarget: 9 },
        provenance: { full: 'observed', half: 'derived' },
      },
    },
    {
      boundaries: [{ kind: 'half' as const, target: 7 }],
      expected: {
        targets: { fullTarget: 14, halfTarget: 7 },
        provenance: { full: 'derived', half: 'observed' },
      },
    },
  ])('derives only the missing target and records its provenance', ({ boundaries, expected: expectedPlan }) => {
    expect(extractAutofitCoordinatedGapPlan(distributedResult(
      presentation({ boundaries }),
    ))).toEqual(expectedPlan)
  })

  it.each([
    distributedResult(presentation({ boundaries: [{ kind: 'full', target: 18 }] })),
    {
      ...distributedResult(presentation({ boundaries: [{ kind: 'full', target: 18 }] })),
      effectiveAlignment: 'middle' as const,
    },
    {
      ...distributedResult(presentation({ boundaries: [{ kind: 'full', target: 18 }] })),
      effectiveAlignment: 'top' as const,
    },
  ])('returns no plan for boundary-free or non-distributed presentations', (result) => {
    const boundaryFree = {
      ...result,
      presentation: presentation(),
    }
    expect(extractAutofitCoordinatedGapPlan(boundaryFree)).toBeNull()
    if (result.effectiveAlignment !== 'distributed')
      expect(extractAutofitCoordinatedGapPlan(result)).toBeNull()
  })
})

describe('coordinated target application', () => {
  const plan = {
    targets: { fullTarget: 30, halfTarget: 15 },
    provenance: { full: 'observed' as const, half: 'observed' as const },
  }
  const localPresentation = presentation({
    alignment: { before: 3.25, after: 4.75 },
    boundaries: [
      { kind: 'full', target: 12 },
      { kind: 'half', target: 6 },
    ],
  })
  const localResult = distributedResult(localPresentation)
  const intrinsic = {
    status: 'measured' as const,
    units: [],
    boundaries: [
      { kind: 'full' as const, carrier: target, intrinsicWhitespace: 9 },
      { kind: 'half' as const, carrier: target, intrinsicWhitespace: 8 },
    ],
  }

  it('uses cleared target intrinsic whitespace for absolute adjustments and preserves saved padding exactly', () => {
    const synchronized = createAutofitCoordinatedTargetPresentation(
      localPresentation,
      intrinsic,
      plan,
    )

    expect(synchronized.boundaries).toEqual([
      { kind: 'full', carrier: target, target: 30, adjustment: 21 },
      { kind: 'half', carrier: target, target: 15, adjustment: 7 },
    ])
    expect(synchronized.alignment).toBe(localPresentation.alignment)
    expect(synchronized.alignment).toEqual({ before: 3.25, after: 4.75 })
  })

  it('resolves measured non-fit geometry as synchronized overflow before gap verification and retains the plan', () => {
    const synchronized = createAutofitCoordinatedTargetPresentation(
      localPresentation,
      intrinsic,
      plan,
    )

    expect(resolveAutofitCoordinatedTargetApplication({
      localResult,
      plan,
      presentation: synchronized,
      geometry: { ...synchronizedGeometry, fits: false },
      visual: { status: 'unsupported', reason: 'visual-edge-nonfinite' },
    })).toMatchObject({
      status: 'synchronized-overflow',
      plan,
      result: {
        overflow: true,
        effectiveAlignment: 'distributed',
        presentation: { alignment: { before: 3.25, after: 4.75 } },
      },
    })
  })

  it('resolves measured fit with verified gaps as synchronized fit', () => {
    const synchronized = createAutofitCoordinatedTargetPresentation(
      localPresentation,
      intrinsic,
      plan,
    )

    expect(resolveAutofitCoordinatedTargetApplication({
      localResult,
      plan,
      presentation: synchronized,
      geometry: synchronizedGeometry,
      visual: { status: 'measured', realizedWhitespace: [30.3, 14.5] },
    })).toMatchObject({
      status: 'synchronized-fit',
      plan,
      result: {
        overflow: false,
        effectiveAlignment: 'distributed',
      },
    })
  })

  it('resolves finite measured gap mismatches as coordinated-gap-verification', () => {
    const synchronized = createAutofitCoordinatedTargetPresentation(
      localPresentation,
      intrinsic,
      plan,
    )

    expect(resolveAutofitCoordinatedTargetApplication({
      localResult,
      plan,
      presentation: synchronized,
      geometry: synchronizedGeometry,
      visual: { status: 'measured', realizedWhitespace: [30.6, 15] },
    })).toEqual({
      status: 'unsupported',
      plan,
      reason: 'coordinated-gap-verification',
    })
  })

  it('preserves typed measurement failures after a measured fit', () => {
    const synchronized = createAutofitCoordinatedTargetPresentation(
      localPresentation,
      intrinsic,
      plan,
    )

    expect(resolveAutofitCoordinatedTargetApplication({
      localResult,
      plan,
      presentation: synchronized,
      geometry: synchronizedGeometry,
      visual: { status: 'unsupported', reason: 'visual-rect-missing' },
    })).toEqual({
      status: 'unsupported',
      plan,
      reason: 'visual-rect-missing',
    })
  })
})

describe('coordinated target start alignment', () => {
  it.each([
    {
      delta: 3,
      padding: { before: 2, after: 5 },
      expected: {
        paddingShift: 3,
        alignment: { before: 5, after: 2 },
        residualBlockOffset: 0,
      },
    },
    {
      delta: 0,
      padding: { before: 2, after: 5 },
      expected: {
        paddingShift: 0,
        alignment: { before: 2, after: 5 },
        residualBlockOffset: 0,
      },
    },
    {
      delta: 5,
      padding: { before: 2, after: 5 },
      expected: {
        paddingShift: 5,
        alignment: { before: 7, after: 0 },
        residualBlockOffset: 0,
      },
    },
    {
      delta: -2,
      padding: { before: 2, after: 5 },
      expected: {
        paddingShift: -2,
        alignment: { before: 0, after: 7 },
        residualBlockOffset: 0,
      },
    },
    {
      delta: 8.25,
      padding: { before: 2, after: 5 },
      expected: {
        paddingShift: 5,
        alignment: { before: 7, after: 0 },
        residualBlockOffset: 3.25,
      },
    },
    {
      delta: -4.75,
      padding: { before: 2, after: 5 },
      expected: {
        paddingShift: -2,
        alignment: { before: 0, after: 7 },
        residualBlockOffset: -2.75,
      },
    },
  ] as const)('redistributes exact target padding for delta $delta', ({ delta, padding, expected: expectedAlignment }) => {
    const alignment = calculateAutofitCoordinatedTargetAlignment({
      targetLocalDelta: delta,
      padding,
    })

    expect(alignment).toEqual({
      targetLocalDelta: delta,
      ...expectedAlignment,
    })
    expect(alignment.alignment.before).toBeGreaterThanOrEqual(0)
    expect(alignment.alignment.after).toBeGreaterThanOrEqual(0)
    expect(alignment.alignment.before + alignment.alignment.after)
      .toBe(padding.before + padding.after)
  })

  const plan = {
    targets: { fullTarget: 30, halfTarget: 15 },
    provenance: { full: 'observed' as const, half: 'observed' as const },
  }
  const localPresentation = presentation({
    alignment: { before: 2, after: 5 },
    boundaries: [{ kind: 'full', target: 12 }],
  })
  const localResult = distributedResult(localPresentation)
  const intrinsic = {
    status: 'measured' as const,
    units: [],
    boundaries: [
      { kind: 'full' as const, carrier: target, intrinsicWhitespace: 9 },
    ],
  }

  function alignedPresentation(delta: number) {
    return createAutofitCoordinatedAlignedTargetPresentation(
      localPresentation,
      intrinsic,
      plan,
      calculateAutofitCoordinatedTargetAlignment({
        targetLocalDelta: delta,
        padding: localPresentation.alignment,
      }),
    )
  }

  function alignment(delta: number) {
    return {
      status: 'measured' as const,
      alignment: calculateAutofitCoordinatedTargetAlignment({
        targetLocalDelta: delta,
        padding: localPresentation.alignment,
      }),
    }
  }

  const anchor = {
    status: 'measured' as const,
    error: 0,
  }

  it('stores an exact nonzero sub-tolerance residual in the fitted presentation', () => {
    const presentation = alignedPresentation(5.25)

    expect(presentation).toMatchObject({
      alignment: { before: 7, after: 0 },
      residualBlockOffset: 0.25,
      boundaries: [{ target: 30, adjustment: 21 }],
    })
    expect(resolveAutofitCoordinatedAlignedTargetApplication({
      localResult,
      plan,
      presentation,
      preAlignmentGeometry: synchronizedGeometry,
      alignment: alignment(5.25),
      geometry: synchronizedGeometry,
      visual: { status: 'measured', realizedWhitespace: [30] },
      anchor,
    })).toMatchObject({
      status: 'synchronized-fit',
      result: {
        overflow: false,
        presentation: { residualBlockOffset: 0.25 },
      },
    })
  })

  it('resolves all exact-calculated overflow causes before final verification failures', () => {
    const cases = [
      {
        name: 'synchronized gaps',
        delta: 5.25,
        preAlignmentGeometry: { ...synchronizedGeometry, fits: false },
        geometry: synchronizedGeometry,
        expected: { coordinatedGap: true, coordinatedStartAlignment: false },
      },
      {
        name: 'out-of-budget residual',
        delta: 5.75,
        preAlignmentGeometry: synchronizedGeometry,
        geometry: synchronizedGeometry,
        expected: { coordinatedGap: false, coordinatedStartAlignment: true },
      },
      {
        name: 'aligned final geometry',
        delta: 0,
        preAlignmentGeometry: synchronizedGeometry,
        geometry: { ...synchronizedGeometry, fits: false },
        expected: { coordinatedGap: false, coordinatedStartAlignment: true },
      },
      {
        name: 'both requirements',
        delta: 5.75,
        preAlignmentGeometry: { ...synchronizedGeometry, fits: false },
        geometry: { ...synchronizedGeometry, fits: false },
        expected: { coordinatedGap: true, coordinatedStartAlignment: true },
      },
    ] as const

    for (const testCase of cases) {
      expect(resolveAutofitCoordinatedAlignedTargetApplication({
        localResult,
        plan,
        presentation: alignedPresentation(testCase.delta),
        preAlignmentGeometry: testCase.preAlignmentGeometry,
        alignment: alignment(testCase.delta),
        geometry: testCase.geometry,
        visual: { status: 'unsupported', reason: 'visual-rect-missing' },
        anchor: { status: 'measured', error: 1 },
      })).toMatchObject({
        status: 'synchronized-overflow',
        overflowCauses: testCase.expected,
        result: {
          overflow: true,
          effectiveAlignment: 'distributed',
          presentation: alignedPresentation(testCase.delta),
        },
      })
    }
  })

  it.each([
    [
      'preserves a typed pre-alignment anchor failure',
      {
        preAlignmentGeometry: synchronizedGeometry,
        alignment: { status: 'unsupported' as const, reason: 'visual-rect-missing' as const },
        visual: { status: 'measured' as const, realizedWhitespace: [30] },
        anchor,
      },
      { status: 'unsupported', plan, reason: 'visual-rect-missing' },
    ],
    [
      'defers incomplete coordinate work',
      {
        preAlignmentGeometry: synchronizedGeometry,
        alignment: { status: 'deferred' as const },
        visual: { status: 'measured' as const, realizedWhitespace: [30] },
        anchor,
      },
      { status: 'stale' },
    ],
    [
      'preserves a typed pre-alignment nonfinite anchor failure',
      {
        preAlignmentGeometry: synchronizedGeometry,
        alignment: { status: 'unsupported' as const, reason: 'visual-edge-nonfinite' as const },
        visual: { status: 'measured' as const, realizedWhitespace: [30] },
        anchor,
      },
      { status: 'unsupported', plan, reason: 'visual-edge-nonfinite' },
    ],
    [
      'preserves a typed final visual failure after fit geometry',
      {
        preAlignmentGeometry: synchronizedGeometry,
        alignment: alignment(0),
        visual: { status: 'unsupported' as const, reason: 'visual-edge-nonfinite' as const },
        anchor,
      },
      { status: 'unsupported', plan, reason: 'visual-edge-nonfinite' },
    ],
    [
      'prioritizes the finite gap mismatch over a start mismatch',
      {
        preAlignmentGeometry: synchronizedGeometry,
        alignment: alignment(0),
        visual: { status: 'measured' as const, realizedWhitespace: [30.6] },
        anchor: { status: 'measured' as const, error: 1 },
      },
      { status: 'unsupported', plan, reason: 'coordinated-gap-verification' },
    ],
    [
      'reports a start mismatch only after gaps verify',
      {
        preAlignmentGeometry: synchronizedGeometry,
        alignment: alignment(0),
        visual: { status: 'measured' as const, realizedWhitespace: [30] },
        anchor: { status: 'measured' as const, error: 0.6 },
      },
      {
        status: 'unsupported',
        plan,
        reason: 'coordinated-start-alignment-verification',
      },
    ],
  ] as const)('%s', (_, verification, expectedApplication) => {
    expect(resolveAutofitCoordinatedAlignedTargetApplication({
      localResult,
      plan,
      presentation: alignedPresentation(0),
      geometry: synchronizedGeometry,
      ...verification,
    })).toEqual(expectedApplication)
  })

  function createResidualStyleFixture(options: {
    readonly authoredPosition?: string
    readonly authoredInsetBlockStart?: string
  } = {}) {
    const viewport = document.createElement('section')
    const flow = document.createElement('div')
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Target text'
    flow.append(paragraph)
    viewport.append(flow)
    document.body.append(viewport)
    if (options.authoredPosition) {
      flow.style.setProperty('position', options.authoredPosition)
    }
    if (options.authoredInsetBlockStart) {
      flow.style.setProperty(
        'inset-block-start',
        options.authoredInsetBlockStart,
      )
    }

    const session = createAutofitStaticFitSession({
      viewport,
      flow,
      config: {
        largeTiers: 1,
        smallTiers: 1,
        tierIncrement: 1,
        alignment: 'top',
      },
      classification: classifyAutofitContent(flow),
    })
    const retained = {
      ...presentation({ alignment: { before: 7, after: 0 } }),
      signature: session.classificationSignature,
      typography: [{ element: paragraph, fontSize: 16, lineHeight: 'normal' as const }],
      residualBlockOffset: 0.25,
    }
    const ordinary = { ...retained, residualBlockOffset: 0 }

    return { viewport, flow, session, retained, ordinary }
  }

  function expectNoGeneratedResidual(flow: HTMLElement): void {
    expect(flow.style.getPropertyValue('position')).toBe('')
    expect(flow.style.getPropertyValue('inset-block-start')).toBe('')
  }

  it.each([
    { residualBlockOffset: 1e-10, cssValue: '1e-10px' },
    { residualBlockOffset: -1e-10, cssValue: '-1e-10px' },
  ])(
    'serializes the exact signed residual $residualBlockOffset without retaining generated positioning after reset',
    ({ residualBlockOffset, cssValue }) => {
      const fixture = createResidualStyleFixture()
      const retained = {
        ...fixture.retained,
        residualBlockOffset,
      }

      try {
        fixture.session.restorePresentation(retained)
        expect(fixture.flow.style.getPropertyValue('padding-block-start'))
          .toBe('7px')
        expect(fixture.flow.style.getPropertyValue('padding-block-end'))
          .toBe('0px')
        expect(fixture.flow.style.getPropertyValue('position')).toBe('relative')
        expect(fixture.flow.style.getPropertyValue('inset-block-start'))
          .toBe(cssValue)

        fixture.session.writeIntrinsicCandidate({ index: 0, scale: 1 })
        expectNoGeneratedResidual(fixture.flow)

        fixture.session.restorePresentation(retained)
        fixture.session.restorePresentation(fixture.ordinary)
        expectNoGeneratedResidual(fixture.flow)

        fixture.session.restorePresentation(retained)
        fixture.session.restoreAuthoredNeutralTop()
        expectNoGeneratedResidual(fixture.flow)

        fixture.session.restorePresentation(retained)
        fixture.session.cleanup()
        expectNoGeneratedResidual(fixture.flow)
      }
      finally {
        fixture.viewport.remove()
      }
    },
  )

  it('restores authored positioning after residual preparation, ordinary restore, neutral restore, and cleanup', () => {
    const fixture = createResidualStyleFixture({
      authoredPosition: 'static',
      authoredInsetBlockStart: '11px',
    })

    function expectAuthoredPosition(): void {
      expect(fixture.flow.style.getPropertyValue('position')).toBe('static')
      expect(fixture.flow.style.getPropertyPriority('position')).toBe('')
      expect(fixture.flow.style.getPropertyValue('inset-block-start')).toBe('11px')
      expect(fixture.flow.style.getPropertyPriority('inset-block-start')).toBe('')
    }

    try {
      fixture.session.restorePresentation(fixture.retained)
      expect(fixture.flow.style.getPropertyValue('position')).toBe('relative')
      expect(fixture.flow.style.getPropertyValue('inset-block-start')).toBe('0.25px')

      fixture.session.writeIntrinsicCandidate({ index: 0, scale: 1 })
      expectAuthoredPosition()

      fixture.session.restorePresentation(fixture.retained)
      fixture.session.restorePresentation(fixture.ordinary)
      expectAuthoredPosition()

      fixture.session.restorePresentation(fixture.retained)
      fixture.session.restoreAuthoredNeutralTop()
      expectAuthoredPosition()

      fixture.session.restorePresentation(fixture.retained)
      fixture.session.cleanup()
      expectAuthoredPosition()
    }
    finally {
      fixture.viewport.remove()
    }
  })

  it('can dispose a committed presentation without removing its generated styles', () => {
    const fixture = createResidualStyleFixture()
    fixture.flow.style.setProperty('transition', 'all 370ms linear')
    const paragraph = fixture.flow.querySelector<HTMLElement>('p')!
    paragraph.style.setProperty('transition', 'all 370ms linear')

    try {
      fixture.session.writeIntrinsicCandidate({ index: 0, scale: 1 })
      fixture.session.restorePresentation(fixture.retained)

      fixture.session.cleanup({ preservePresentation: true })

      expect(fixture.flow.style.getPropertyValue('padding-block-start')).toBe('7px')
      expect(fixture.flow.style.getPropertyValue('position')).toBe('relative')
      expect(fixture.flow.style.getPropertyValue('inset-block-start')).toBe('0.25px')
      expect(paragraph.style.getPropertyValue('font-size')).toBe('16px')
      expect(paragraph.style.getPropertyValue('line-height')).toBe('normal')
      expect(fixture.flow.style.getPropertyValue('transition')).toBe('all 370ms linear')
      expect(paragraph.style.getPropertyValue('transition')).toBe('all 370ms linear')

      expect(() => fixture.session.restorePresentation(fixture.retained)).toThrow(
        'autofit static fitting session has been cleaned up',
      )
      expect(() => fixture.session.cleanup({ preservePresentation: true })).not.toThrow()
    }
    finally {
      fixture.viewport.remove()
    }
  })

  it('continues to restore authored styles during ordinary cleanup', () => {
    const fixture = createResidualStyleFixture()
    const paragraph = fixture.flow.querySelector<HTMLElement>('p')!

    try {
      fixture.session.restorePresentation(fixture.retained)
      fixture.session.cleanup()

      expectNoGeneratedResidual(fixture.flow)
      expect(fixture.flow.style.getPropertyValue('padding-block-start')).toBe('')
      expect(paragraph.style.getPropertyValue('font-size')).toBe('')
      expect(paragraph.style.getPropertyValue('line-height')).toBe('')
    }
    finally {
      fixture.viewport.remove()
    }
  })

  it('clears an active residual before the coordinated unsupported fallback returns', () => {
    const host = document.createElement('section')
    const viewport = document.createElement('section')
    const flow = document.createElement('div')
    const paragraph = document.createElement('p')
    paragraph.textContent = 'Target text'
    flow.append(paragraph)
    viewport.append(flow)
    host.append(viewport)
    document.body.append(host)
    host.style.setProperty('width', '100px')
    host.style.setProperty('height', '100px')
    viewport.style.setProperty('width', '100px')
    viewport.style.setProperty('height', '100px')
    flow.style.setProperty('--slidev-autofit-base-spacing', '10px')

    const viewportRect = {
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    } as DOMRect
    const paragraphRect = {
      bottom: 20,
      height: 10,
      left: 0,
      right: 40,
      top: 10,
      width: 40,
      x: 0,
      y: 10,
      toJSON: () => ({}),
    } as DOMRect
    let hasVisualRect = true
    const rangeSpy = vi.spyOn(document, 'createRange').mockImplementation(() => ({
      selectNodeContents: () => undefined,
      getClientRects: () => hasVisualRect
        ? [paragraphRect]
        : [],
    }) as unknown as Range)
    const hostRectSpy = vi.spyOn(host, 'getBoundingClientRect')
      .mockReturnValue(viewportRect)
    const hostClientRectsSpy = vi.spyOn(host, 'getClientRects')
      .mockReturnValue([viewportRect] as unknown as DOMRectList)
    const viewportRectSpy = vi.spyOn(viewport, 'getBoundingClientRect')
      .mockReturnValue(viewportRect)
    const viewportClientRectsSpy = vi.spyOn(viewport, 'getClientRects')
      .mockReturnValue([viewportRect] as unknown as DOMRectList)
    const paragraphRectSpy = vi.spyOn(paragraph, 'getBoundingClientRect')
      .mockReturnValue(paragraphRect)
    const paragraphClientRectsSpy = vi.spyOn(paragraph, 'getClientRects')
      .mockReturnValue([paragraphRect] as unknown as DOMRectList)
    const session = createAutofitStaticFitSession({
      viewport,
      flow,
      config: {
        largeTiers: 1,
        smallTiers: 1,
        tierIncrement: 1,
        alignment: 'top',
      },
      classification: classifyAutofitContent(flow),
    })
    const candidate = { index: 0, scale: 1 }
    const retained = {
      ...presentation(),
      signature: session.classificationSignature,
      typography: [{ element: paragraph, fontSize: 16, lineHeight: 'normal' as const }],
      residualBlockOffset: 0.25,
    }

    try {
      session.writeIntrinsicCandidate(candidate)
      const intrinsic = session.readIntrinsicCandidate(candidate)
      expect(intrinsic.status).toBe('measured')
      if (intrinsic.status !== 'measured')
        return
      expect(session.readFinalCandidate(candidate, intrinsic.payload))
        .toMatchObject({ status: 'measured' })

      session.restorePresentation(retained)
      expect(flow.style.getPropertyValue('inset-block-start')).toBe('0.25px')
      hasVisualRect = false
      expect(session.applyCoordinatedAlignedTargetPlan({
        tier: 0,
        scale: 1,
        overflow: false,
        effectiveAlignment: 'distributed',
        gapCounts: { full: 0, half: 0 },
        presentation: retained,
      }, {
        targets: { fullTarget: 10, halfTarget: 5 },
        provenance: { full: 'derived', half: 'derived' },
      }, {
        localAnchor: 10,
        viewportBlockOrigin: 0,
        viewportBlockScale: 1,
        viewportBlockSize: 100,
        pairHostBlockScale: 1,
      }, {
        viewportBlockOrigin: 0,
        viewportBlockScale: 1,
        viewportBlockSize: 100,
        pairHostBlockScale: 1,
      }, viewport)).toMatchObject({
        status: 'unsupported',
        reason: 'visual-rect-missing',
      })
      expectNoGeneratedResidual(flow)
    }
    finally {
      session.cleanup()
      rangeSpy.mockRestore()
      hostRectSpy.mockRestore()
      hostClientRectsSpy.mockRestore()
      viewportRectSpy.mockRestore()
      viewportClientRectsSpy.mockRestore()
      paragraphRectSpy.mockRestore()
      paragraphClientRectsSpy.mockRestore()
      host.remove()
    }
  })
})
