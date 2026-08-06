/** Private coordination policy for the auto-column layout's fixed left/right pair. */
export type AutoColumnRole = 'left' | 'right'

export interface AutoColumnManagedTerminal<Payload = unknown> {
  readonly status: 'managed'
  readonly tier: number
  readonly overflow: boolean
  readonly payload?: Payload
}

export interface AutoColumnEmptyTerminal<Payload = unknown> {
  readonly status: 'empty'
  readonly payload?: Payload
}

export interface AutoColumnUnsupportedTerminal<Payload = unknown> {
  readonly status: 'unsupported'
  readonly payload?: Payload
}

export type AutoColumnDiscardedTerminalStatus =
  | 'deferred'
  | 'stale'
  | 'cancelled'
  | 'superseded'
  | 'unmounted'

export interface AutoColumnDiscardedTerminal {
  readonly status: AutoColumnDiscardedTerminalStatus
}

export type AutoColumnPrivateTerminal<Payload = unknown> =
  | AutoColumnManagedTerminal<Payload>
  | AutoColumnEmptyTerminal<Payload>
  | AutoColumnUnsupportedTerminal<Payload>
  | AutoColumnDiscardedTerminal

export interface AutoColumnPrivateOutcome<Payload = unknown> {
  readonly role: AutoColumnRole
  readonly epoch: number
  readonly outcome: AutoColumnPrivateTerminal<Payload>
}

/**
 * Serializable verified local-presentation facts used only after both roles
 * have completed the selected common tier. This deliberately carries no DOM
 * nodes, sessions, or carrier adjustments across the coordinator boundary.
 */
export interface AutoColumnLocalPresentationMetadata {
  readonly requestedAlignment: 'top' | 'middle' | 'center' | 'bottom' | 'distributed'
  readonly effectiveAlignment: 'top' | 'middle' | 'bottom' | 'distributed'
  readonly verifiedGapTargets: {
    readonly full: number | null
    readonly half: number | null
  }
}

export interface AutoColumnMeasuredCommonTierTerminal {
  readonly status: 'measured'
  readonly fits: boolean
  readonly presentation: AutoColumnLocalPresentationMetadata
}

export type AutoColumnCommonTierTerminal<Payload = unknown> =
  | AutoColumnMeasuredCommonTierTerminal
  | AutoColumnUnsupportedTerminal<Payload>
  | AutoColumnDiscardedTerminal

export interface AutoColumnCommonTierOutcome<Payload = unknown> {
  readonly role: AutoColumnRole
  readonly epoch: number
  readonly outcome: AutoColumnCommonTierTerminal<Payload>
}

export interface AutoColumnSynchronizedFitTerminal<Payload = unknown> {
  readonly status: 'synchronized-fit'
  readonly payload?: Payload
}

export interface AutoColumnSynchronizedOverflowTerminal<Payload = unknown> {
  readonly status: 'synchronized-overflow'
  readonly payload?: Payload
}

/** An unsupported terminal produced solely by coordinated target application. */
export interface AutoColumnTargetUnsupportedTerminal<Payload = unknown> {
  readonly status: 'unsupported'
  readonly payload?: Payload
}

export type AutoColumnTargetSynchronizationTerminal<Payload = unknown> =
  | AutoColumnSynchronizedFitTerminal<Payload>
  | AutoColumnSynchronizedOverflowTerminal<Payload>
  | AutoColumnTargetUnsupportedTerminal<Payload>
  | AutoColumnDiscardedTerminal

export interface AutoColumnTargetSynchronizationOutcome<Payload = unknown> {
  readonly role: AutoColumnRole
  readonly epoch: number
  readonly outcome: AutoColumnTargetSynchronizationTerminal<Payload>
}

type AutoColumnPrivatePair<Payload> = Readonly<{
  left: AutoColumnPrivateTerminal<Payload>
  right: AutoColumnPrivateTerminal<Payload>
}>

type AutoColumnAuthority = Readonly<{
  source: AutoColumnRole
  target: AutoColumnRole
  sourcePresentation: AutoColumnLocalPresentationMetadata
  targetPresentation: AutoColumnLocalPresentationMetadata
}>

export interface AutoColumnWaitingDecision {
  readonly kind: 'waiting'
  readonly epoch: number
}

