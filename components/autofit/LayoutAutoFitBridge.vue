<script setup lang="ts">
import { computed, provide } from 'vue'
import AutoFit from '../AutoFit.vue'
import { layoutAutofitConfigKey } from '../../utils/autofit/layout-config'

const props = defineProps<{
  rawConfig?: unknown
}>()

const rawConfig = computed(() => props.rawConfig)
let claimed = false

provide(layoutAutofitConfigKey, {
  claim() {
    if (claimed)
      return null

    claimed = true
    return rawConfig
  },
})
</script>

<template>
  <AutoFit>
    <slot />
  </AutoFit>
</template>
