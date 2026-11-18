<script setup lang="ts">
import type { Component } from 'vue'

// Loads the notes editor where a note is edited and shows what the Host has meanwhile (#454, ADR 0019, #822): the field's chrome while the chunk loads, and an error
// line with a retry when it does not. The editor is a dynamic import, so no page's first load names it; this component imports it itself rather than through
// `LazyRichNotesEditor`, because a lazy component keeps a failed import (Vue's async component caches the rejected promise, and Nuxt hands the rejection to the error
// handler), so a retry through it could never load the chunk again. It loads on mount, hence client only: the server renders the placeholder. The editor's props and
// events (`v-model`, `@invalid`, `autofocus`) fall through to it.
defineOptions({ inheritAttrs: false })
withDefaults(defineProps<{ variant?: 'game' | 'event' }>(), { variant: 'game' })

const editor = shallowRef<Component | null>(null)
const failed = ref(false)

async function load() {
  failed.value = false
  try {
    editor.value = (await import('~/components/RichNotesEditor.vue')).default
  }
  catch {
    failed.value = true
  }
}
onMounted(load)
</script>

<template>
  <component
    :is="editor"
    v-if="editor"
    v-bind="$attrs"
    :variant="variant"
  />
  <RichNotesEditorFallback
    v-else
    :variant="variant"
    :failed="failed"
    @retry="load"
  />
</template>
