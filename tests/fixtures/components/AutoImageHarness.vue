<script setup lang="ts">
import { ref } from 'vue'

const landscapeSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Crect width='400' height='200' fill='%237a0019'/%3E%3C/svg%3E"
const portraitSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='400' viewBox='0 0 200 400'%3E%3Crect width='200' height='400' fill='%23ffcc33'/%3E%3C/svg%3E"
const squareSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300' viewBox='0 0 300 300'%3E%3Crect width='300' height='300' fill='%23006666'/%3E%3C/svg%3E"
const pendingSource = '/auto-image-pending.svg'
const errorSource = '/auto-image-error.svg'
const showUnmount = ref(true)
const showMultiUnmount = ref(true)
const showFiniteInitial = ref(false)
const showFiniteRowInitial = ref(false)
const showFiniteColumnInitial = ref(false)
const finitePosition = ref<'center' | 'left'>('center')
const transitionHeight = ref(140)
</script>

<template>
  <div data-testid="auto-image-harness">
    <AutoImage
      data-testid="auto-image-direct"
      style="width: 400px; height: 300px"
    >
      <img
        data-testid="auto-image-direct-image"
        :src="landscapeSource"
        alt="Landscape fixture"
        aria-describedby="auto-image-direct-description"
        width="1"
        height="1"
        style="width: 11px; height: 17px"
      >
    </AutoImage>

    <AutoImage
      data-testid="auto-image-caption"
      style="width: 400px; height: 300px; --slidev-auto-image-caption-gap: 20px"
    >
      <p><img :src="portraitSource" alt="Portrait fixture"></p>
      <p data-testid="auto-image-caption-text"><em>Fixed caption</em> with <strong>inline</strong> text.</p>
    </AutoImage>

    <AutoImage
      data-testid="auto-image-custom-properties"
      style="width: 240px; height: 220px; --slidev-auto-image-caption-gap: 12px; --slidev-auto-image-caption-font-size: 20px; --slidev-auto-image-caption-line-height: 24px"
    >
      <p><img :src="squareSource" alt="Square fixture"></p>
      <p>Custom caption.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-missing" style="width: 180px; height: 120px">
      <p>There is no image here.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-multiple" style="width: 180px; height: 120px">
      <img data-testid="auto-image-multiple-first" :src="landscapeSource" alt="First">
      <p data-testid="auto-image-multiple-first-caption">First caption.</p>
      <p><img data-testid="auto-image-multiple-second" :src="squareSource" alt="Second"></p>
      <p data-testid="auto-image-multiple-second-caption">Second caption.</p>
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-column"
      position="left"
      style="width: 180px; height: 360px; --slidev-auto-image-item-gap: 20px"
    >
      <img data-testid="auto-image-column-first" :src="landscapeSource" alt="Column landscape">
      <p data-testid="auto-image-column-first-caption">Column caption.</p>
      <img data-testid="auto-image-column-second" :src="portraitSource" alt="Column portrait">
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-top"
      position="top"
      style="width: 360px; height: 220px; --slidev-auto-image-item-gap: 20px"
    >
      <img data-testid="auto-image-top-first" :src="landscapeSource" alt="Top landscape">
      <p data-testid="auto-image-top-first-caption">Top landscape caption.</p>
      <p><img data-testid="auto-image-top-second" :src="portraitSource" alt="Top portrait"></p>
      <img data-testid="auto-image-top-third" :src="squareSource" alt="Top square">
      <p data-testid="auto-image-top-third-caption">Top square caption.</p>
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-bottom"
      position="bottom"
      style="width: 360px; height: 180px"
    >
      <img data-testid="auto-image-bottom-first" :src="landscapeSource" alt="Bottom landscape">
      <img data-testid="auto-image-bottom-second" :src="portraitSource" alt="Bottom portrait">
      <img data-testid="auto-image-bottom-third" :src="squareSource" alt="Bottom square">
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-right"
      position="right"
      style="width: 240px; height: 480px; --slidev-auto-image-item-gap: 20px"
    >
      <img data-testid="auto-image-right-first" :src="landscapeSource" alt="Right landscape">
      <p data-testid="auto-image-right-first-caption">Right landscape caption.</p>
      <img data-testid="auto-image-right-second" :src="portraitSource" alt="Right portrait">
      <img data-testid="auto-image-right-third" :src="squareSource" alt="Right square">
      <p data-testid="auto-image-right-third-caption">Right square caption.</p>
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-overflow"
      style="width: 260px; height: 180px"
    >
      <img data-testid="auto-image-overflow-first" :src="squareSource" alt="Overflow first">
      <img data-testid="auto-image-overflow-second" :src="squareSource" alt="Overflow second">
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-reactive"
      style="width: 260px; height: 180px"
    >
      <img data-testid="auto-image-reactive-first" :src="landscapeSource" alt="Reactive first">
      <p data-testid="auto-image-reactive-first-caption">Reactive first caption.</p>
      <img data-testid="auto-image-reactive-second" :src="squareSource" alt="Reactive second">
      <p data-testid="auto-image-reactive-second-caption">Reactive second caption.</p>
      <img data-testid="auto-image-reactive-third" :src="portraitSource" alt="Reactive third">
    </AutoImage>

    <button data-testid="auto-image-multi-unmount-control" type="button" @click="showMultiUnmount = false">
      Unmount multiple AutoImage
    </button>

    <AutoImage
      v-if="showMultiUnmount"
      data-testid="auto-image-multiple-unmount"
      style="width: 240px; height: 180px"
    >
      <img data-testid="auto-image-multiple-unmount-first" :src="landscapeSource" alt="Unmount first">
      <p>Unmount first caption.</p>
      <img data-testid="auto-image-multiple-unmount-second" :src="squareSource" alt="Unmount second">
      <p>Unmount second caption.</p>
      <img data-testid="auto-image-multiple-unmount-third" :src="portraitSource" alt="Unmount third">
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-pending"
      style="width: 180px; height: 160px"
    >
      <img data-testid="auto-image-multiple-pending-ready" :src="landscapeSource" alt="Ready peer">
      <img data-testid="auto-image-multiple-pending-late" :src="pendingSource" alt="Late peer">
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-failure"
      style="width: 240px; height: 180px"
    >
      <img data-testid="auto-image-multiple-failure-first" :src="landscapeSource" alt="Successful survivor">
      <p data-testid="auto-image-multiple-failure-first-caption">Successful survivor caption.</p>
      <img data-testid="auto-image-multiple-failure-broken" :src="errorSource" alt="Broken item">
      <p data-testid="auto-image-multiple-failure-broken-caption">Broken caption.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-multiple-item-gap-overflow" style="width: 16px; height: 80px">
      <img data-testid="auto-image-multiple-item-gap-first" :src="squareSource" alt="Gap first">
      <img data-testid="auto-image-multiple-item-gap-second" :src="squareSource" alt="Gap second">
    </AutoImage>

    <AutoImage
      data-testid="auto-image-multiple-item-gap-clamped"
      style="width: 32px; height: 80px; --slidev-auto-image-item-gap: 2px"
    >
      <img data-testid="auto-image-multiple-item-gap-clamped-first" :src="squareSource" alt="Clamped gap first">
      <img data-testid="auto-image-multiple-item-gap-clamped-second" :src="squareSource" alt="Clamped gap second">
    </AutoImage>

    <AutoImage data-testid="auto-image-multiple-all-failed" style="width: 240px; height: 160px">
      <img data-testid="auto-image-multiple-all-failed-first" :src="errorSource" alt="First broken item">
      <p data-testid="auto-image-multiple-all-failed-first-caption">First broken caption.</p>
      <img data-testid="auto-image-multiple-all-failed-second" :src="errorSource" alt="Second broken item">
      <p data-testid="auto-image-multiple-all-failed-second-caption">Second broken caption.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-wrapper" style="width: 180px; height: 120px">
      <a href="#wrapped"><img :src="landscapeSource" alt="Wrapped"></a>
    </AutoImage>

    <AutoImage data-testid="auto-image-before" style="width: 180px; height: 120px">
      <p>Text before image</p>
      <img :src="landscapeSource" alt="After text">
    </AutoImage>

    <AutoImage data-testid="auto-image-multiple-captions" style="width: 180px; height: 120px">
      <img :src="landscapeSource" alt="Multiple caption image">
      <p>First caption.</p>
      <p>Second caption.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-caption-overflow" style="width: 100px; height: 140px">
      <img :src="squareSource" alt="Overflow fixture">
      <p><span style="white-space: nowrap">A caption with an intentionally unbreakable inline extent.</span></p>
    </AutoImage>

    <AutoImage data-testid="auto-image-zero-inline" style="width: 0; height: 140px">
      <img :src="squareSource" alt="Zero inline fixture">
    </AutoImage>

    <AutoImage data-testid="auto-image-zero-block" style="width: 100px; height: 0">
      <img :src="squareSource" alt="Zero block fixture">
    </AutoImage>

    <AutoImage data-testid="auto-image-caption-block" style="width: 100px; height: 100px">
      <img :src="squareSource" alt="Caption block fixture">
      <p>This caption is deliberately long enough to wrap across many lines and exceed the available image region block size.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-no-image-block" style="width: 100px; height: 26px">
      <img :src="squareSource" alt="No image block fixture">
      <p>Short caption.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-no-renderable" style="width: 100px; height: 1px">
      <img :src="portraitSource" alt="Tiny region fixture">
    </AutoImage>

    <AutoImage data-testid="auto-image-caption-inline-no-space" style="width: 1px; height: 20px">
      <img :src="squareSource" alt="Caption inline no-space fixture">
      <p><span style="white-space: nowrap">An unbreakable caption that exceeds one pixel.</span></p>
    </AutoImage>

    <AutoImage data-testid="auto-image-zero-inline-precedence" style="width: 0; height: 20px">
      <img :src="squareSource" alt="Zero inline precedence fixture">
      <p><span style="white-space: nowrap">An unbreakable caption.</span></p>
    </AutoImage>

    <AutoImage data-testid="auto-image-tolerance" style="width: 0.5px; height: 100px">
      <img :src="squareSource" alt="Tolerance fixture">
    </AutoImage>

    <AutoImage data-testid="auto-image-caption-tolerance" style="width: 180px; height: 140px">
      <img :src="squareSource" alt="Caption tolerance fixture">
      <p>Caption tolerance fixture.</p>
    </AutoImage>

    <AutoImage
      data-testid="auto-image-content-box"
      style="width: 240px; height: 200px; padding: 20px; border: 10px solid #123456"
    >
      <img :src="squareSource" alt="Content box fixture">
    </AutoImage>

    <AutoImage
      data-testid="auto-image-accessible"
      class="auto-image-authored-css"
      style="width: 240px; height: 220px"
    >
      <p>
        <img
          data-testid="auto-image-accessible-image"
          :src="landscapeSource"
          alt="Accessible fixture"
          title="Accessible title"
          role="img"
          aria-label="Accessible image"
          aria-describedby="auto-image-accessible-description"
          width="3"
          height="5"
        >
      </p>
      <p data-testid="auto-image-accessible-caption"><em>Accessible caption.</em></p>
    </AutoImage>

    <AutoImage data-testid="auto-image-authored-fallback" class="auto-image-authored-css" style="width: 240px; height: 160px">
      <a href="#authored-fallback"><img
        data-testid="auto-image-fallback-image"
        :src="landscapeSource"
        alt="Fallback fixture"
        title="Fallback title"
        role="img"
        aria-label="Fallback image"
        aria-describedby="auto-image-fallback-description"
      ></a>
      <p data-testid="auto-image-fallback-caption"><strong>Fallback caption.</strong></p>
    </AutoImage>

    <AutoImage data-testid="auto-image-default-properties" style="width: 240px; height: 180px">
      <img :src="squareSource" alt="Default properties fixture">
      <p>Default caption.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-reactive" style="width: 240px; height: 180px">
      <img :src="squareSource" alt="Reactive fixture">
    </AutoImage>

    <AutoImage data-testid="auto-image-reactive-caption" style="width: 240px; height: 180px">
      <img :src="squareSource" alt="Reactive caption fixture">
      <p>Reactive caption fixture.</p>
    </AutoImage>

    <button data-testid="auto-image-transition-zero-block" type="button" @click="transitionHeight = 0">
      Set zero block space
    </button>
    <button data-testid="auto-image-transition-restore-block" type="button" @click="transitionHeight = 140">
      Restore block space
    </button>

    <AutoImage
      data-testid="auto-image-transitions"
      :style="{ width: '100px', height: `${transitionHeight}px` }"
    >
      <img :src="squareSource" alt="Transition fixture">
    </AutoImage>

    <button data-testid="auto-image-unmount-control" type="button" @click="showUnmount = false">
      Unmount AutoImage
    </button>

    <AutoImage v-if="showUnmount" data-testid="auto-image-unmount" style="width: 160px; height: 120px">
      <img :src="squareSource" alt="Unmount fixture">
    </AutoImage>

    <AutoImage data-testid="auto-image-pending" style="width: 160px; height: 120px">
      <img :src="pendingSource" alt="Pending fixture">
    </AutoImage>

    <AutoImage data-testid="auto-image-error" style="width: 160px; height: 120px">
      <img :src="errorSource" alt="Error fixture" width="9" height="7">
      <p data-testid="auto-image-error-caption">Authored error caption.</p>
    </AutoImage>

    <AutoImage data-testid="auto-image-complete-invalid" style="width: 160px; height: 120px">
      <img src="about:blank" alt="Unavailable fixture">
    </AutoImage>

    <button data-testid="auto-image-finite-initial-control" type="button" @click="showFiniteInitial = true">
      Mount non-finite initial fixture
    </button>
    <AutoImage
      v-if="showFiniteInitial"
      data-testid="auto-image-finite-initial"
      style="width: 240px; height: 180px"
    >
      <p><img :src="squareSource" alt="Initial finite fixture"></p>
      <p>Initial finite caption.</p>
    </AutoImage>

    <button
      data-testid="auto-image-finite-row-initial-control"
      type="button"
      @click="showFiniteRowInitial = true"
    >
      Mount non-finite row candidate fixture
    </button>
    <AutoImage
      v-if="showFiniteRowInitial"
      data-testid="auto-image-finite-row-initial"
      style="width: 240px; height: 180px"
    >
      <img :src="landscapeSource" alt="Initial row landscape fixture">
      <p>Initial row landscape caption.</p>
      <img :src="portraitSource" alt="Initial row portrait fixture">
      <p>Initial row portrait caption.</p>
    </AutoImage>

    <button
      data-testid="auto-image-finite-column-initial-control"
      type="button"
      @click="showFiniteColumnInitial = true"
    >
      Mount non-finite column candidate fixture
    </button>
    <AutoImage
      v-if="showFiniteColumnInitial"
      data-testid="auto-image-finite-column-initial"
      position="left"
      style="width: 240px; height: 180px"
    >
      <img :src="landscapeSource" alt="Initial column landscape fixture">
      <p>Initial column landscape caption.</p>
      <img :src="portraitSource" alt="Initial column portrait fixture">
      <p>Initial column portrait caption.</p>
    </AutoImage>

    <button data-testid="auto-image-finite-position-control" type="button" @click="finitePosition = 'left'">
      Change finite fixture position
    </button>
    <AutoImage
      data-testid="auto-image-finite-commit"
      :position="finitePosition"
      style="width: 240px; height: 180px"
    >
      <p><img :src="squareSource" alt="Finite commit fixture"></p>
      <p>Finite commit caption.</p>
    </AutoImage>
  </div>
</template>

<style>
.auto-image-authored-css .auto-image__flow img {
  width: 7px;
  height: 9px;
  max-width: 7px;
  margin: 23px;
}

.auto-image-authored-css .auto-image__flow p {
  margin: 31px;
  padding: 7px;
}
</style>
