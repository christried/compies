<script setup lang="ts">
// The Clip's backdrop (#587, 02-components § ClipPlayer): while a Clip shows on this device, the page behind it goes close to black.
// It is an element of its own, outside the Clip's section: nothing may be laid over the YouTube player, and the backdrop is a sibling,
// not a layer of it. It has no state and no instant of its own: the page passes `shown` on from the overlay (the read that carries the
// Clip starts it, the Clip's ticker or the skip's read ends it, „Für mich schließen“ ends it at once). A click on it does nothing.
// What lies under it takes no input either: AppShell makes those regions `inert`, this only stops the pointer and the scroll.
const props = defineProps<{
  shown: boolean
}>()

// The page does not scroll behind the backdrop, as the Clip's own box would not let it either. No sheet locks scroll, so this is the
// one place that does; the class goes at the start of the fade-out, so the page is usable again at once.
// `overflow-hidden` takes a classic scrollbar away (Windows), and the page and every fixed element would move by its width at the
// Clip's start and back at its end (#658). So a page that scrolls, which shows that scrollbar, keeps its place as a gutter while locked
// (`scroll-gutter`). It is read before the lock; a page that does not scroll, or a device with overlay scrollbars, has none to keep.
const LOCK = ['overflow-hidden', 'scroll-gutter']
watch(() => props.shown, (value) => {
  if (!import.meta.client) return
  const root = document.documentElement
  if (value) {
    const scrolls = window.innerWidth > root.clientWidth
    root.classList.add('overflow-hidden')
    root.classList.toggle('scroll-gutter', scrolls)
  }
  else root.classList.remove(...LOCK)
}, { immediate: true, flush: 'post' })

onBeforeUnmount(() => {
  if (import.meta.client) document.documentElement.classList.remove(...LOCK)
})
</script>

<template>
  <!-- The enter is the Clip's own duration and curve with opacity only: a full-viewport layer scaled to .96 would show a strip of page at its edge. -->
  <Transition
    enter-active-class="animate-backdrop-in"
    leave-active-class="transition-opacity dur-base ease-in"
    leave-to-class="opacity-0"
  >
    <div
      v-if="shown"
      data-testid="clip-backdrop"
      aria-hidden="true"
      class="fixed inset-0 layer-backdrop touch-none bg-backdrop"
    />
  </Transition>
</template>
