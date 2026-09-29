<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onBeforeUpdate,
  onMounted,
  onUpdated,
  ref,
  shallowRef,
  watch,
  useSlots,
} from 'vue'
import AutoImage from '../components/AutoImage.vue'
import {
  createAutoImageAutoTrackStyle,
  createAutoImageImageTrackStyle,
  createAutoImageStageStyle,
  createAutoImageLayoutGeometryFingerprint,
  hasAutoImageSplitOverflow,
  readAutoImageRegionGap,
} from '../utils/auto-image/layout'
import {
  createAutoImageConfigurationWarningSignature,
  normalizeAutoImageConfig,
} from '../utils/auto-image/config'
import {
  createAutoImageLayoutLifecycle,
} from '../utils/auto-image/layout-lifecycle'
import type {
  AutoImageLayoutGeometryBox,
  AutoImageLayoutGeometrySnapshot,
} from '../utils/auto-image/layout'
import type {
  AutoImageLayoutLifecycle,
} from '../utils/auto-image/layout-lifecycle'
import { AUTOFIT_DIAGNOSTIC_PREFIX } from '../utils/autofit/diagnostic-prefix'
import LayoutAutoFitBridge from '../components/autofit/LayoutAutoFitBridge.vue'
import { useLayoutOverflow } from '../utils/autofit/useLayoutOverflow'
import type { AutoImageStateReport } from '../components/AutoImage.vue'

const props = defineProps<{
  autofit?: unknown
  image?: unknown
}>()

const slots = useSlots()
interface AutoImageSlotPresence {
  readonly default: boolean
  readonly auto: boolean
  readonly footer: boolean
}

function readSlotPresence(): AutoImageSlotPresence {
  return {
    default: Boolean(slots.default),
    auto: Boolean(slots.auto),
    footer: Boolean(slots.footer),
  }
}

const slotPresence = shallowRef<AutoImageSlotPresence>(readSlotPresence())
const hasDefault = computed(() => slotPresence.value.default)
const hasAuto = computed(() => slotPresence.value.auto)
const hasFooter = computed(() => slotPresence.value.footer)
const normalized = computed(() => normalizeAutoImageConfig(props.image))
const configError = computed(() => [...new Set(
  normalized.value.errors.map(error => error.code),
)].join(','))
const configurationWarningSignature = computed(() => (
  normalized.value.valid
    ? null
    : createAutoImageConfigurationWarningSignature(props.image, normalized.value.errors)
))

const layout = ref<HTMLElement | null>(null)
const main = ref<HTMLElement | null>(null)
const stage = ref<HTMLElement | null>(null)
const footer = ref<HTMLElement | null>(null)
const splitOverflow = ref(false)
const imageReport = ref<AutoImageStateReport>({ state: 'pending', reason: null })
const { overflowing: fixedOverflow } = useLayoutOverflow({ layout, main, footer })

let layoutLifecycle: AutoImageLayoutLifecycle | null = null
let splitFrame: number | null = null
let layoutGeneration = 0
let lastGeometryFingerprint: string | null = null
let mounted = false
const warnedConfigurationSignatures = new Set<string>()

const stageStyle = computed(() => normalized.value.valid
  ? createAutoImageStageStyle(normalized.value.config, hasAuto.value)
  : {})
const imageTrackStyle = computed(() => normalized.value.valid
  ? createAutoImageImageTrackStyle(normalized.value.config, hasAuto.value)
  : {})
const autoTrackStyle = computed(() => normalized.value.valid
  ? createAutoImageAutoTrackStyle(normalized.value.config)
  : {})

function warnInvalidConfiguration(): void {
  const signature = configurationWarningSignature.value
  if (!signature || warnedConfigurationSignatures.has(signature))
    return

  warnedConfigurationSignatures.add(signature)
  console.warn(
    `${AUTOFIT_DIAGNOSTIC_PREFIX} AUTO IMAGE CONFIGURATION ERROR (${configError.value}); image and AutoFit regions are not mounted.`,
  )
}

