<script setup lang="ts">
import { LogOut, User } from '@lucide/vue'
import { shownName } from '~~/shared/auth'

// Avatar menu in the header (09 § UserMenu, 10 § UserMenu): who is signed in and „Abmelden“. Below md the
// page footer's links follow below a divider (PageFooter variant menu); a click on one of them closes the menu. Below md it also
// holds the row „Darstellung“ (the Profil page's SegmentedControl, #617), because the header's Appearance button is from md up only.
// Arrow keys move through the visible items (the row's selected radio is one step), Esc closes and gives focus back to the avatar.
const { t } = useI18n()
const user = useAuthUser()
const signOut = useSignOut()
const appearance = useAppearance({ toast: true })

// A freshly opened menu focuses „Profil“, not the row above it.
const { open, toggle, close, move, menuItems } = useDropdownMenu({
  itemSelector: '[role="menuitem"], [role="radio"][tabindex="0"]',
  initialFocus: () => menuItems().find(item => item.getAttribute('role') === 'menuitem'),
})
const name = computed(() => (user.value ? shownName(user.value) : ''))
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
      <!-- Below md the Appearance row (#617); a choice keeps the menu open, it is a control and not a pick list. -->
      <div
        role="none"
        class="flex flex-col gap-1.5 px-2 pt-1 pb-1.5 md:hidden"
      >
        <span
          aria-hidden="true"
          class="text-[13px] font-bold text-ink-2"
        >{{ t('settings.appearance') }}</span>
        <SegmentedControl
          :model-value="appearance.appearance.value"
          :options="appearance.choices.value"
          :label="t('settings.appearance')"
          arrows="horizontal"
          @update:model-value="appearance.choose"
        />
      </div>
      <span class="mx-1 my-1.5 block border-t-2 border-line-soft md:hidden" />
      <!-- „Profil“ (#618): the hub nav's Profil item, at every width; a click closes the menu. -->
      <NuxtLink
        to="/profil"
        role="menuitem"
        class="flex h-11 items-center gap-2.5 rounded-md px-3 text-left text-[15px] font-bold text-ink hover:bg-paper-2"
        @click="open = false"
      >
        <AppIcon :icon="User" />
        {{ t('nav.profile') }}
      </NuxtLink>
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
