<script setup lang="ts">
import { computed, ref } from 'vue'
import AutoColumnAutoFitBridge from '../../../components/autofit/AutoColumnAutoFitBridge.vue'

const props = defineProps<{
  leftDense?: boolean
  mode?: 'unbalanced' | 'unbalanced-both-fit' | 'balanced' | 'one-overflow' | 'two-overflow' | 'empty-managed' | 'managed-empty' | 'empty-overflow' | 'overflow-empty' | 'both-empty' | 'unsupported-fit' | 'unsupported-overflow' | 'unsupported-empty' | 'unsupported-unsupported' | 'fit-unsupported' | 'overflow-unsupported' | 'empty-unsupported' | 'semantic' | 'semantic-reactive' | 'semantic-overflow' | 'semantic-bottom' | 'semantic-boundary-free' | 'semantic-target-free' | 'semantic-unequal' | 'semantic-unequal-left' | 'semantic-text-media' | 'semantic-media-text' | 'semantic-atomic-text' | 'semantic-mirror-left' | 'semantic-mirror-positive' | 'semantic-mirror-positive-overflow' | 'semantic-alignment-overflow' | 'semantic-capture' | 'semantic-scaled'
}>()

const ready = ref(false)
const bridgeMounted = ref(true)
const reactiveLeftDense = ref(false)
const reactiveRightDense = ref(false)
const reactiveTopology = ref(false)
const reactiveLeftEmpty = ref(false)
const reactiveLeftUnsupported = ref(false)
const reactiveSemanticSourceReversed = ref(false)
const queryMode = typeof window === 'undefined'
  ? null
  : new URLSearchParams(window.location.search).get('coordinationMode')
const mode = computed(() => queryMode ?? props.mode ?? 'unbalanced')
const leftDense = computed(() => mode.value === 'two-overflow'
  || mode.value === 'overflow-empty'
  || mode.value === 'overflow-unsupported'
  || (mode.value === 'unbalanced' && props.leftDense === true)
  || (mode.value === 'reactive' && reactiveLeftDense.value))
const rightDense = computed(() => mode.value === 'two-overflow'
  || mode.value === 'one-overflow'
  || mode.value === 'empty-overflow'
  || mode.value === 'unsupported-overflow'
  || (mode.value === 'unbalanced' && props.leftDense !== true)
  || (mode.value === 'reactive' && reactiveRightDense.value))
const leftUnsupported = computed(() => mode.value.startsWith('unsupported')
  || (mode.value === 'reactive' && reactiveLeftUnsupported.value))
const rightUnsupported = computed(() => mode.value === 'unsupported-unsupported'
  || mode.value.endsWith('-unsupported'))
const leftEmpty = computed(() => mode.value === 'empty-managed'
  || mode.value === 'both-empty'
  || mode.value === 'empty-unsupported'
  || mode.value === 'empty-overflow'
  || (mode.value === 'reactive' && reactiveLeftEmpty.value))
const rightEmpty = computed(() => mode.value === 'both-empty'
  || mode.value === 'unsupported-empty'
  || mode.value === 'managed-empty'
  || mode.value === 'overflow-empty')
const semantic = computed(() => mode.value === 'semantic' || mode.value === 'semantic-reactive')
const semanticReactive = computed(() => mode.value === 'semantic-reactive')
const semanticOverflow = computed(() => mode.value === 'semantic-overflow')
const semanticBottom = computed(() => mode.value === 'semantic-bottom')
const semanticBoundaryFree = computed(() => mode.value === 'semantic-boundary-free')
const semanticTargetFree = computed(() => mode.value === 'semantic-target-free')
const semanticUnequal = computed(() => mode.value === 'semantic-unequal')
const semanticUnequalLeft = computed(() => mode.value === 'semantic-unequal-left')
const semanticTextMedia = computed(() => mode.value === 'semantic-text-media')
const semanticMediaText = computed(() => mode.value === 'semantic-media-text')
const semanticAtomicText = computed(() => mode.value === 'semantic-atomic-text')
const semanticMirrorLeft = computed(() => mode.value === 'semantic-mirror-left')
const semanticMirrorPositive = computed(() => mode.value === 'semantic-mirror-positive'
  || mode.value === 'semantic-mirror-positive-overflow')
