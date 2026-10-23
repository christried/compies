<script setup lang="ts">
// Layout frame. hub = header + HubNav (bottom tab bar below md); session = header with a
// title area and no side panel in the MVP; bare = header only (errors, sign-in).
withDefaults(defineProps<{
  kind?: 'hub' | 'session' | 'bare'
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
    </AppHeader>

    <main
      id="stage"
      tabindex="-1"
      class="flex w-full flex-1 flex-col"
      :class="!flush && 'mx-auto max-w-[1100px] px-3.5 pt-3.5 pb-5 md:px-6 md:pt-5'"
    >
      <slot />
    </main>

    <HubNav
      v-if="kind === 'hub' && !noTabs"
      layout="tabs"
      :can-host="user?.canHost"
      :is-admin="user?.isAdmin"
      class="sticky bottom-0 layer-sticky md:hidden"
    />
  </div>
</template>
