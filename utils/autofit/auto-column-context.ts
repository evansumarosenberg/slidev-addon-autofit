import type { InjectionKey, Ref } from 'vue'
import type {
  AutoColumnCommonTierOutcome,
  AutoColumnPrivateOutcome,
  AutoColumnRole,
  AutoColumnTargetSynchronizationOutcome,
} from './auto-column-coordinator'
import type { AutofitCoordinatedGapPlan } from './static-fit'
import type {
  AutofitRenderedCoordinateSpace,
  AutofitSourceAnchorSnapshot,
} from './starting-alignment'
import type { AutofitUnsupportedReason } from './types'

/**
 * DOM-free candidate data retained by its owning participant between local
 * common-tier preparation and the bridge's selected-source read.
 */
export type AutoColumnStartingAnchorCandidate =
  | {
      readonly status: 'measured'
      readonly epoch: number
      readonly generation: number
      readonly snapshot: AutofitSourceAnchorSnapshot
    }
  | {
      readonly status: 'deferred'
      readonly epoch: number
      readonly generation: number
    }
  | {
      readonly status: 'unsupported'
      readonly epoch: number
      readonly generation: number
      readonly reason: AutofitUnsupportedReason
    }

export type AutoColumnCurrentSourceCoordinate =
  | {
      readonly status: 'measured'
      readonly coordinate: AutofitRenderedCoordinateSpace
    }
  | {
      readonly status: 'deferred'
    }

export interface AutoColumnStartingAlignmentSource {
  readonly candidate: Extract<
    AutoColumnStartingAnchorCandidate,
    { readonly status: 'measured' }
  >
  readonly current: AutofitRenderedCoordinateSpace
}

export interface AutoColumnParticipant {
  beginEpoch(epoch: number): void
  discardEpoch(epoch: number): void
  hideForTopology(epoch: number): void
  prepareCommonTier(epoch: number, tier: number): void
  publishPrivate(epoch: number): void
  publishCommonTier(epoch: number): void
  coordinatedGapPlan(epoch: number): AutofitCoordinatedGapPlan | null
  startingAnchorCandidate(epoch: number): AutoColumnStartingAnchorCandidate | null
  currentStartingAnchor(
    epoch: number,
    candidate: Extract<AutoColumnStartingAnchorCandidate, { readonly status: 'measured' }>,
  ): AutoColumnCurrentSourceCoordinate
  prepareStartingAnchorUnsupported(epoch: number): void
  synchronizeTarget(
    epoch: number,
    plan: AutofitCoordinatedGapPlan,
    source: AutoColumnStartingAlignmentSource,
  ): void
  publishSynchronizedTarget(epoch: number): void
  publishSynchronizedUnsupported(epoch: number): void
}

export interface AutoColumnContext {
  readonly rawConfig: Readonly<Ref<unknown>>
  currentEpoch(): number
  /** Stable bridge-owned host for pair-relative rendered-coordinate reads. */
  pairHost(): HTMLElement | null
  register(role: AutoColumnRole, participant: AutoColumnParticipant): number
  unregister(role: AutoColumnRole, participant: AutoColumnParticipant): void
  invalidate(role: AutoColumnRole): number
  hideForTopology(epoch: number): void
  submitPrivate(outcome: AutoColumnPrivateOutcome): void
  submitCommonTier(outcome: AutoColumnCommonTierOutcome): void
  submitTargetSynchronization(outcome: AutoColumnTargetSynchronizationOutcome): void
}

export const autoColumnContextKey: InjectionKey<AutoColumnContext>
  = Symbol('auto-column-context')
