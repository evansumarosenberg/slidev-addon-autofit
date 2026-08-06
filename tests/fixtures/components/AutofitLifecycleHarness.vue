<script setup lang="ts">
import { ref } from 'vue'

const largeTiers = ref(0)
const sharedHeight = ref(120)
const showUnmountTarget = ref(true)

function expandTierRange(): void {
  largeTiers.value = 4
}

function shrinkSharedInstance(): void {
  sharedHeight.value = 80
}

function unmountTarget(): void {
  showUnmountTarget.value = false
}

</script>

<template>
  <div data-testid="lifecycle-harness">
    <button data-testid="expand-tier-range" @click="expandTierRange">
      Expand tier range
    </button>
    <button data-testid="shrink-shared-instance" @click="shrinkSharedInstance">
      Shrink shared instance
    </button>
    <button data-testid="unmount-target" @click="unmountTarget">
      Unmount target
    </button>

    <div style="display: flex; gap: 16px; align-items: flex-start">
      <AutoFit
        data-testid="shared-batch-a"
        :style="{ width: '180px', height: `${sharedHeight}px` }"
        :large-tiers="0"
        :small-tiers="4"
        alignment="top"
      >
        <p style="font-size: 100px; line-height: 100px; white-space: nowrap">
          I
        </p>
      </AutoFit>

      <AutoFit
        data-testid="shared-batch-b"
        style="width: 180px; height: 120px"
        :large-tiers="0"
        :small-tiers="4"
        alignment="top"
      >
        <p style="font-size: 100px; line-height: 100px; white-space: nowrap">
          I
        </p>
      </AutoFit>

      <AutoFit
        data-testid="prop-reactive"
        style="width: 180px; height: 150px"
        :large-tiers="largeTiers"
        :small-tiers="4"
        alignment="top"
      >
        <p
          data-testid="prop-reactive-copy"
          style="font-size: 100px; line-height: 100px; white-space: nowrap"
        >
          I
        </p>
      </AutoFit>

      <AutoFit
        v-if="showUnmountTarget"
        data-testid="unmount-reactive"
        style="width: 180px; height: 120px"
        alignment="top"
      >
        <p
          data-testid="unmount-reactive-copy"
          style="font-size: 100px; line-height: 100px; white-space: nowrap"
        >
          I
        </p>
      </AutoFit>

      <AutoFit
        data-testid="deferred-reactive"
        style="width: 180px; height: 80px"
        :large-tiers="0"
        :small-tiers="4"
        alignment="top"
      >
        <p
          data-testid="deferred-reactive-copy"
          style="font-size: 100px; line-height: 100px; white-space: nowrap"
        >
          I
        </p>
        <img
          data-testid="deferred-reactive-image"
          src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E"
          style="width: 1px; height: 1px"
        />
      </AutoFit>
    </div>
  </div>
</template>
