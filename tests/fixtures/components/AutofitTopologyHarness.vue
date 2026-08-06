<script setup lang="ts">
import { ref } from 'vue'

interface Item {
  id: string
  text: string
}

const items = ref<Item[]>([
  { id: 'a', text: 'First stable unit' },
  { id: 'b', text: 'Second stable unit' },
])

function compatibleTextChange(): void {
  items.value[0].text = 'First stable unit with compatible replacement text'
}

function insertUnit(): void {
  items.value.push({ id: 'c', text: 'Inserted unit' })
}

function removeUnit(): void {
  items.value = items.value.slice(0, -1)
}

function reorderUnits(): void {
  items.value = [...items.value].reverse()
}

function replaceUnit(): void {
  items.value[0] = {
    id: `${items.value[0].id}-replacement`,
    text: 'Replacement root',
  }
}
</script>

<template>
  <div data-testid="topology-harness">
    <button data-testid="topology-compatible" @click="compatibleTextChange">
      Compatible text
    </button>
    <button data-testid="topology-insert" @click="insertUnit">Insert</button>
    <button data-testid="topology-remove" @click="removeUnit">Remove</button>
    <button data-testid="topology-reorder" @click="reorderUnits">Reorder</button>
    <button data-testid="topology-replace" @click="replaceUnit">Replace</button>
    <AutoFit
      data-testid="topology-autofit"
      style="width: 260px; height: 180px; --slidev-autofit-base-spacing: 16px"
      :large-tiers="2"
      :small-tiers="2"
      alignment="bottom"
    >
      <p
        v-for="item in items"
        :key="item.id"
        :data-testid="`topology-${item.id}`"
        style="font-size: 14px; line-height: 30px; transition: all 1s linear"
      >
        {{ item.text }}
      </p>
    </AutoFit>
  </div>
</template>
