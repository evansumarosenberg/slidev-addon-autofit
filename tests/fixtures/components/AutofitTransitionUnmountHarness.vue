<script setup lang="ts">
import { ref } from 'vue'

const showFit = ref(true)
const showOverflow = ref(true)
const showUnsupported = ref(true)
const showEmpty = ref(true)
const showPending = ref(true)
const showImageFit = ref(true)
const showImageOverflow = ref(true)
const showImageUnsupported = ref(true)
const unsupported = ref(false)
const pendingContent = ref(false)

const imageSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Crect width='400' height='200' fill='%237a0019'/%3E%3C/svg%3E"
const unavailableImageSource = '/auto-image-transition-error.svg'

function remove(target: 'fit' | 'overflow' | 'unsupported' | 'empty' | 'pending'): void {
  if (target === 'fit')
    showFit.value = false
  else if (target === 'overflow')
    showOverflow.value = false
  else if (target === 'unsupported')
    showUnsupported.value = false
  else if (target === 'empty')
    showEmpty.value = false
  else
    showPending.value = false
}

function removeImage(target: 'fit' | 'overflow' | 'unsupported'): void {
  if (target === 'fit')
    showImageFit.value = false
  else if (target === 'overflow')
    showImageOverflow.value = false
  else
    showImageUnsupported.value = false
}
</script>

<template>
  <div data-testid="autofit-transition-unmount-harness">
    <button data-testid="autofit-transition-force-unsupported" @click="unsupported = true">
      Publish unsupported
    </button>
    <button data-testid="autofit-transition-start-pending" @click="pendingContent = true">
      Start pending
    </button>
    <button
      v-for="target in ['fit', 'overflow', 'unsupported', 'empty', 'pending'] as const"
      :key="target"
      :data-testid="`autofit-transition-remove-${target}`"
      @click="remove(target)"
    >
      Remove {{ target }}
    </button>

    <div style="display: grid; grid-template-columns: repeat(2, 200px); gap: 16px">
      <Transition name="autofit-retained">
        <AutoFit
          v-if="showFit"
          data-testid="autofit-transition-fit"
          style="width: 180px; height: 120px"
          :large-tiers="0"
          :small-tiers="4"
          alignment="top"
        >
          <p data-testid="autofit-transition-fit-copy" style="font-size: 100px; line-height: 100px; white-space: nowrap">
            I
          </p>
        </AutoFit>
      </Transition>

      <Transition name="autofit-retained">
        <AutoFit
          v-if="showOverflow"
          data-testid="autofit-transition-overflow"
          style="width: 180px; height: 40px"
          :large-tiers="0"
          :small-tiers="0"
          alignment="bottom"
        >
          <p data-testid="autofit-transition-overflow-copy" style="font-size: 100px; line-height: 100px; white-space: nowrap">
            I
          </p>
        </AutoFit>
      </Transition>

      <Transition name="autofit-retained">
        <AutoFit
          v-if="showUnsupported"
          data-testid="autofit-transition-unsupported"
          style="width: 180px; height: 260px"
          :large-tiers="0"
          :small-tiers="4"
          alignment="distributed"
          :data-autofit-test-force-unsupported="unsupported ? 'true' : undefined"
        >
          <p data-testid="autofit-transition-unsupported-copy" style="font-size: 100px; line-height: 100px; white-space: nowrap">
            I
          </p>
          <p style="font-size: 100px; line-height: 100px; white-space: nowrap">
            I
          </p>
        </AutoFit>
      </Transition>

      <Transition name="autofit-retained">
        <AutoFit
          v-if="showEmpty"
          data-testid="autofit-transition-empty"
          style="width: 180px; height: 120px"
          alignment="top"
        >
          <!-- explicitly empty -->
        </AutoFit>
      </Transition>

      <Transition name="autofit-retained">
        <AutoFit
          v-if="showPending"
          data-testid="autofit-transition-pending"
          style="width: 180px; height: 120px"
          :large-tiers="0"
          :small-tiers="4"
          alignment="top"
        >
          <p
            v-if="pendingContent"
            data-testid="autofit-transition-pending-copy"
            style="font-size: 100px; line-height: 100px; white-space: nowrap"
          >
            I
          </p>
        </AutoFit>
      </Transition>
    </div>

    <div style="display: grid; grid-template-columns: repeat(3, 200px); gap: 16px; margin-top: 16px">
      <button
        v-for="target in ['fit', 'overflow', 'unsupported'] as const"
        :key="target"
        :data-testid="`auto-image-transition-remove-${target}`"
        @click="removeImage(target)"
      >
        Remove image {{ target }}
      </button>

      <Transition name="autofit-retained">
        <AutoImage
          v-if="showImageFit"
          data-testid="auto-image-transition-fit"
          style="width: 180px; height: 120px"
        >
          <p><img :src="imageSource" alt="Managed fit image"></p>
          <p>Managed fit caption.</p>
        </AutoImage>
      </Transition>

      <Transition name="autofit-retained">
        <AutoImage
          v-if="showImageOverflow"
          data-testid="auto-image-transition-overflow"
          style="width: 180px; height: 0px"
        >
          <p><img :src="imageSource" alt="Managed overflow image"></p>
          <p>Managed overflow caption.</p>
        </AutoImage>
      </Transition>

      <Transition name="autofit-retained">
        <AutoImage
          v-if="showImageUnsupported"
          data-testid="auto-image-transition-unsupported"
          style="width: 180px; height: 120px"
        >
          <p><img :src="imageSource" alt="Managed survivor image"></p>
          <p>Managed survivor caption.</p>
          <p><img :src="unavailableImageSource" alt="Omitted failed image"></p>
          <p>Omitted failed caption.</p>
        </AutoImage>
      </Transition>
    </div>
  </div>
</template>

<style>
.autofit-retained-leave-active {
  transition: opacity 1s linear;
}

.autofit-retained-leave-from {
  opacity: 1;
}

.autofit-retained-leave-to {
  opacity: 0.99;
}
</style>
