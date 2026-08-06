import { describe, expect, it } from 'vitest'

import {
  createAutoColumnCoordinator,
  type AutoColumnCoordinator,
  type AutoColumnLocalPresentationMetadata,
} from '../../utils/autofit/auto-column-coordinator'

function managed(tier: number, overflow = false) {
  return { status: 'managed' as const, tier, overflow }
}

function completePair(
  coordinator: AutoColumnCoordinator,
  left: Parameters<AutoColumnCoordinator['submitPrivate']>[0]['outcome'],
  right: Parameters<AutoColumnCoordinator['submitPrivate']>[0]['outcome'],
  leftFirst = true,
) {
  const epoch = coordinator.epoch
  const first = leftFirst
    ? coordinator.submitPrivate({ role: 'left', epoch, outcome: left })
    : coordinator.submitPrivate({ role: 'right', epoch, outcome: right })
  const second = leftFirst
    ? coordinator.submitPrivate({ role: 'right', epoch, outcome: right })
    : coordinator.submitPrivate({ role: 'left', epoch, outcome: left })

  return { first, second, epoch }
}

function localPresentation(
  requestedAlignment: AutoColumnLocalPresentationMetadata['requestedAlignment'] = 'distributed',
  effectiveAlignment: AutoColumnLocalPresentationMetadata['effectiveAlignment'] = 'distributed',
  full: number | null = 12,
  half: number | null = 6,
): AutoColumnLocalPresentationMetadata {
  return {
    requestedAlignment,
    effectiveAlignment,
    verifiedGapTargets: { full, half },
  }
}

function measured(fits = true) {
  return {
    status: 'measured' as const,
    fits,
    // These common-tier finalization cases are deliberately ineligible; the
    // authority-specific cases below supply their own metadata.
    presentation: localPresentation('top', 'top'),
  }
}

function prepareManagedCommonTier(
  coordinator: AutoColumnCoordinator,
  leftTier: number,
  rightTier: number,
  left: AutoColumnLocalPresentationMetadata,
  right: AutoColumnLocalPresentationMetadata,
  leftFirst = true,
) {
  const { epoch } = completePair(coordinator, managed(leftTier), managed(rightTier), leftFirst)
  const first = leftFirst
    ? coordinator.submitCommonTier({
        role: 'left',
        epoch,
        outcome: { status: 'measured', fits: true, presentation: left },
      })
    : coordinator.submitCommonTier({
        role: 'right',
        epoch,
        outcome: { status: 'measured', fits: true, presentation: right },
      })
  const second = leftFirst
    ? coordinator.submitCommonTier({
        role: 'right',
        epoch,
        outcome: { status: 'measured', fits: true, presentation: right },
      })
    : coordinator.submitCommonTier({
        role: 'left',
        epoch,
        outcome: { status: 'measured', fits: true, presentation: left },
      })

  return { epoch, first, second }
}

