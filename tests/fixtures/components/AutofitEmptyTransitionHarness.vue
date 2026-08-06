<script setup lang="ts">
import { ref } from 'vue'

const showContent = ref(false)

function addContent(): void {
  showContent.value = true
}
</script>

<template>
  <div data-testid="empty-transition-harness">
    <button data-testid="add-empty-transition-content" @click="addContent">
      Add content
    </button>

    <AutoFit
      data-testid="empty-transition"
      style="width: 180px; height: 80px"
      :large-tiers="0"
      :small-tiers="4"
      alignment="top"
    >
      <p
        v-if="showContent"
        data-testid="empty-transition-copy"
        style="font-size: 100px; line-height: 100px; white-space: nowrap"
      >
        I
      </p>
    </AutoFit>
  </div>
</template>
