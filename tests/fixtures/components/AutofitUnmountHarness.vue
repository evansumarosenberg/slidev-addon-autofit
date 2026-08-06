<script setup lang="ts">
import { ref } from 'vue'

const showTarget = ref(true)
const largeTiers = ref(0)

function unmountTarget(): void {
  showTarget.value = false
}

function invalidateTarget(): void {
  largeTiers.value = -1
}
</script>

<template>
  <div data-testid="unmount-harness">
    <button data-testid="unmount-isolated-target" @click="unmountTarget">
      Unmount isolated target
    </button>
    <button data-testid="invalidate-isolated-target" @click="invalidateTarget">
      Invalidate isolated target
    </button>

    <AutoFit
      v-if="showTarget"
      data-testid="unmount-isolated"
      style="width: 180px; height: 120px"
      :large-tiers="largeTiers"
      alignment="top"
    >
      <p
        data-testid="unmount-isolated-copy"
        style="font-size: 100px; line-height: 100px; white-space: nowrap"
      >
        I
      </p>
      <img
        data-testid="unmount-isolated-image"
        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1' height='1'%3E%3C/svg%3E"
        style="width: 1px; height: 1px"
      />
    </AutoFit>
  </div>
</template>
