<script setup lang="ts">
import { ref, useSlots } from 'vue'
import LayoutAutoFitBridge from '../components/autofit/LayoutAutoFitBridge.vue'
import { useLayoutOverflow } from '../utils/autofit/useLayoutOverflow'

defineProps<{
  autofit?: unknown
}>()

const slots = useSlots()
const hasAuto = Boolean(slots.auto)
const hasFooter = Boolean(slots.footer)
const layout = ref<HTMLElement | null>(null)
const main = ref<HTMLElement | null>(null)
const footer = ref<HTMLElement | null>(null)
const { overflowing } = useLayoutOverflow({ layout, main, footer })
</script>

<template>
  <div
    ref="layout"
    class="slidev-layout auto-default auto-default-layout"
    :class="{ 'auto-default-layout--overflow': overflowing }"
    :data-layout-overflow="overflowing ? 'true' : undefined"
  >
    <div ref="main" class="auto-default-layout__main">
      <slot />
    </div>

    <LayoutAutoFitBridge v-if="hasAuto" :raw-config="autofit">
      <slot name="auto" />
    </LayoutAutoFitBridge>

    <div v-if="hasFooter" ref="footer" class="auto-default-layout__footer">
      <slot name="footer" />
    </div>

    <div
      v-if="overflowing"
      class="auto-default-layout__diagnostics"
      aria-hidden="true"
    >
      <span class="auto-default-layout__overflow-badge">LAYOUT OVERFLOW</span>
    </div>
  </div>
</template>
