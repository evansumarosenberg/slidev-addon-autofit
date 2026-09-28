<script setup lang="ts">
import { computed, onBeforeUnmount, provide, ref } from 'vue'
import {
  createAutoColumnCoordinator,
  type AutoColumnCoordinatorDecision,
  type AutoColumnRole,
} from '../../utils/autofit/auto-column-coordinator'
import {
  autoColumnContextKey,
  type AutoColumnContext,
  type AutoColumnParticipant,
} from '../../utils/autofit/auto-column-context'
import AutoFit from '../AutoFit.vue'

const props = defineProps<{
  rawConfig?: unknown
}>()

const rawConfig = computed(() => props.rawConfig)
const coordinator = createAutoColumnCoordinator()
const participants = new Map<AutoColumnRole, AutoColumnParticipant>()
const pairHost = ref<HTMLElement | null>(null)
let disposed = false

interface AutoColumnTestHooks {
  holdAutoColumnBarrier?(
    barrier: 'target-synchronization',
    role: AutoColumnRole,
    epoch: number,
    callback: () => void,
  ): void
  afterAutoColumnBarrierDispatch?(
    barrier: 'target-synchronization',
    role: AutoColumnRole,
    epoch: number,
  ): void
}

function autoColumnTestHooks(): AutoColumnTestHooks | undefined {
  if (!(import.meta.env.DEV || import.meta.env.MODE === 'test'))
    return undefined

  return (window as Window & {
    readonly __slidevAutofitTestHooks?: AutoColumnTestHooks
  }).__slidevAutofitTestHooks
}

function beginEpoch(role: AutoColumnRole): number {
  const epoch = coordinator.invalidate(role)
  for (const participant of participants.values())
    participant.beginEpoch(epoch)
  return epoch
}

function enact(decision: AutoColumnCoordinatorDecision): void {
  if (decision.kind === 'finalize-common-tier') {
    for (const role of ['left', 'right'] as const)
      participants.get(role)?.prepareCommonTier(decision.epoch, decision.tier)
    return
  }

  if (decision.kind === 'publish-common-tier') {
    for (const role of ['left', 'right'] as const)
      participants.get(role)?.publishCommonTier(decision.epoch)
    return
  }

  if (decision.kind === 'synchronize-target') {
    const sourceParticipant = participants.get(decision.source)
    if (!sourceParticipant)
      throw new Error('eligible auto-column source is missing its verified gap plan')
    const targetParticipant = participants.get(decision.target)
    if (!targetParticipant)
      return
    const synchronize = (): void => {
      const current = (): boolean => !(
        disposed
        || coordinator.epoch !== decision.epoch
        || participants.get(decision.source) !== sourceParticipant
        || participants.get(decision.target) !== targetParticipant
      )
      if (!current()) {
        return
      }
      const plan = sourceParticipant.coordinatedGapPlan(decision.epoch)
      if (!current())
        return
      if (!plan) {
        beginEpoch(decision.source)
        return
      }
      const candidate = sourceParticipant.startingAnchorCandidate(decision.epoch)
      if (!current())
        return
      if (!candidate || candidate.status === 'deferred') {
        beginEpoch(decision.source)
        return
      }
      if (candidate.status === 'unsupported') {
        if (decision.spacingFallback) {
          enact(coordinator.submitTargetSynchronization({
            role: decision.target,
            epoch: decision.epoch,
            outcome: { status: 'unsupported' },
          }))
          return
        }
        // Retain the source's fallback privately, then let the coordinator
        // publish the pair through its existing common-tier fallback path.
        sourceParticipant.prepareStartingAnchorUnsupported(decision.epoch)
        enact(coordinator.submitCommonTier({
          role: decision.source,
          epoch: decision.epoch,
          outcome: { status: 'unsupported' },
        }))
        return
      }
      const currentSource = sourceParticipant.currentStartingAnchor(
        decision.epoch,
        candidate,
      )
      if (!current())
        return
      if (currentSource.status !== 'measured') {
        beginEpoch(decision.source)
        return
      }
      autoColumnTestHooks()?.afterAutoColumnBarrierDispatch?.(
        'target-synchronization',
        decision.target,
        decision.epoch,
      )
      if (!current())
        return
      targetParticipant.synchronizeTarget(decision.epoch, plan, {
        candidate,
        current: currentSource.coordinate,
      })
    }
    const hooks = autoColumnTestHooks()
    if (hooks?.holdAutoColumnBarrier) {
      hooks.holdAutoColumnBarrier(
        'target-synchronization',
        decision.target,
        decision.epoch,
        synchronize,
      )
      return
    }
    synchronize()
    return
  }

  if (decision.kind === 'publish-synchronized-common-tier') {
    participants.get(decision.source)?.publishCommonTier(decision.epoch)
    participants.get(decision.target)?.publishSynchronizedTarget(decision.epoch)
    return
  }

  if (decision.kind === 'publish-target-unsupported') {
    participants.get(decision.source)?.publishCommonTier(decision.epoch)
    participants.get(decision.target)?.publishSynchronizedUnsupported(decision.epoch)
    return
  }

  if (decision.kind === 'publish-private' || decision.kind === 'publish-fallback') {
    for (const role of ['left', 'right'] as const)
      participants.get(role)?.publishPrivate(decision.epoch)
  }

  if (decision.kind === 'discard-epoch') {
    for (const participant of participants.values())
      participant.discardEpoch(decision.epoch)
  }
}

const context: AutoColumnContext = {
  rawConfig,
  currentEpoch(): number {
    return coordinator.epoch
  },
  pairHost(): HTMLElement | null {
    return pairHost.value
  },
  register(role, participant): number {
    participants.set(role, participant)
    return coordinator.epoch
  },
  unregister(role, participant): void {
    if (participants.get(role) !== participant)
      return
    participants.delete(role)
    if (!disposed)
      beginEpoch(role)
  },
  invalidate(role): number {
    return beginEpoch(role)
  },
  hideForTopology(epoch): void {
    if (epoch !== coordinator.epoch)
      return
    for (const participant of participants.values())
      participant.hideForTopology(epoch)
  },
  submitPrivate(outcome): void {
    enact(coordinator.submitPrivate(outcome))
  },
  submitCommonTier(outcome): void {
    enact(coordinator.submitCommonTier(outcome))
  },
  submitTargetSynchronization(outcome): void {
    enact(coordinator.submitTargetSynchronization(outcome))
  },
}

provide(autoColumnContextKey, context)

onBeforeUnmount(() => {
  disposed = true
  for (const participant of participants.values())
    participant.discardEpoch(coordinator.epoch)
  participants.clear()
})
</script>

<template>
  <div ref="pairHost" class="autofit-coordination-pair">
    <AutoFit data-autofit-role="left">
      <slot name="left" />
    </AutoFit>
    <AutoFit data-autofit-role="right">
      <slot name="right" />
    </AutoFit>
  </div>
</template>
