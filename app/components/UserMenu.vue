<script setup lang="ts">
import { LogOut } from '@lucide/vue'
import { shownName } from '~~/shared/auth'

// Avatar menu in the header (09 § UserMenu, 10 § UserMenu): who is signed in and „Abmelden“. Below md the
// page footer's links follow below a divider (PageFooter variant menu); a click on one of them closes the menu.
// Arrow keys move through the visible items, Esc closes and gives focus back to the avatar.
const { t } = useI18n()
const user = useAuthUser()
const signOut = useSignOut()

const open = ref(false)
const root = useTemplateRef('root')
const trigger = useTemplateRef('trigger')
const name = computed(() => (user.value ? shownName(user.value) : ''))

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    menuItems()[0]?.focus()
  }
}

function close() {
  open.value = false
  trigger.value?.focus()
}

// Items hidden by CSS (the footer links below md, on desktop) are skipped.
function menuItems() {
  return [...(root.value?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    .filter(item => item.checkVisibility?.() ?? true)
}

function move(step: 1 | -1, event: KeyboardEvent) {
  const items = menuItems()
  if (!items.length) return
  event.preventDefault()
  const index = items.indexOf(document.activeElement as HTMLElement)
  const next = index < 0 ? (step > 0 ? 0 : items.length - 1) : (index + step + items.length) % items.length
  items[next]!.focus()
}

function closeOnOutside(event: Event) {
  if (open.value && !root.value?.contains(event.target as Node)) open.value = false
}

onMounted(() => document.addEventListener('pointerdown', closeOnOutside))
onBeforeUnmount(() => document.removeEventListener('pointerdown', closeOnOutside))
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- arrow keys and Escape for the menu items -->
  <div
    v-if="user"
    ref="root"
    class="relative flex-none"
    @keydown.esc="close"
    @keydown.down="move(1, $event)"
    @keydown.up="move(-1, $event)"
  >
    <button
      ref="trigger"
      type="button"
      class="group hit-44 grid place-items-center rounded-pill lift aria-expanded:ring-2 aria-expanded:ring-line"
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
      class="outline-memphis absolute top-full right-0 mt-2.5 flex w-[280px] flex-col rounded-[16px] bg-surface p-2 shadow-card max-md:fixed max-md:inset-x-3 max-md:top-16 max-md:mt-0 max-md:w-auto"
    >
      <div
        role="none"
        class="flex items-center gap-2.5 px-2 py-1.5"
      >
        <UserAvatar
          :name="name"
          :image="user.image"
          :size="40"
        />
        <span class="min-w-0 truncate text-[16px] font-extrabold">{{ name }}</span>
      </div>
      <span class="mx-1 my-1.5 border-t-2 border-line-soft" />
      <button
        type="button"
        role="menuitem"
        class="flex h-11 items-center gap-2.5 rounded-md px-3 text-left text-[15px] font-bold text-ink hover:bg-paper-2"
        @click="signOut"
      >
        <AppIcon :icon="LogOut" />
        {{ t('auth.logout') }}
      </button>
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions, vuejs-accessibility/click-events-have-key-events -- closes the menu after a click on a footer link inside -->
      <div
        class="md:hidden"
        @click="open = false"
      >
        <span class="mx-1 my-1.5 block border-t-2 border-line-soft" />
        <PageFooter variant="menu" />
      </div>
    </div>
  </div>
</template>