function boxSnapshot(element: HTMLElement | null): AutoImageLayoutGeometryBox {
  if (!element)
    return { inlineSize: 0, blockSize: 0 }
  const rect = element.getBoundingClientRect()
  const computed = getComputedStyle(element)
  const inlineSize = Number.parseFloat(computed.width)
  const blockSize = Number.parseFloat(computed.height)
  return {
    // Split geometry is calculated in CSS pixels, so do not mix the
    // transformed viewport rectangle with the untransformed CSS gap.
    // Computed used sizes retain fractional CSS pixels.
    inlineSize: Number.isFinite(inlineSize) ? inlineSize : 0,
    blockSize: Number.isFinite(blockSize) ? blockSize : 0,
    inlineOffset: rect.x,
    blockOffset: rect.y,
  }
}

function readGeometrySnapshot(): AutoImageLayoutGeometrySnapshot | null {
  const element = stage.value
  if (!element || !normalized.value.valid)
    return null

  const imageTrack = element.querySelector<HTMLElement>('.auto-image-layout__image-track')
  const autoTrack = element.querySelector<HTMLElement>('.auto-image-layout__auto-track')
  return {
    position: normalized.value.config.position,
    size: normalized.value.config.size,
    defaultDeclared: hasDefault.value,
    autoDeclared: hasAuto.value,
    footerDeclared: hasFooter.value,
    stage: boxSnapshot(element),
    imageTrack: boxSnapshot(imageTrack),
    autoTrack: autoTrack ? boxSnapshot(autoTrack) : null,
    regionGap: readAutoImageRegionGap(element),
  }
}

function syncTrackObservers(): void {
  layoutLifecycle?.setTrackTargets(
    stage.value?.querySelector<HTMLElement>('.auto-image-layout__image-track') ?? null,
    stage.value?.querySelector<HTMLElement>('.auto-image-layout__auto-track') ?? null,
  )
}

function evaluateSplitOverflow(generation: number): void {
  splitFrame = null
  if (!mounted || generation !== layoutGeneration)
    return

  if (!layoutLifecycle)
    return
  layoutLifecycle.commitBarrier()
  if (!mounted || generation !== layoutGeneration) {
    scheduleLayoutFrame()
    return
  }

  syncTrackObservers()
  const snapshot = readGeometrySnapshot()
  if (!snapshot || !stage.value || !snapshot.autoDeclared) {
    lastGeometryFingerprint = snapshot
      ? createAutoImageLayoutGeometryFingerprint(snapshot)
      : null
    splitOverflow.value = false
    return
  }

  const fingerprint = createAutoImageLayoutGeometryFingerprint(snapshot)
  const changed = fingerprint !== lastGeometryFingerprint
  lastGeometryFingerprint = fingerprint
  if (!changed) {
    // A stable snapshot has no state transition to publish. The fingerprint
    // still includes the computed gap, even when the track boxes are stable.
    return
  }

  const overflow = hasAutoImageSplitOverflow(
    {
      position: snapshot.position,
      size: snapshot.size,
    },
    snapshot.stage.inlineSize,
    snapshot.stage.blockSize,
    snapshot.regionGap,
    snapshot.autoDeclared,
  )
  if (overflow && !splitOverflow.value) {
    console.warn(
      `${AUTOFIT_DIAGNOSTIC_PREFIX} AUTO IMAGE LAYOUT OVERFLOW (region-gap): image allocation plus the required region gap exceeds the remaining stage.`,
    )
  }
  splitOverflow.value = overflow
}

function scheduleLayoutFrame(): void {
  if (splitFrame !== null)
    return
  const generation = layoutGeneration
  splitFrame = requestAnimationFrame(() => {
    if (generation !== layoutGeneration) {
      splitFrame = null
      scheduleLayoutFrame()
      return
    }
    evaluateSplitOverflow(generation)
  })
}

function invalidateLayout(_reason: string): void {
  if (!mounted)
    return
  layoutGeneration += 1
  scheduleLayoutFrame()
}

function updateImageReport(report: AutoImageStateReport): void {
  imageReport.value = report
}

watch(() => normalized.value.valid, (valid) => {
  if (!valid)
    imageReport.value = { state: 'pending', reason: null }
}, { flush: 'sync' })

