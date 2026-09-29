<script setup lang="ts">
import { computed, ref } from 'vue'
import AutoImageLayout from '../../../layouts/auto-image.vue'

const landscapeSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Crect width='400' height='200' fill='%237a0019'/%3E%3C/svg%3E"
const position = ref<'left' | 'right' | 'top' | 'bottom'>('left')
const size = ref<'0%' | '35%' | '96%' | '97%' | '100%'>('35%')
const showAuto = ref(true)
const showFooter = ref(false)
const invalid = ref(false)
const imageMode = ref<'fit' | 'unsupported' | 'pending'>('fit')
const pendingVersion = ref(0)
const imageSource = computed(() => imageMode.value === 'pending'
  ? `/auto-image-layout-pending.svg?version=${pendingVersion.value}`
  : landscapeSource)
const imageConfig = computed(() => invalid.value
  ? { position: position.value, size: 'not-a-percentage' }
  : { position: position.value, size: size.value })

function setPendingImage(): void {
  pendingVersion.value += 1
  imageMode.value = 'pending'
}
</script>

<template>
  <div data-testid="auto-image-layout-lifecycle-harness">
    <div class="auto-image-layout-lifecycle-harness__controls">
      <button data-testid="auto-image-layout-set-right" @click="position = 'right'">
        Right
      </button>
      <button data-testid="auto-image-layout-set-left" @click="position = 'left'">
        Left
      </button>
      <button data-testid="auto-image-layout-set-top" @click="position = 'top'">
        Top
      </button>
      <button data-testid="auto-image-layout-set-bottom" @click="position = 'bottom'">
        Bottom
      </button>
      <button data-testid="auto-image-layout-set-zero" @click="size = '0%'">
        Zero
      </button>
      <button data-testid="auto-image-layout-set-full" @click="size = '100%'">
        Full
      </button>
      <button data-testid="auto-image-layout-set-split" @click="size = '35%'">
        Split
      </button>
      <button data-testid="auto-image-layout-set-inline-boundary" @click="size = '95%'">
        Inline boundary
      </button>
      <button data-testid="auto-image-layout-set-block-boundary" @click="size = '92%'">
        Block boundary
      </button>
      <button data-testid="auto-image-layout-set-unsupported-image" @click="imageMode = 'unsupported'">
        Unsupported image
      </button>
      <button data-testid="auto-image-layout-set-pending-image" @click="setPendingImage()">
        Pending image
      </button>
      <button data-testid="auto-image-layout-toggle-auto" @click="showAuto = !showAuto">
        Toggle auto
      </button>
      <button data-testid="auto-image-layout-toggle-footer" @click="showFooter = !showFooter">
        Toggle footer
      </button>
      <button data-testid="auto-image-layout-set-invalid" @click="invalid = true">
        Invalid
      </button>
      <button data-testid="auto-image-layout-set-valid" @click="invalid = false">
        Valid
      </button>
    </div>

    <AutoImageLayout
      :image="imageConfig"
      style="width: 960px; height: 540px"
    >
      <div data-testid="auto-image-layout-lifecycle-content">Same-instance layout content</div>

      <template #image>
        <img
          v-if="imageMode !== 'unsupported'"
          :src="imageSource"
          alt="Same-instance lifecycle image"
        >
        <p v-else data-testid="auto-image-layout-lifecycle-authored-fallback">
          Authored unsupported image fallback
        </p>
      </template>

      <template #auto v-if="showAuto">
        <p data-testid="auto-image-layout-lifecycle-auto">Same-instance auto content</p>
      </template>

      <template #footer v-if="showFooter">
        <div style="height: 1000px">Same-instance footer overflow</div>
      </template>
    </AutoImageLayout>
  </div>
</template>
