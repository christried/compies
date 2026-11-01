<script setup lang="ts">
import { ChevronDown } from '@lucide/vue'

// The Game notes of a game (#224, GLOSSARY: Game notes) as a disclosure: collapsed by default, announced as open or
// closed, and plain text with its line breaks, never formatted or linked. The panel is rendered only while it is open.
// Only the Host gets the notes of a pool game (#224); 0.7 reuses it for the Host on the Round card (#217), where it starts
// open (`startOpen`, #228): the notes are what the Host needs while the game is played.
const props = withDefaults(defineProps<{ notes: string, startOpen?: boolean }>(), { startOpen: false })

const { t } = useI18n()
const panelId = useId()
const open = ref(props.startOpen)
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      type="button"
      class="inline-flex h-11 items-center gap-1.5 self-start px-1 text-[13px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line"
      :aria-expanded="open"
      :aria-controls="open ? panelId : undefined"
      @click="open = !open"
    >
      {{ t('howWePlay.notes') }}
      <AppIcon
        :icon="ChevronDown"
        :size="14"
        :class="open && 'rotate-180'"
      />
    </button>
    <div
      v-if="open"
      :id="panelId"
      class="rounded-[12px] bg-paper-2 px-3.5 py-3"
    >
      <p class="m-0 text-[14px] leading-[1.45] whitespace-pre-wrap text-ink [overflow-wrap:anywhere]">
        {{ notes }}
      </p>
    </div>
  </div>
</template>