onMounted(async () => {
  mounted = true
  warnInvalidConfiguration()
  if (layout.value && stage.value) {
    layoutLifecycle = createAutoImageLayoutLifecycle({
      root: layout.value,
      stage: stage.value,
      invalidate: invalidateLayout,
    })
  }
  await nextTick()
  invalidateLayout('content')
})

watch([normalized, hasDefault, hasAuto, hasFooter], async () => {
  warnInvalidConfiguration()
  await nextTick()
  if (!mounted)
    return
  invalidateLayout('configuration')
})

onBeforeUpdate(() => {
  const next = readSlotPresence()
  const current = slotPresence.value
  if (next.default === current.default
    && next.auto === current.auto
    && next.footer === current.footer) {
    return
  }
  slotPresence.value = next
})

onUpdated(() => {
  const next = readSlotPresence()
  const current = slotPresence.value
  if (next.default === current.default
    && next.auto === current.auto
    && next.footer === current.footer) {
    return
  }

  slotPresence.value = next
  invalidateLayout('content')
})

onBeforeUnmount(() => {
  mounted = false
  layoutGeneration += 1
  if (splitFrame !== null)
    cancelAnimationFrame(splitFrame)
  splitFrame = null
  layoutLifecycle?.dispose()
  layoutLifecycle = null
})
</script>

<template>
  <div
    ref="layout"
    class="slidev-layout auto-image auto-image-layout"
    :class="{
      'auto-image-layout--config-error': !normalized.valid,
      'auto-image-layout--top': normalized.valid && normalized.config.position === 'top',
      'auto-image-layout--center': normalized.valid && normalized.config.position === 'center',
      'auto-image-layout--split-overflow': splitOverflow,
      'auto-image-layout--overflow': fixedOverflow,
    }"
    :data-auto-image-config-error="normalized.valid ? undefined : configError"
    :data-auto-image-layout-overflow="splitOverflow ? 'true' : undefined"
    :data-auto-image-layout-overflow-reason="splitOverflow ? 'region-gap' : undefined"
    :data-layout-overflow="fixedOverflow ? 'true' : undefined"
  >
    <div ref="main" class="auto-image-layout__main">
      <slot />
    </div>

    <div
      ref="stage"
      class="auto-image-layout__stage"
      :style="stageStyle"
    >
      <template v-if="normalized.valid">
        <div
          class="auto-image-layout__image-track"
          :style="imageTrackStyle"
        >
          <AutoImage :position="normalized.config.position" @state-change="updateImageReport">
            <slot name="image" />
          </AutoImage>
        </div>

        <LayoutAutoFitBridge
          v-if="hasAuto"
          class="auto-image-layout__auto-track"
          :style="autoTrackStyle"
          :raw-config="props.autofit"
        >
          <slot name="auto" />
        </LayoutAutoFitBridge>
      </template>

      <div class="auto-image-layout__diagnostics" aria-hidden="true">
        <span
          v-if="!normalized.valid"
          class="auto-image-layout__config-error-badge"
        >AUTO IMAGE CONFIGURATION ERROR</span>
        <span
          v-if="splitOverflow"
          class="auto-image-layout__overflow-badge"
        >AUTO IMAGE LAYOUT OVERFLOW</span>
        <span
          v-if="normalized.valid && imageReport.state === 'overflow'"
          class="auto-image-layout__image-overflow-badge"
        >AUTO IMAGE OVERFLOW</span>
        <span
          v-if="normalized.valid && imageReport.state === 'unsupported'"
          class="auto-image-layout__image-unsupported-badge"
        >AUTO IMAGE UNSUPPORTED</span>
      </div>
    </div>

    <div v-if="hasFooter" ref="footer" class="auto-image-layout__footer">
      <slot name="footer" />
    </div>

    <div
      v-if="fixedOverflow"
      class="auto-image-layout__fixed-diagnostics"
      aria-hidden="true"
    >
      <span class="auto-image-layout__fixed-overflow-badge">LAYOUT OVERFLOW</span>
    </div>
  </div>
</template>
