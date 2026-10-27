<script setup lang="ts">
import { LogOut } from '@lucide/vue'
import { RELEASES } from '~/utils/changelog'

// Avatar menu in the header: who is signed in and „Abmelden“, then a last row with the legal pages (#8),
// Neuigkeiten and the version label, dotted until this device has seen the newest Release (09 § UserMenu).
const { t } = useI18n()
const user = useAuthUser()
const signOut = useSignOut()
const { seen } = useNewsSeen()

const unseen = computed(() => seen.value !== undefined && seen.value !== RELEASES[0]?.version)
const open = ref(false)
const root = useTemplateRef('root')
const name = computed(() => user.value?.displayName ?? user.value?.name ?? '')

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    root.value?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
  }
}

function closeOnOutside(event: Event) {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', closeOnOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutside))
</script>

<template>
  <div
    v-if="user"
    ref="root"
    class="relative flex-none"
    @keydown.esc="open = false"
  >
    <button
      type="button"
      class="group hit-44 grid place-items-center rounded-pill lift"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="t('auth.accountMenu', { name })"
      @click="toggle"
    >
      <UserAvatar
        :name="name"
        :image="user.image"
        :size="40"
      />
      <!-- The opaque avatar covers the button, so the reduced-motion hover tint sits on this layer above it. -->
      <span
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 rounded-pill reduced:group-hover:tint motion-reduce:group-hover:tint"
      />
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="t('auth.accountMenu', { name })"
      class="outline-memphis absolute top-full right-0 mt-2.5 flex w-[340px] max-w-[calc(100vw-28px)] flex-col rounded-lg bg-surface p-1.5 shadow-card"
    >
      <p class="m-0 truncate px-3 pt-2 pb-1.5 text-small font-bold text-ink-2">
        {{ name }}
      </p>
      <button
        type="button"
        role="menuitem"
        class="flex h-control-md items-center gap-2.5 rounded-md px-3 text-left font-bold text-ink hover:tint"
        @click="signOut"
      >
        <AppIcon :icon="LogOut" />
        {{ t('auth.logout') }}
      </button>
      <span class="mx-1 mt-1.5 mb-0.5 border-t-2 border-line-soft" />
      <!-- A click on any link in the row closes the menu. -->
      <div
        class="flex flex-wrap items-center gap-x-3.5 px-2.5"
        @click="open = false"
      >
        <LegalLinks role="menuitem" />
        <VersionLabel
          role="menuitem"
          :unseen="unseen"
          class="ml-auto"
        />
      </div>
    </div>
  </div>
</template>
