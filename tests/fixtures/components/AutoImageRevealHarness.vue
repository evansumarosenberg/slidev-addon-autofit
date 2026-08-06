<script setup lang="ts">
const landscapeSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='200' viewBox='0 0 400 200'%3E%3Crect width='400' height='200' fill='%237a0019'/%3E%3C/svg%3E"
const portraitSource = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='400' viewBox='0 0 200 400'%3E%3Crect width='200' height='400' fill='%23ffcc33'/%3E%3C/svg%3E"
const positions = ['top', 'bottom', 'center', 'left', 'right'] as const
</script>

<template>
  <div data-testid="auto-image-reveal-harness" class="auto-image-reveal-harness">
    <AutoImage
      v-for="position in positions"
      :key="`clicks-${position}`"
      :data-testid="`auto-image-reveal-clicks-${position}`"
      :position="position"
      class="auto-image-reveal-harness__item"
    >
      <v-clicks>
        <p><img :src="landscapeSource" :alt="`v-clicks ${position} landscape`"></p>
        <p :data-auto-image-reveal-caption-id="`clicks-${position}-landscape`">v-clicks {{ position }} landscape caption.</p>
        <p><img :src="portraitSource" :alt="`v-clicks ${position} portrait`"></p>
        <p :data-auto-image-reveal-caption-id="`clicks-${position}-portrait`">v-clicks {{ position }} portrait caption.</p>
      </v-clicks>
    </AutoImage>

    <AutoImage
      v-for="position in positions"
      :key="`click-${position}`"
      :data-testid="`auto-image-reveal-click-${position}`"
      :position="position"
      class="auto-image-reveal-harness__item"
    >
      <v-click><p><img :src="landscapeSource" :alt="`v-click ${position} landscape`"></p></v-click>
      <v-click><p :data-auto-image-reveal-caption-id="`click-${position}-landscape`">v-click {{ position }} landscape caption.</p></v-click>
      <v-click><p><img :src="portraitSource" :alt="`v-click ${position} portrait`"></p></v-click>
      <v-click><p :data-auto-image-reveal-caption-id="`click-${position}-portrait`">v-click {{ position }} portrait caption.</p></v-click>
    </AutoImage>

    <AutoImage
      data-testid="auto-image-reveal-legacy"
      class="auto-image-reveal-harness__item"
    >
      <v-click><p><img :src="landscapeSource" alt="Legacy reveal landscape"></p></v-click>
      <v-click><p data-auto-image-reveal-caption-id="legacy-caption">Legacy reveal caption.</p></v-click>
    </AutoImage>
  </div>
</template>

<style scoped>
.auto-image-reveal-harness {
  display: grid;
  grid-template-columns: repeat(3, 240px);
  gap: 16px;
}

.auto-image-reveal-harness__item {
  width: 240px;
  height: 180px;
}
</style>
