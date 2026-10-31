<script setup lang="ts">
// Layout frame. hub = header + HubNav (bottom tab bar below md); event = header with a title area; bare = header only
// (errors, sign-in). Every page ends with the PageFooter: signed in from md up (the user menu holds its links below md),
// signed out at every width.
// The Event page (#166, 11-event-seite § EventPage) uses more of it: `banner` sits right under the header over the full
// width (the ConnectionBanner), `actions` is the header's right side beside the sound button, `panel` is the side panel
// from md up (340 px, sticky under the header, it scrolls inside; below md there is none), and `tabs` is the phone's bottom
// tab bar. With a panel the page lays out its own stage (padding, width), because it knows its blocks.
withDefaults(defineProps<{
  kind?: 'hub' | 'event' | 'bare'
  /** The stage fills the frame edge to edge, without padding or max width (sign-in, setup). */
  flush?: boolean
  /** A hub page that is a task, not a place, leaves out the phone tab bar (screen M2). */
  noTabs?: boolean
}>(), { kind: 'hub', flush: false, noTabs: false })

const { t } = useI18n()
const user = useAuthUser()
</script>

<template>
  <div class="tex-paper flex min-h-dvh flex-col text-ink">
    <a
      href="#stage"
      class="fixed top-2 left-2 layer-toast -translate-y-24 rounded-pill bg-primary px-4 py-2 font-extrabold text-on-primary focus:translate-y-0"
    >{{ t('app.skipToStage') }}</a>

    <AppHeader
      :kind="kind"
      :flush="flush"
    >
      <template #title>
        <slot name="title" />
      </template>
      <template #actions>
        <slot name="actions" />
      </template>
    </AppHeader>

    <slot name="banner" />

    <div class="flex flex-1 items-stretch">
      <div class="flex min-w-0 flex-1 flex-col">
        <main
          id="stage"
          tabindex="-1"
          class="flex w-full flex-1 flex-col"
          :class="!flush && !$slots.panel && 'mx-auto max-w-[1100px] px-3.5 pt-3.5 pb-5 md:px-6 md:pt-5'"
        >
          <slot />
        </main>

        <PageFooter :class="user && 'max-md:hidden'" />
      </div>

      <aside
        v-if="$slots.panel"
        :aria-label="t('app.sidePanel')"
        class="sticky top-[calc(var(--cp-header-h)+var(--cp-bw))] hidden h-[calc(100dvh-var(--cp-header-h)-var(--cp-bw))] w-panel flex-none flex-col self-start border-l-(length:--cp-bw) border-line bg-surface md:flex"
      >
        <slot name="panel" />
      </aside>
    </div>

    <HubNav
      v-if="kind === 'hub' && !noTabs"
      layout="tabs"
      :viewer="user"
      class="sticky bottom-0 layer-sticky md:hidden"
    />
    <div
      v-if="$slots.tabs"
      class="sticky bottom-0 layer-sticky md:hidden"
    >
      <slot name="tabs" />
    </div>
  </div>
</template>
