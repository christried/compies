<script setup lang="ts">
import { X } from '@lucide/vue'
import { ceremonyModel } from '~/utils/ceremony'
import { ceremonyPlays } from '~~/shared/ceremony'
import type { EventView } from '~~/shared/event'

// The Award ceremony's layer (#309, spec #308): a modal dialog over the stage column (the side panel stays visible) on a desktop and full
// screen above the tabs on a phone. It opens by itself at the start instant of the Event read's ceremony, for every Member whatever tab or
// scroll position they are on, and shows the end frame (the motion comes with #311 and #312). Close and Escape close it for this viewer and
// this start, kept in memory: a refetch of the same start keeps it closed, a new start opens it again, a reload forgets the close.
// The page mounts it always, never behind a `v-if` on `open`, because `useDialog` watches `open`.
const props = defineProps<{
  view: Pick<EventView, 'ceremony' | 'standings' | 'members' | 'teams'>
  /** The server's time in epoch ms (useServerClock): the opening is measured against it. */
  serverNow: () => number
}>()

const { t } = useI18n()
const headingId = useId()
const panel = useTemplateRef<HTMLElement>('panel')

const ceremony = computed(() => props.view.ceremony)
const model = computed(() => ceremonyModel(props.view, t))

// Null until the page has mounted, so the server never renders the layer open. The ticker runs up to the start instant; the sample at or
// past it stays, so the opening is decided once, from the clock the page is at.
const now = useServerTicker(() => props.serverNow(), { until: () => (ceremony.value ? Date.parse(ceremony.value.startsAt) : null) })

/** The start (its ISO instant) this viewer's layer opened for, and the one they closed: in memory only. */
const openedFor = ref<string | null>(null)
const closedFor = ref<string | null>(null)

// Opening is a latch: from the start instant on, once, while the run plays. A page first loaded at or after the end never opens it; an opened
// layer stays up past the end (the end frame waits to be closed); a new start is a new key and latches again at its own instant.
watch([now, ceremony], ([at, current]) => {
  if (!current || at === null) return
  if (openedFor.value === current.startsAt || closedFor.value === current.startsAt) return
  if (ceremonyPlays(current, at)) openedFor.value = current.startsAt
}, { immediate: true })

const open = computed(() => ceremony.value !== null && model.value !== null && openedFor.value === ceremony.value.startsAt && closedFor.value !== ceremony.value.startsAt)

function close() {
  if (ceremony.value) closedFor.value = ceremony.value.startsAt
}

const { onKeydown } = useDialog(open, panel, close)

// Escape closes from anywhere while the layer is open: on a desktop the side panel stays clickable, so focus can sit outside the dialog.
function onWindowKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !event.defaultPrevented && open.value) close()
}
onMounted(() => window.addEventListener('keydown', onWindowKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onWindowKeydown))

// The live region is empty on the render that mounts the dialog and gets its text on the next tick, so it is a change that is announced.
const announcement = ref('')
watch(open, async (isOpen) => {
  announcement.value = ''
  if (!isOpen) return
  await nextTick()
  announcement.value = model.value?.live ?? ''
}, { immediate: true })

// useDialog gives focus back to where it was; when that was nothing (the page had no focus), the page's heading takes it (as EventRounds does).
watch(open, async (isOpen, was) => {
  if (isOpen || !was) return
  await nextTick()
  if (!document.activeElement || document.activeElement === document.body) document.querySelector<HTMLElement>('#stage h1')?.focus()
})
</script>

<template>
  <Teleport to="body">
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Escape and the focus trap of the dialog -->
    <div
      v-if="open && model"
      ref="panel"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="headingId"
      class="fixed layer-modal tex-paper animate-enter max-md:inset-0 md:top-[calc(var(--cp-header-h)+var(--cp-bw))] md:right-(--cp-panel-w) md:bottom-0 md:left-0"
      @keydown="onKeydown"
    >
      <IconButton
        :icon="X"
        :label="t('common.close')"
        data-autofocus
        class="absolute top-3 right-3 z-10"
        @click="close"
      />
      <div class="size-full overflow-y-auto">
        <AwardCeremony
          :model="model"
          :heading-id="headingId"
        />
      </div>
      <p
        role="status"
        aria-live="polite"
        class="sr-only"
      >
        {{ announcement }}
      </p>
    </div>
  </Teleport>
</template>
