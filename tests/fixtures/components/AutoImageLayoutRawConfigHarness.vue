<script setup lang="ts">
import { computed, ref } from 'vue'
import AutoImageLayout from '../../../layouts/auto-image.vue'

type Position = 'left' | 'right' | 'top' | 'bottom'
type Configuration = 'omitted' | 'default' | 'partial' | 'custom' | 'invalid'

interface RawConfigCase {
  readonly id: `${Position}-${Configuration}`
  readonly position: Position
  readonly configuration: Configuration
  readonly autofit: unknown
}

const cases: readonly RawConfigCase[] = [
  { id: 'left-omitted', position: 'left', configuration: 'omitted', autofit: undefined },
  { id: 'right-default', position: 'right', configuration: 'default', autofit: {} },
  { id: 'top-partial', position: 'top', configuration: 'partial', autofit: { alignment: 'bottom' } },
  { id: 'bottom-custom', position: 'bottom', configuration: 'custom', autofit: { largeTiers: 0, smallTiers: 0, tierIncrement: 10, alignment: 'center' } },
  { id: 'left-invalid', position: 'left', configuration: 'invalid', autofit: { largeTiers: 1, smallTiers: -1, tierIncrement: 10, alignment: 'top' } },
  { id: 'right-omitted', position: 'right', configuration: 'omitted', autofit: undefined },
  { id: 'top-default', position: 'top', configuration: 'default', autofit: {} },
  { id: 'bottom-partial', position: 'bottom', configuration: 'partial', autofit: { alignment: 'bottom' } },
  { id: 'left-custom', position: 'left', configuration: 'custom', autofit: { largeTiers: 0, smallTiers: 0, tierIncrement: 10, alignment: 'center' } },
  { id: 'right-invalid', position: 'right', configuration: 'invalid', autofit: { largeTiers: 2, smallTiers: -1, tierIncrement: 10, alignment: 'top' } },
  { id: 'top-omitted', position: 'top', configuration: 'omitted', autofit: undefined },
  { id: 'bottom-default', position: 'bottom', configuration: 'default', autofit: {} },
  { id: 'left-partial', position: 'left', configuration: 'partial', autofit: { alignment: 'bottom' } },
  { id: 'right-custom', position: 'right', configuration: 'custom', autofit: { largeTiers: 0, smallTiers: 0, tierIncrement: 10, alignment: 'center' } },
  { id: 'top-invalid', position: 'top', configuration: 'invalid', autofit: { largeTiers: 3, smallTiers: -1, tierIncrement: 10, alignment: 'top' } },
  { id: 'bottom-omitted', position: 'bottom', configuration: 'omitted', autofit: undefined },
  { id: 'left-default', position: 'left', configuration: 'default', autofit: {} },
  { id: 'right-partial', position: 'right', configuration: 'partial', autofit: { alignment: 'bottom' } },
  { id: 'top-custom', position: 'top', configuration: 'custom', autofit: { largeTiers: 0, smallTiers: 0, tierIncrement: 10, alignment: 'center' } },
  { id: 'bottom-invalid', position: 'bottom', configuration: 'invalid', autofit: { largeTiers: 5, smallTiers: -1, tierIncrement: 10, alignment: 'top' } },
]

const imageSource = '/images/autofit_placeholder.jpg'
const selectedCase = ref<number | null>(null)
const activeCase = computed(() => (
  selectedCase.value === null ? null : cases[selectedCase.value]!
))
</script>

<template>
  <div data-testid="auto-image-layout-raw-config-harness">
    <div aria-label="AutoImage raw configuration cases">
      <button
        v-for="(testCase, index) in cases"
        :key="testCase.id"
        :data-testid="`auto-image-layout-raw-config-case-${testCase.id}`"
        type="button"
        @click="selectedCase = index"
      >
        {{ testCase.id }}
      </button>
    </div>

    <AutoImageLayout
      v-if="activeCase"
      :key="activeCase.id"
      :image="{ position: activeCase.position, size: '25%' }"
      :autofit="activeCase.autofit"
      style="width: 960px; height: 540px"
    >
      <div
        data-testid="auto-image-layout-raw-config-case-marker"
        :data-auto-image-layout-raw-config-case="activeCase.id"
      >
        Raw configuration case
      </div>

      <template #image>
        <img :src="imageSource" alt="Raw configuration image">
      </template>

      <template #auto>
        <p>Substantive AutoFit content for the active raw configuration.</p>
      </template>
    </AutoImageLayout>
  </div>
</template>