export interface AutoColumnIgnoredDecision {
  readonly kind: 'ignored'
  readonly epoch: number
  readonly reason:
    | 'stale-epoch'
    | 'duplicate-role'
    | 'discarded-epoch'
    | 'resolved-epoch'
    | 'common-tier-not-selected'
    | 'target-synchronization-not-selected'
    | 'target-role-not-selected'
}

export interface AutoColumnDiscardEpochDecision {
  readonly kind: 'discard-epoch'
  readonly epoch: number
  readonly reason: AutoColumnDiscardedTerminalStatus | 'non-monotonic-non-fit'
}

export interface AutoColumnFinalizeCommonTierDecision<Payload = unknown> {
  readonly kind: 'finalize-common-tier'
  readonly epoch: number
  readonly tier: number
  readonly terminals: AutoColumnPrivatePair<Payload>
}

export interface AutoColumnPublishCommonTierDecision<Payload = unknown> {
  readonly kind: 'publish-common-tier'
  readonly epoch: number
  readonly tier: number
  readonly terminals: AutoColumnPrivatePair<Payload>
  /** Present when the pair selected an ineligible source. */
  readonly source?: AutoColumnRole
  /** Present when the pair selected an ineligible source. */
  readonly target?: AutoColumnRole
}

export interface AutoColumnPublishPrivateDecision<Payload = unknown> {
  readonly kind: 'publish-private'
  readonly epoch: number
  /** The managed tier, or neutral tier zero when both roles are empty. */
  readonly tier: number
  readonly terminals: AutoColumnPrivatePair<Payload>
}

export interface AutoColumnPublishFallbackDecision<Payload = unknown> {
  readonly kind: 'publish-fallback'
  readonly epoch: number
  readonly terminals: AutoColumnPrivatePair<Payload>
}

export interface AutoColumnSynchronizeTargetDecision<Payload = unknown> {
  readonly kind: 'synchronize-target'
  readonly epoch: number
  readonly tier: number
  readonly terminals: AutoColumnPrivatePair<Payload>
  readonly source: AutoColumnRole
  readonly target: AutoColumnRole
  readonly sourcePresentation: AutoColumnLocalPresentationMetadata
  readonly targetPresentation: AutoColumnLocalPresentationMetadata
}

export interface AutoColumnPublishSynchronizedCommonTierDecision<Payload = unknown> {
  readonly kind: 'publish-synchronized-common-tier'
  readonly epoch: number
  readonly tier: number
  readonly terminals: AutoColumnPrivatePair<Payload>
  readonly source: AutoColumnRole
  readonly target: AutoColumnRole
  readonly targetTerminal:
    | AutoColumnSynchronizedFitTerminal<Payload>
    | AutoColumnSynchronizedOverflowTerminal<Payload>
}

export interface AutoColumnPublishTargetUnsupportedDecision<Payload = unknown> {
  readonly kind: 'publish-target-unsupported'
  readonly epoch: number
  readonly tier: number
  readonly terminals: AutoColumnPrivatePair<Payload>
  readonly source: AutoColumnRole
  readonly target: AutoColumnRole
  readonly targetTerminal: AutoColumnTargetUnsupportedTerminal<Payload>
}

export type AutoColumnCoordinatorDecision<Payload = unknown> =
  | AutoColumnWaitingDecision
  | AutoColumnIgnoredDecision
  | AutoColumnDiscardEpochDecision
  | AutoColumnFinalizeCommonTierDecision<Payload>
  | AutoColumnPublishCommonTierDecision<Payload>
  | AutoColumnPublishPrivateDecision<Payload>
  | AutoColumnPublishFallbackDecision<Payload>
  | AutoColumnSynchronizeTargetDecision<Payload>
  | AutoColumnPublishSynchronizedCommonTierDecision<Payload>
  | AutoColumnPublishTargetUnsupportedDecision<Payload>

/**
 * Coordinator-owned state for one auto-column pair. It deliberately knows
 * neither scheduling nor presentation: callers supply terminal work tagged
 * with this coordinator's epoch and enact the resulting decision atomically.
 */
export class AutoColumnCoordinator<Payload = unknown> {
  #epoch = 1
  #privateTerminals: Partial<Record<AutoColumnRole, AutoColumnPrivateTerminal<Payload>>> = {}
  #commonTierTerminals: Partial<Record<AutoColumnRole, AutoColumnCommonTierTerminal<Payload>>> = {}
  #commonTier: number | null = null
  #authority: AutoColumnAuthority | null = null
  #discarded = false
  #resolved = false

