<script setup lang="ts">
import type { MoveTarget } from '~/components/MoveToMenuList.vue'

// The keyboard and touch way to move somebody (#160, 02-components § MoveToMenu): every place with the reason it is
// closed. A popover beside the person on a desktop, a bottom sheet on a phone. Esc, a press outside and a pick close
// it; the focus goes back to the person.
const props = defineProps<{
  open: boolean
  /** The person it moves; the title asks where to. */
  name: string
  targets: MoveTarget[]
  /** The person's button, which the popover sits under and which gets the focus back. */
  anchor: HTMLElement | null
}>()

const emit = defineEmits<{ close: [], pick: [key: string] }>()

const { t } = useI18n()
const title = computed(() => t('board.whereTo', { name: props.name }))
const popover = useTemplateRef<HTMLElement>('popover')
const list = useTemplateRef<{ focusFirst: () => void }>('list')

// The shell's own breakpoint: below it the page has a tab bar and sheets come from the bottom.
const narrow = ref(false)
const position = ref({ top: 0, left: 0 })

watch(() => props.open, async (open) => {
  if (!open) return
  narrow.value = window.matchMedia?.('(max-width: 979px)').matches ?? false
  const rect = props.anchor?.getBoundingClientRect()
  if (rect) position.value = { top: rect.bottom + 6, left: Math.max(8, Math.min(rect.left, window.innerWidth - 288)) }
  await nextTick()
  list.value?.focusFirst()
}, { immediate: true, flush: 'post' })

function close() {
  emit('close')
  props.anchor?.focus()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (!props.open || narrow.value) return
  const target = event.target as Node
  if (popover.value?.contains(target) || props.anchor?.contains(target)) return
  close()
}

onMounted(() => document.addEventListener('pointerdown', onDocumentPointerDown))
onBeforeUnmount(() => document.removeEventListener('pointerdown', onDocumentPointerDown))
</script>

<template>
  <AppSheet
    v-if="narrow"
    :open="open"
    :title="title"
    @close="close"
  >
    <MoveToMenuList
      ref="list"
      :targets="targets"
      @pick="emit('pick', $event)"
    />
  </AppSheet>
  <Teleport
    v-else
    to="body"
  >
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Escape closes the popover -->
    <div
      v-if="open"
      ref="popover"
      class="animate-enter layer-popover fixed flex w-72 flex-col gap-1 rounded-[18px] border-(length:--cp-bw) border-line bg-surface p-2 text-ink shadow-modal"
      :style="{ top: `${position.top}px`, left: `${position.left}px` }"
      @keydown.esc.stop="close"
    >
      <p class="m-0 px-3 pt-1 font-display text-[18px] leading-tight">
        {{ title }}
      </p>
      <MoveToMenuList
        ref="list"
        :targets="targets"
        @pick="emit('pick', $event)"
      />
    </div>
  </Teleport>
</template>
