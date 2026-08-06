<script setup lang="ts">
import { ref, useSlots } from 'vue'
import AutoColumnAutoFitBridge from '../components/autofit/AutoColumnAutoFitBridge.vue'
import { useLayoutOverflow } from '../utils/autofit/useLayoutOverflow'

defineProps<{
  autofit?: unknown
}>()

const slots = useSlots()
const hasFooter = Boolean(slots.footer)
const layout = ref<HTMLElement | null>(null)
const main = ref<HTMLElement | null>(null)
const footer = ref<HTMLElement | null>(null)
const { overflowing } = useLayoutOverflow({ layout, main, footer })
</script>

<template>
  <div
    ref="layout"
    class="slidev-layout auto-column auto-column-layout"
    :class="{ 'auto-column-layout--overflow': overflowing }"
    :data-layout-overflow="overflowing ? 'true' : undefined"
  >
    <div ref="main" class="auto-column-layout__main">
      <slot />
    </div>

    <AutoColumnAutoFitBridge :raw-config="autofit">
      <template #left>
        <slot name="left" />
      </template>
      <template #right>
        <slot name="right" />
      </template>
    </AutoColumnAutoFitBridge>

    <div v-if="hasFooter" ref="footer" class="auto-column-layout__footer">
      <slot name="footer" />
    </div>

    <div
      v-if="overflowing"
      class="auto-column-layout__diagnostics"
      aria-hidden="true"
    >
      <span class="auto-column-layout__overflow-badge">LAYOUT OVERFLOW</span>
    </div>
  </div>
</template>