describe('auto-column coordinator private barrier', () => {
  it.each([true, false])('waits for both roles regardless of completion order', (leftFirst) => {
    const coordinator = createAutoColumnCoordinator()
    const { first, second, epoch } = completePair(
      coordinator,
      managed(3),
      managed(1),
      leftFirst,
    )

    expect(first).toEqual({ kind: 'waiting', epoch })
    expect(second).toMatchObject({
      kind: 'finalize-common-tier',
      epoch,
      tier: 1,
    })
  })

  it.each(['left', 'right'] as const)('opens a coordinator-owned epoch for %s invalidation', (role) => {
    const coordinator = createAutoColumnCoordinator()
    const firstEpoch = coordinator.epoch
    coordinator.submitPrivate({ role: 'left', epoch: firstEpoch, outcome: managed(2) })

    const secondEpoch = coordinator.invalidate(role)
    expect(secondEpoch).toBe(firstEpoch + 1)
    expect(coordinator.submitPrivate({ role: 'left', epoch: firstEpoch, outcome: managed(2) }))
      .toEqual({ kind: 'ignored', epoch: secondEpoch, reason: 'stale-epoch' })
    expect(coordinator.submitPrivate({ role: 'right', epoch: firstEpoch, outcome: managed(1) }))
      .toEqual({ kind: 'ignored', epoch: secondEpoch, reason: 'stale-epoch' })
    expect(coordinator.submitPrivate({ role: 'left', epoch: secondEpoch, outcome: managed(2) }))
      .toEqual({ kind: 'waiting', epoch: secondEpoch })
    expect(coordinator.submitPrivate({ role: 'right', epoch: secondEpoch, outcome: managed(1) }))
      .toMatchObject({ kind: 'finalize-common-tier', epoch: secondEpoch, tier: 1 })
  })

  it.each([
    'deferred',
    'stale',
    'cancelled',
    'superseded',
    'unmounted',
  ] as const)('rejects %s private terminal work without publication', (status) => {
    const coordinator = createAutoColumnCoordinator()
    const epoch = coordinator.epoch

    expect(coordinator.submitPrivate({ role: 'left', epoch, outcome: { status } }))
      .toEqual({ kind: 'discard-epoch', epoch, reason: status })
  })

  it('rejects duplicate role results in the current epoch', () => {
    const coordinator = createAutoColumnCoordinator()
    const epoch = coordinator.epoch
    coordinator.submitPrivate({ role: 'left', epoch, outcome: managed(1) })

    expect(coordinator.submitPrivate({ role: 'left', epoch, outcome: managed(0) }))
      .toEqual({ kind: 'ignored', epoch, reason: 'duplicate-role' })
  })

  it.each([
    [3, 1, 1],
    [0, -2, -2],
    [-1, -4, -4],
  ])('selects the smaller signed managed tier', (left, right, tier) => {
    const { second } = completePair(createAutoColumnCoordinator(), managed(left), managed(right))

    expect(second).toMatchObject({ kind: 'finalize-common-tier', tier })
  })

  it('makes an empty role non-voting and resolves both empty roles at tier zero', () => {
    const oneEmpty = completePair(createAutoColumnCoordinator(), { status: 'empty' }, managed(-2))
    expect(oneEmpty.second).toMatchObject({
      kind: 'publish-private',
      tier: -2,
    })

    const bothEmpty = completePair(createAutoColumnCoordinator(), { status: 'empty' }, { status: 'empty' })
    expect(bothEmpty.second).toMatchObject({
      kind: 'publish-private',
      tier: 0,
    })
  })

  it('selects the smallest tier when one or both managed roles overflow', () => {
    const oneOverflow = completePair(createAutoColumnCoordinator(), managed(-4, true), managed(2))
    expect(oneOverflow.second).toMatchObject({ kind: 'finalize-common-tier', tier: -4 })

    const bothOverflow = completePair(createAutoColumnCoordinator(), managed(-4, true), managed(-4, true))
    expect(bothOverflow.second).toMatchObject({ kind: 'finalize-common-tier', tier: -4 })
  })

  it.each([
    [managed(2), { status: 'unsupported' as const }],
    [managed(-4, true), { status: 'unsupported' as const }],
    [{ status: 'empty' as const }, { status: 'unsupported' as const }],
    [{ status: 'unsupported' as const }, { status: 'unsupported' as const }],
  ])('publishes unsupported combinations atomically without managed reconciliation', (left, right) => {
    const { second } = completePair(createAutoColumnCoordinator(), left, right)

    expect(second).toMatchObject({ kind: 'publish-fallback' })
  })
})

describe('auto-column common-tier finalization', () => {
  it('publishes a verified shared tier only after both measured fits', () => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = completePair(coordinator, managed(3), managed(1))

    expect(coordinator.submitCommonTier({ role: 'left', epoch, outcome: measured() }))
      .toEqual({ kind: 'waiting', epoch })
    expect(coordinator.submitCommonTier({ role: 'right', epoch, outcome: measured() }))
      .toMatchObject({ kind: 'publish-common-tier', epoch, tier: 1 })
  })

  it('discards prepared common work and atomically falls back when it becomes unsupported', () => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = completePair(coordinator, managed(3), managed(1))
    coordinator.submitCommonTier({ role: 'left', epoch, outcome: measured() })

    expect(coordinator.submitCommonTier({ role: 'right', epoch, outcome: { status: 'unsupported' } }))
      .toMatchObject({ kind: 'publish-fallback', epoch })
    expect(coordinator.submitCommonTier({ role: 'left', epoch, outcome: measured() }))
      .toEqual({ kind: 'ignored', epoch, reason: 'resolved-epoch' })
  })

  it.each([
    'deferred',
    'stale',
    'cancelled',
    'superseded',
    'unmounted',
  ] as const)('returns a typed no-publication decision for common-tier %s work', (status) => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = completePair(coordinator, managed(3), managed(1))

    expect(coordinator.submitCommonTier({ role: 'left', epoch, outcome: { status } }))
      .toEqual({ kind: 'discard-epoch', epoch, reason: status })
    expect(coordinator.submitCommonTier({ role: 'right', epoch, outcome: measured() }))
      .toEqual({ kind: 'ignored', epoch, reason: 'discarded-epoch' })

    const recoveryEpoch = coordinator.invalidate('left')
    expect(coordinator.submitPrivate({ role: 'left', epoch: recoveryEpoch, outcome: managed(3) }))
      .toEqual({ kind: 'waiting', epoch: recoveryEpoch })
    expect(coordinator.submitPrivate({ role: 'right', epoch: recoveryEpoch, outcome: managed(1) }))
      .toMatchObject({ kind: 'finalize-common-tier', epoch: recoveryEpoch, tier: 1 })
  })

  it('rejects a cached common-tier non-fit outside the monotonic contract without retry', () => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = completePair(coordinator, managed(3), managed(1))

    expect(coordinator.submitCommonTier({ role: 'left', epoch, outcome: measured(false) }))
      .toEqual({ kind: 'discard-epoch', epoch, reason: 'non-monotonic-non-fit' })
    expect(coordinator.submitCommonTier({ role: 'right', epoch, outcome: measured() }))
      .toEqual({ kind: 'ignored', epoch, reason: 'discarded-epoch' })
  })
})

