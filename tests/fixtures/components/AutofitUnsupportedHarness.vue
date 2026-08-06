<script setup lang="ts">
import { ref } from 'vue'

const mode = ref('valid')
const forcedReason = ref<string | null>(null)
const invalidationTick = ref(0)

function setMode(next: string): void {
  forcedReason.value = null
  mode.value = next
}

function forceBaseGapVerification(): void {
  forcedReason.value = 'base-gap-verification'
  invalidationTick.value += 1
}

function clearForcedReason(): void {
  forcedReason.value = null
  invalidationTick.value += 1
}
</script>

<template>
  <div data-testid="unsupported-harness">
    <button
      v-for="reason in [
        'valid',
        'root-text',
        'display-contents-root',
        'list-item-missing-leading-content',
        'list-item-noncontiguous-content',
        'visual-rect-missing',
        'visual-target-nonfinite',
        'visual-edge-nonfinite',
        'carrier-adjustment-nonfinite',
        'base-gap-verification',
      ]"
      :key="reason"
      :data-testid="`unsupported-mode-${reason}`"
      @click="setMode(reason)"
    >
      {{ reason }}
    </button>
    <button
      data-testid="unsupported-force-base"
      @click="forceBaseGapVerification"
    >
      Force base verification
    </button>
    <button data-testid="unsupported-clear-force" @click="clearForcedReason">
      Clear forced reason
    </button>

    <AutoFit
      data-testid="unsupported-autofit"
      style="width: 360px; height: 220px; --slidev-autofit-base-spacing: 16px"
      :large-tiers="2"
      :small-tiers="2"
      alignment="middle"
      :data-autofit-test-force-unsupported="forcedReason ?? ([
        'visual-target-nonfinite',
        'visual-edge-nonfinite',
        'carrier-adjustment-nonfinite',
        'base-gap-verification',
      ].includes(mode) ? mode : undefined)"
    >
      <template v-if="mode === 'root-text'">unsupported root text</template>
      <div v-else-if="mode === 'display-contents-root'" style="display: contents">
        Display contents root
      </div>
      <ul v-else-if="mode === 'list-item-missing-leading-content'">
        <li>
          <ul><li>Nested without leading content</li></ul>
        </li>
      </ul>
      <ul v-else-if="mode === 'list-item-noncontiguous-content'">
        <li>
          Leading content
          <ul><li>Nested content</li></ul>
          resumed content
        </li>
      </ul>
      <p v-else-if="mode === 'visual-rect-missing'" style="display: none">
        No rendered visual rectangle
      </p>
      <template v-else>
        <p data-testid="unsupported-valid-first">
          Valid first unit {{ invalidationTick }}
        </p>
        <p data-testid="unsupported-valid-second">Valid second unit</p>
      </template>
    </AutoFit>
  </div>
</template>