const semanticMirrorPositiveOverflow = computed(() => mode.value === 'semantic-mirror-positive-overflow')
const semanticAlignmentOverflow = computed(() => mode.value === 'semantic-alignment-overflow')
const semanticCapture = computed(() => mode.value === 'semantic-capture')
const semanticScaled = computed(() => mode.value === 'semantic-scaled')
const semanticDistributed = computed(() => semantic.value
  || semanticBoundaryFree.value
  || semanticTargetFree.value
  || semanticUnequal.value
  || semanticUnequalLeft.value
  || semanticTextMedia.value
  || semanticMediaText.value
  || semanticAtomicText.value
  || semanticMirrorLeft.value
  || semanticMirrorPositive.value
  || semanticCapture.value
  || semanticAlignmentOverflow.value
  || semanticScaled.value)
const rawConfig = computed(() => semanticDistributed.value
  ? {
      largeTiers: 0,
      smallTiers: semanticUnequal.value || semanticUnequalLeft.value ? 4 : 0,
      tierIncrement: 10,
      alignment: 'distributed',
    }
  : semanticBottom.value
    ? { largeTiers: 0, smallTiers: 0, tierIncrement: 10, alignment: 'bottom' }
  : semanticOverflow.value
    ? { largeTiers: 0, smallTiers: 4, tierIncrement: 10, alignment: 'distributed' }
  : { largeTiers: 0, smallTiers: 4, tierIncrement: 10, alignment: 'top' })
</script>