describe('auto-column distributed-gap authority', () => {
  it.each([true, false])('selects the smaller unequal private tier independently of %s-first local completion', (leftFirst) => {
    for (const [leftTier, rightTier, source] of [
      [1, 3, 'left'],
      [0, -1, 'right'],
      [-2, -1, 'left'],
    ] as const) {
      const { first, second } = prepareManagedCommonTier(
        createAutoColumnCoordinator(),
        leftTier,
        rightTier,
        localPresentation(),
        localPresentation(),
        leftFirst,
      )

      expect(first).toMatchObject({ kind: 'waiting' })
      expect(second).toMatchObject({
        kind: 'synchronize-target',
        source,
        target: source === 'left' ? 'right' : 'left',
      })
    }
  })

  it.each([true, false])('never promotes an eligible sibling over a smaller ineligible source in %s-first completion', (leftFirst) => {
    const boundaryFree = localPresentation('distributed', 'distributed', null, null)
    const { second } = prepareManagedCommonTier(
      createAutoColumnCoordinator(),
      -1,
      1,
      boundaryFree,
      localPresentation(),
      leftFirst,
    )

    expect(second).toMatchObject({
      kind: 'publish-common-tier',
      source: 'left',
      target: 'right',
    })
  })

  it.each([true, false])('selects the numerically smaller equal-tier full target even inside visual tolerance in %s-first completion', (leftFirst) => {
    for (const [left, right, source] of [
      [
        localPresentation('distributed', 'distributed', 12, 6),
        localPresentation('distributed', 'distributed', 12.000001, 6.0000005),
        'left',
      ],
      [
        localPresentation('distributed', 'distributed', 12.000001, 6.0000005),
        localPresentation('distributed', 'distributed', 12, 6),
        'right',
      ],
    ] as const) {
      const { second } = prepareManagedCommonTier(
        createAutoColumnCoordinator(),
        1,
        1,
        left,
        right,
        leftFirst,
      )

      expect(second).toMatchObject({
        kind: 'synchronize-target',
        source,
        target: source === 'left' ? 'right' : 'left',
      })
    }
  })

  it.each([true, false])('uses 2 * verified half target for equal-tier half-only authority in %s-first completion', (leftFirst) => {
    for (const [left, right, source] of [
      [
        localPresentation('distributed', 'distributed', null, 4),
        localPresentation('distributed', 'distributed', null, 4.5),
        'left',
      ],
      [
        localPresentation('distributed', 'distributed', null, 4.5),
        localPresentation('distributed', 'distributed', null, 4),
        'right',
      ],
    ] as const) {
      const { second } = prepareManagedCommonTier(
        createAutoColumnCoordinator(),
        1,
        1,
        left,
        right,
        leftFirst,
      )

      expect(second).toMatchObject({
        kind: 'synchronize-target',
        source,
        target: source === 'left' ? 'right' : 'left',
      })
    }
  })

  it.each([true, false])('uses the sole equal-tier boundary-bearing role in %s-first completion', (leftFirst) => {
    for (const [left, right, source] of [
      [localPresentation('distributed', 'distributed', null, null), localPresentation(), 'right'],
      [localPresentation(), localPresentation('distributed', 'distributed', null, null), 'left'],
    ] as const) {
      const { second } = prepareManagedCommonTier(
        createAutoColumnCoordinator(),
        1,
        1,
        left,
        right,
        leftFirst,
      )

      expect(second).toMatchObject({
        kind: 'synchronize-target',
        source,
        target: source === 'left' ? 'right' : 'left',
      })
    }
  })

  it.each([true, false])('skips equal-tier authority when both roles are boundary-free in %s-first completion', (leftFirst) => {
    const { second } = prepareManagedCommonTier(
      createAutoColumnCoordinator(),
      1,
      1,
      localPresentation('distributed', 'distributed', null, null),
      localPresentation('distributed', 'distributed', null, null),
      leftFirst,
    )

    expect(second).toMatchObject({ kind: 'publish-common-tier' })
    expect(second).not.toHaveProperty('source')
  })

  it.each([true, false])('breaks exact equal-tier target comparisons toward left in %s-first completion', (leftFirst) => {
    const { second } = prepareManagedCommonTier(
      createAutoColumnCoordinator(),
      1,
      1,
      localPresentation('distributed', 'distributed', 12, 6),
      localPresentation('distributed', 'distributed', null, 6),
      leftFirst,
    )

    expect(second).toMatchObject({ kind: 'synchronize-target', source: 'left', target: 'right' })
  })

  it.each([
    ['top', 'distributed'],
    ['middle', 'distributed'],
    ['bottom', 'distributed'],
    ['distributed', 'middle'],
    ['distributed', 'top'],
  ] as const)('publishes local common-tier work when the authoritative source is requested %s and effective %s', (requested, effective) => {
    const { second } = prepareManagedCommonTier(
      createAutoColumnCoordinator(),
      0,
      1,
      localPresentation(requested, effective),
      localPresentation(),
    )

    expect(second).toMatchObject({
      kind: 'publish-common-tier',
      source: 'left',
      target: 'right',
    })
  })

  it('keeps an ordinary-overflow effective-top source ineligible, distinct from synchronized target overflow', () => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = completePair(coordinator, managed(-1, true), managed(1))

    expect(coordinator.submitCommonTier({
      role: 'left',
      epoch,
      outcome: { status: 'measured', fits: true, presentation: localPresentation('distributed', 'top') },
    })).toEqual({ kind: 'waiting', epoch })
    expect(coordinator.submitCommonTier({
      role: 'right',
      epoch,
      outcome: { status: 'measured', fits: true, presentation: localPresentation() },
    })).toMatchObject({
      kind: 'publish-common-tier',
      source: 'left',
      target: 'right',
    })

    const synchronized = prepareManagedCommonTier(
      createAutoColumnCoordinator(),
      -1,
      1,
      localPresentation(),
      localPresentation(),
    )
    expect(synchronized.second).toMatchObject({ kind: 'synchronize-target' })
  })

  it('emits one target synchronization decision, waits, and publishes synchronized fit', () => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch, second } = prepareManagedCommonTier(
      coordinator,
      0,
      1,
      localPresentation(),
      localPresentation(),
    )

    expect(second).toMatchObject({ kind: 'synchronize-target', source: 'left', target: 'right' })
    expect(coordinator.submitCommonTier({
      role: 'left',
      epoch,
      outcome: { status: 'measured', fits: true, presentation: localPresentation() },
    })).toEqual({ kind: 'ignored', epoch, reason: 'duplicate-role' })
    expect(coordinator.submitTargetSynchronization({
      role: 'right',
      epoch,
      outcome: { status: 'synchronized-fit' },
    })).toMatchObject({
      kind: 'publish-synchronized-common-tier',
      source: 'left',
      target: 'right',
      targetTerminal: { status: 'synchronized-fit' },
    })
  })

  it.each([
    ['synchronized-overflow', 'publish-synchronized-common-tier'],
    ['unsupported', 'publish-target-unsupported'],
  ] as const)('encodes the target %s terminal as %s', (status, kind) => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = prepareManagedCommonTier(
      coordinator,
      0,
      1,
      localPresentation(),
      localPresentation(),
    )

    expect(coordinator.submitTargetSynchronization({
      role: 'right',
      epoch,
      outcome: { status },
    })).toMatchObject({
      kind,
      source: 'left',
      target: 'right',
      targetTerminal: { status },
    })
  })

  it.each([
    'deferred',
    'stale',
    'cancelled',
    'superseded',
    'unmounted',
  ] as const)('discards %s target synchronization work without publication', (status) => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = prepareManagedCommonTier(
      coordinator,
      0,
      1,
      localPresentation(),
      localPresentation(),
    )

    expect(coordinator.submitTargetSynchronization({ role: 'right', epoch, outcome: { status } }))
      .toEqual({ kind: 'discard-epoch', epoch, reason: status })
    expect(coordinator.submitTargetSynchronization({
      role: 'right',
      epoch,
      outcome: { status: 'synchronized-fit' },
    })).toEqual({ kind: 'ignored', epoch, reason: 'discarded-epoch' })
  })

  it('clears authority and target synchronization phases on invalidation and rejects stale terminal work', () => {
    const coordinator = createAutoColumnCoordinator()
    const { epoch } = prepareManagedCommonTier(
      coordinator,
      0,
      1,
      localPresentation(),
      localPresentation(),
    )
    const replacementEpoch = coordinator.invalidate('left')

    expect(coordinator.submitTargetSynchronization({
      role: 'right',
      epoch,
      outcome: { status: 'synchronized-fit' },
    })).toEqual({ kind: 'ignored', epoch: replacementEpoch, reason: 'stale-epoch' })

    const replacement = prepareManagedCommonTier(
      coordinator,
      0,
      1,
      localPresentation(),
      localPresentation(),
    )
    expect(replacement.epoch).toBe(replacementEpoch)
    expect(replacement.second).toMatchObject({ kind: 'synchronize-target' })
  })
})
