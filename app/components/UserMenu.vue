<script setup lang="ts">
import { LogOut } from '@lucide/vue'

// Avatar menu in the header: who is signed in, the legal pages (#8), and „Abmelden“.
const { t } = useI18n()
const user = useAuthUser()
const signOut = useSignOut()

const legalPages = ['impressum', 'datenschutz'] as const
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
      class="hit-44 grid place-items-center rounded-pill"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="t('auth.accountMenu', { name })"
      @click="toggle"
    >
      <UserAvatar
        :name="name"
        :image="user.image"
        :size="32"
      />
    </button>

    <div
      v-if="open"
      role="menu"
      :aria-label="t('auth.accountMenu', { name })"
      class="outline-memphis absolute top-full right-0 mt-2.5 flex min-w-[220px] flex-col rounded-lg bg-surface p-1.5 shadow-card"
    >
      <p class="m-0 truncate px-3 pt-2 pb-1.5 text-small font-bold text-ink-2">
        {{ name }}
      </p>
      <NuxtLink
        v-for="page in legalPages"
        :key="page"
        :to="`/${page}`"
        role="menuitem"
        class="flex h-control-md items-center rounded-md px-3 font-bold text-ink no-underline hover:bg-paper-2"
        @click="open = false"
      >
        {{ t(`legal.links.${page}`) }}
      </NuxtLink>
      <button
        type="button"
        role="menuitem"
        class="flex h-control-md items-center gap-2.5 rounded-md px-3 text-left font-bold text-ink hover:bg-paper-2"
        @click="signOut"
      >
        <AppIcon :icon="LogOut" />
        {{ t('auth.logout') }}
      </button>
    </div>
  </div>
</template>