<template>
  <button data-testid="start-coordination" @click="ready = true">
    Start coordinated fitting
  </button>
  <button
    v-if="mode === 'reactive'"
    data-testid="coordination-toggle-left-density"
    @click="reactiveLeftDense = !reactiveLeftDense"
  >
    Toggle left density
  </button>
  <button
    v-if="mode === 'reactive'"
    data-testid="coordination-toggle-right-density"
    @click="reactiveRightDense = !reactiveRightDense"
  >
    Toggle right density
  </button>
  <button
    v-if="mode === 'reactive' || semantic"
    data-testid="coordination-unmount"
    @click="bridgeMounted = false"
  >
    Unmount coordinated pair
  </button>
  <button
    v-if="mode === 'reactive' || semantic"
    data-testid="coordination-remount"
    @click="bridgeMounted = true"
  >
    Remount coordinated pair
  </button>
  <button
    v-if="mode === 'reactive'"
    data-testid="coordination-toggle-topology"
    @click="reactiveTopology = !reactiveTopology"
  >
    Toggle left topology
  </button>
  <button
    v-if="mode === 'reactive'"
    data-testid="coordination-toggle-left-empty"
    @click="reactiveLeftEmpty = !reactiveLeftEmpty"
  >
    Toggle left empty
  </button>
  <button
    v-if="mode === 'reactive'"
    data-testid="coordination-toggle-left-unsupported"
    @click="reactiveLeftUnsupported = !reactiveLeftUnsupported"
  >
    Toggle left unsupported
  </button>
  <button
    v-if="semanticReactive"
    data-testid="coordination-toggle-semantic-source"
    @click="reactiveSemanticSourceReversed = !reactiveSemanticSourceReversed"
  >
    Toggle semantic source
  </button>
  <AutoColumnAutoFitBridge
    v-if="ready && bridgeMounted"
    data-testid="coordination-harness"
    :class="{ 'coordination-scaled': semanticScaled }"
    :raw-config="rawConfig"
    :style="{
      display: 'grid',
      gridTemplateColumns: 'repeat(2, 220px)',
      gap: '16px',
      '--autofit-harness-height': semanticMirrorPositiveOverflow ? '500px' : semanticDistributed || semanticOverflow || semanticBottom ? '280px' : '160px',
    }"
  >
    <template #left>
      <span v-if="leftUnsupported" style="display: contents">Unsupported left</span>
      <h2 v-else-if="mode === 'reactive' && reactiveTopology">
        Replacement left heading
      </h2>
      <template v-else-if="semanticDistributed || semanticOverflow || semanticBottom">
        <template v-if="semanticBoundaryFree">
          <p data-testid="coordination-left-boundary-free">Left standalone paragraph</p>
        </template>
        <template v-else-if="semanticTextMedia">
          <svg data-testid="coordination-left-first-media" width="60" height="40" viewBox="0 0 60 40" aria-label="Left media">
            <rect width="60" height="40" fill="currentColor" />
          </svg>
          <p data-testid="coordination-left-after-media">Left media caption</p>
        </template>
        <template v-else-if="semanticAlignmentOverflow">
          <p data-testid="coordination-left-first-text">
            <span style="position: relative; inset-block-start: 90px">Left displaced introduction</span>
          </p>
          <p>Left displaced conclusion</p>
        </template>
        <template v-else-if="semanticMirrorLeft || semanticMirrorPositive">
          <h2 data-testid="coordination-left-first-text">
            <span :style="semanticMirrorPositive ? { position: 'relative', insetBlockStart: semanticMirrorPositiveOverflow ? '350px' : '100px' } : undefined">Left heading</span>
          </h2>
          <p>Left introduction</p>
          <ul><li>Left list one</li><li>Left list two</li></ul>
        </template>
        <template v-else-if="semanticUnequalLeft">
          <p
            data-testid="coordination-left-unequal-a"
            style="font-size: 100px; line-height: 156px; white-space: nowrap"
          >
            I
          </p>
          <p
            data-testid="coordination-left-unequal-b"
            style="font-size: 100px; line-height: 156px; white-space: nowrap"
          >
            I
          </p>
        </template>
        <template v-else-if="semanticReactive && reactiveSemanticSourceReversed">
          <h2 data-testid="coordination-left-reactive-heading">Replacement left heading</h2>
          <p data-testid="coordination-left-reactive-copy">Replacement left introduction</p>
          <ul data-testid="coordination-left-reactive-list">
            <li>Replacement left list one</li>
            <li>Replacement left list two</li>
          </ul>
        </template>
        <template v-else>
          <p
            :data-testid="semanticMediaText || semanticAtomicText ? 'coordination-left-first-text' : 'coordination-left-semantic-a'"
          >
            Left introduction
          </p>
          <p
            data-testid="coordination-left-semantic-b"
          >
            Left conclusion
          </p>
        </template>
      </template>
      <p
        v-else-if="!leftEmpty"
        data-testid="coordination-left-copy"
        :style="{
          fontSize: '100px',
          lineHeight: leftDense ? '500px' : '100px',
          whiteSpace: 'nowrap',
        }"
      >
        I
      </p>
    </template>
    <template #right>
      <span v-if="rightUnsupported" style="display: contents">Unsupported right</span>
      <template v-if="semanticOverflow">
        <p
          data-testid="coordination-right-semantic-overflow"
          style="font-size: 100px; line-height: 500px; white-space: nowrap"
        >
          I
        </p>
      </template>
      <template v-else-if="semanticDistributed || semanticBottom">
        <template v-if="semanticBoundaryFree || semanticTargetFree">
          <p data-testid="coordination-right-boundary-free">Right standalone paragraph</p>
        </template>
        <template v-else-if="semanticMediaText">
          <svg data-testid="coordination-right-first-media" width="60" height="40" viewBox="0 0 60 40" aria-label="Right media">
            <rect width="60" height="40" fill="currentColor" />
          </svg>
          <p>Right media caption</p>
        </template>
        <template v-else-if="semanticAtomicText">
          <blockquote data-testid="coordination-right-first-atomic" style="padding-block: 12px">Right atomic quotation</blockquote>
          <p>Right atomic conclusion</p>
        </template>
        <template v-else-if="semanticMirrorLeft || semanticMirrorPositive">
          <p data-testid="coordination-right-first-text">Right introduction</p>
          <p>Right conclusion</p>
        </template>
        <template v-else-if="semanticUnequal">
          <p
            data-testid="coordination-right-unequal-a"
            style="font-size: 100px; line-height: 156px; white-space: nowrap"
          >
            I
          </p>
          <p
            data-testid="coordination-right-unequal-b"
            style="font-size: 100px; line-height: 156px; white-space: nowrap"
          >
            I
          </p>
        </template>
        <template v-else-if="semanticReactive && reactiveSemanticSourceReversed">
          <p data-testid="coordination-right-reactive-a">Replacement right introduction</p>
          <p data-testid="coordination-right-reactive-b">Replacement right conclusion</p>
        </template>
        <template v-else>
          <h2 :data-testid="semanticTextMedia || semanticAlignmentOverflow ? 'coordination-right-first-text' : 'coordination-right-semantic-heading'">Right heading</h2>
          <p data-testid="coordination-right-semantic-copy">Right introduction</p>
          <ul data-testid="coordination-right-semantic-list">
            <li>Right list one</li>
            <li>Right list two</li>
          </ul>
        </template>
      </template>
      <p
        v-else-if="!rightEmpty"
        data-testid="coordination-right-copy"
        :style="{
          fontSize: '100px',
          lineHeight: mode === 'unbalanced-both-fit' ? '180px' : rightDense ? '500px' : '100px',
          whiteSpace: 'nowrap',
        }"
      >
        I
      </p>
    </template>
  </AutoColumnAutoFitBridge>
</template>

<style scoped>
.autofit-coordination-pair :deep(.autofit) {
  height: var(--autofit-harness-height);
}

.coordination-scaled :deep([data-autofit-role='left']) {
  transform: scale(0.8);
  transform-origin: top left;
}
</style>