  get epoch(): number {
    return this.#epoch
  }

  /** Either coordinated role invalidates the whole pair and opens a fresh barrier. */
  invalidate(_role: AutoColumnRole): number {
    this.#epoch += 1
    this.#privateTerminals = {}
    this.#commonTierTerminals = {}
    this.#commonTier = null
    this.#authority = null
    this.#discarded = false
    this.#resolved = false
    return this.#epoch
  }

  submitPrivate(
    submission: AutoColumnPrivateOutcome<Payload>,
  ): AutoColumnCoordinatorDecision<Payload> {
    const ignored = this.#ignoreIfIneligible(submission.epoch, submission.role, this.#privateTerminals)
    if (ignored)
      return ignored

    if (isDiscardedTerminal(submission.outcome))
      return this.#discard(submission.outcome.status)

    this.#privateTerminals[submission.role] = submission.outcome
    if (!hasBothRoles(this.#privateTerminals))
      return this.#waiting()

    const terminals = privatePair(this.#privateTerminals)
    if (hasUnsupportedTerminal(terminals))
      return this.#publishFallback(terminals)

    const managed = managedTerminals(terminals)
    if (managed.length < 2) {
      return this.#publishPrivate({
        kind: 'publish-private',
        epoch: this.#epoch,
        tier: managed[0]?.tier ?? 0,
        terminals,
      })
    }

    this.#commonTier = Math.min(...managed.map(result => result.tier))
    return {
      kind: 'finalize-common-tier',
      epoch: this.#epoch,
      tier: this.#commonTier,
      terminals,
    }
  }

  submitCommonTier(
    submission: AutoColumnCommonTierOutcome<Payload>,
  ): AutoColumnCoordinatorDecision<Payload> {
    if (submission.epoch !== this.#epoch)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'stale-epoch' }
    if (this.#discarded)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'discarded-epoch' }
    if (this.#resolved)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'resolved-epoch' }
    if (this.#commonTier === null)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'common-tier-not-selected' }
    if (isDiscardedTerminal(submission.outcome))
      return this.#discard(submission.outcome.status)

    if (submission.outcome.status === 'unsupported') {
      // A selected source can discover that its previously captured transient
      // common-tier anchor is unsupported only after authority selection. It
      // re-enters this established fallback seam; no authority is recalculated.
      if (
        this.#commonTierTerminals[submission.role]
        && (!this.#authority || this.#authority.source !== submission.role)
      ) {
        return { kind: 'ignored', epoch: this.#epoch, reason: 'duplicate-role' }
      }
      const terminals = privatePair(this.#privateTerminals)
      const fallbackTerminals = {
        ...terminals,
        [submission.role]: submission.outcome,
      } as AutoColumnPrivatePair<Payload>
      this.#commonTierTerminals = {}
      return this.#publishFallback(fallbackTerminals)
    }

    if (this.#commonTierTerminals[submission.role])
      return { kind: 'ignored', epoch: this.#epoch, reason: 'duplicate-role' }

    if (!submission.outcome.fits)
      return this.#discard('non-monotonic-non-fit')

    this.#commonTierTerminals[submission.role] = submission.outcome
    if (!hasBothRoles(this.#commonTierTerminals))
      return this.#waiting()

    const terminals = privatePair(this.#privateTerminals)
    const presentations = localPresentationPair(this.#commonTierTerminals)

    const authority = selectAutoColumnAuthority(terminals, presentations)
    if (!authority) {
      return this.#publishCommonTier({
        kind: 'publish-common-tier',
        epoch: this.#epoch,
        tier: this.#commonTier,
        terminals,
      })
    }

    if (!isEligibleSource(authority.sourcePresentation)) {
      return this.#publishCommonTier({
        kind: 'publish-common-tier',
        epoch: this.#epoch,
        tier: this.#commonTier,
        terminals,
        source: authority.source,
        target: authority.target,
      })
    }

    this.#authority = authority
    return {
      kind: 'synchronize-target',
      epoch: this.#epoch,
      tier: this.#commonTier,
      terminals,
      ...authority,
    }
  }

  submitTargetSynchronization(
    submission: AutoColumnTargetSynchronizationOutcome<Payload>,
  ): AutoColumnCoordinatorDecision<Payload> {
    if (submission.epoch !== this.#epoch)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'stale-epoch' }
    if (this.#discarded)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'discarded-epoch' }
    if (this.#resolved)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'resolved-epoch' }
    if (!this.#authority || this.#commonTier === null)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'target-synchronization-not-selected' }
    if (submission.role !== this.#authority.target)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'target-role-not-selected' }

    if (isDiscardedTerminal(submission.outcome))
      return this.#discard(submission.outcome.status)

    const decision = resolveTargetSynchronizationTerminal(
      this.#epoch,
      this.#commonTier,
      privatePair(this.#privateTerminals),
      this.#authority,
      submission.outcome,
    )

    if (decision.kind === 'publish-target-unsupported')
      return this.#publishTargetUnsupported(decision)
    return this.#publishSynchronizedCommonTier(decision)
  }

  #ignoreIfIneligible(
    epoch: number,
    role: AutoColumnRole,
    terminals: Partial<Record<AutoColumnRole, unknown>>,
  ): AutoColumnIgnoredDecision | null {
    if (epoch !== this.#epoch)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'stale-epoch' }
    if (this.#discarded)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'discarded-epoch' }
    if (this.#resolved)
      return { kind: 'ignored', epoch: this.#epoch, reason: 'resolved-epoch' }
    if (terminals[role])
      return { kind: 'ignored', epoch: this.#epoch, reason: 'duplicate-role' }
    return null
  }

  #waiting(): AutoColumnWaitingDecision {
    return { kind: 'waiting', epoch: this.#epoch }
  }

  #discard(reason: AutoColumnDiscardEpochDecision['reason']): AutoColumnDiscardEpochDecision {
    this.#privateTerminals = {}
    this.#commonTierTerminals = {}
    this.#commonTier = null
    this.#authority = null
    this.#discarded = true
    return { kind: 'discard-epoch', epoch: this.#epoch, reason }
  }

  #publishPrivate(
    decision: AutoColumnPublishPrivateDecision<Payload>,
  ): AutoColumnPublishPrivateDecision<Payload> {
    this.#resolved = true
    return decision
  }

  #publishFallback(
    terminals: AutoColumnPrivatePair<Payload>,
  ): AutoColumnPublishFallbackDecision<Payload> {
    this.#resolved = true
    return { kind: 'publish-fallback', epoch: this.#epoch, terminals }
  }

  #publishCommonTier(
    decision: AutoColumnPublishCommonTierDecision<Payload>,
  ): AutoColumnPublishCommonTierDecision<Payload> {
    this.#resolved = true
    return decision
  }

  #publishSynchronizedCommonTier(
    decision: AutoColumnPublishSynchronizedCommonTierDecision<Payload>,
  ): AutoColumnPublishSynchronizedCommonTierDecision<Payload> {
    this.#resolved = true
    return decision
  }

  #publishTargetUnsupported(
    decision: AutoColumnPublishTargetUnsupportedDecision<Payload>,
  ): AutoColumnPublishTargetUnsupportedDecision<Payload> {
    this.#resolved = true
    return decision
  }
}

export function createAutoColumnCoordinator<Payload = unknown>(): AutoColumnCoordinator<Payload> {
  return new AutoColumnCoordinator<Payload>()
}

function hasBothRoles<T>(terminals: Partial<Record<AutoColumnRole, T>>): terminals is Record<AutoColumnRole, T> {
  return terminals.left !== undefined && terminals.right !== undefined
}

function privatePair<Payload>(
  terminals: Partial<Record<AutoColumnRole, AutoColumnPrivateTerminal<Payload>>>,
): AutoColumnPrivatePair<Payload> {
  if (!hasBothRoles(terminals))
    throw new Error('auto-column private pair is incomplete')
  return terminals
}

function localPresentationPair<Payload>(
  terminals: Partial<Record<AutoColumnRole, AutoColumnCommonTierTerminal<Payload>>>,
): Readonly<Record<AutoColumnRole, AutoColumnLocalPresentationMetadata>> {
  if (!hasBothRoles(terminals))
    return null
  const left = terminals.left
  const right = terminals.right
  if (left.status !== 'measured' || right.status !== 'measured')
    throw new Error('auto-column common tier requires two measured terminals')
  return { left: left.presentation, right: right.presentation }
}

/**
 * Selects authority only from completed private tiers and verified local
 * presentation metadata. It intentionally makes no tolerance comparison.
 */
function selectAutoColumnAuthority<Payload>(
  terminals: AutoColumnPrivatePair<Payload>,
  presentations: Readonly<Record<AutoColumnRole, AutoColumnLocalPresentationMetadata>>,
): AutoColumnAuthority | null {
  const left = terminals.left
  const right = terminals.right
  if (left.status !== 'managed' || right.status !== 'managed')
    throw new Error('auto-column common tier requires two managed terminals')

  if (left.tier !== right.tier) {
    return authorityForRole(
      left.tier < right.tier ? 'left' : 'right',
      presentations,
    )
  }

  const leftHasBoundary = hasVerifiedBoundary(presentations.left)
  const rightHasBoundary = hasVerifiedBoundary(presentations.right)
  if (leftHasBoundary !== rightHasBoundary)
    return authorityForRole(leftHasBoundary ? 'left' : 'right', presentations)
  if (!leftHasBoundary)
    return null

  const leftValue = fullGapComparisonValue(presentations.left)
  const rightValue = fullGapComparisonValue(presentations.right)
  return authorityForRole(leftValue <= rightValue ? 'left' : 'right', presentations)
}

function authorityForRole(
  source: AutoColumnRole,
  presentations: Readonly<Record<AutoColumnRole, AutoColumnLocalPresentationMetadata>>,
): AutoColumnAuthority {
  const target = source === 'left' ? 'right' : 'left'
  return {
    source,
    target,
    sourcePresentation: presentations[source],
    targetPresentation: presentations[target],
  }
}

function hasVerifiedBoundary(presentation: AutoColumnLocalPresentationMetadata): boolean {
  return verifiedGapTarget(presentation.verifiedGapTargets.full) !== null
    || verifiedGapTarget(presentation.verifiedGapTargets.half) !== null
}

function fullGapComparisonValue(presentation: AutoColumnLocalPresentationMetadata): number {
  const full = verifiedGapTarget(presentation.verifiedGapTargets.full)
  if (full !== null)
    return full
  const half = verifiedGapTarget(presentation.verifiedGapTargets.half)
  if (half === null)
    throw new Error('auto-column boundary-bearing presentation is missing verified targets')
  return 2 * half
}

function verifiedGapTarget(value: number | null): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function isEligibleSource(presentation: AutoColumnLocalPresentationMetadata): boolean {
  return presentation.requestedAlignment === 'distributed'
    && presentation.effectiveAlignment === 'distributed'
    && hasVerifiedBoundary(presentation)
}

/** Resolves the terminal target decision without mutating coordinator state. */
function resolveTargetSynchronizationTerminal<Payload>(
  epoch: number,
  tier: number,
  terminals: AutoColumnPrivatePair<Payload>,
  authority: AutoColumnAuthority,
  targetTerminal:
    | AutoColumnSynchronizedFitTerminal<Payload>
    | AutoColumnSynchronizedOverflowTerminal<Payload>
    | AutoColumnTargetUnsupportedTerminal<Payload>,
): AutoColumnPublishSynchronizedCommonTierDecision<Payload>
  | AutoColumnPublishTargetUnsupportedDecision<Payload> {
  if (targetTerminal.status === 'unsupported') {
    return {
      kind: 'publish-target-unsupported',
      epoch,
      tier,
      terminals,
      source: authority.source,
      target: authority.target,
      targetTerminal,
    }
  }

  return {
    kind: 'publish-synchronized-common-tier',
    epoch,
    tier,
    terminals,
    source: authority.source,
    target: authority.target,
    targetTerminal,
  }
}

function isDiscardedTerminal(
  terminal:
    | AutoColumnPrivateTerminal
    | AutoColumnCommonTierTerminal
    | AutoColumnTargetSynchronizationTerminal,
): terminal is AutoColumnDiscardedTerminal {
  return terminal.status === 'deferred'
    || terminal.status === 'stale'
    || terminal.status === 'cancelled'
    || terminal.status === 'superseded'
    || terminal.status === 'unmounted'
}

function hasUnsupportedTerminal<Payload>(terminals: AutoColumnPrivatePair<Payload>): boolean {
  return terminals.left.status === 'unsupported' || terminals.right.status === 'unsupported'
}

function managedTerminals<Payload>(
  terminals: AutoColumnPrivatePair<Payload>,
): AutoColumnManagedTerminal<Payload>[] {
  return [terminals.left, terminals.right].filter(
    (terminal): terminal is AutoColumnManagedTerminal<Payload> => terminal.status === 'managed',
  )
}
