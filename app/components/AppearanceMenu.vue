<script setup lang="ts">
import { Check } from '@lucide/vue'
import type { Appearance } from '~~/shared/appearance'

// The header's Appearance button (#617, 15 § AppHeader): from md up, a round button whose icon shows the signed-in User's
// Appearance and opens a small menu of the three choices (GLOSSARY § Appearance). Below md it is hidden and the avatar menu
// holds the choice. A choice shows at once, closes the menu and gives the focus back; a failed save is said in a toast.
const { t } = useI18n()
const user = useAuthUser()
const appearance = useAppearance({ toast: true })

// A freshly opened menu focuses the ticked item.
const { open, toggle, close, move, menuItems } = useDropdownMenu({
  itemSelector: '[role="menuitemradio"]',
  initialFocus: () => menuItems().find(item => item.getAttribute('aria-checked') === 'true'),
})

// The tapped item is the origin of the Theme reveal (#931), handed over before the menu closes: the menu is gone on the next
// render, and a removed element has an empty rect.
function choose(value: Appearance, event: MouseEvent) {
  void appearance.choose(value, event.currentTarget as HTMLElement)
  close()
}
</script>

<template>
  <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- arrow keys and Escape for the menu items -->
  <div
    v-if="user"
    ref="root"
    class="relative flex-none max-md:hidden"
    @keydown.esc="close"
    @keydown.down="move(1, $event)"
    @keydown.up="move(-1, $event)"
  >
    <IconButton
      :icon="appearance.icons[appearance.appearance.value]"
      :label="t('settings.appearance')"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    />

    <div
      v-if="open"
      role="menu"
      :aria-label="t('settings.appearance')"
      class="outline-memphis absolute top-full right-0 mt-2.5 flex w-[200px] flex-col rounded-[16px] bg-surface p-2 shadow-card"
    >
      <button
        v-for="option in appearance.choices.value"
        :key="option.value"
        type="button"
        role="menuitemradio"
        :aria-checked="option.value === appearance.appearance.value"
        class="flex h-11 items-center gap-2.5 rounded-md px-3 text-left text-[15px] font-bold text-ink hover:bg-paper-2"
        @click="choose(option.value, $event)"
      >
        <AppIcon :icon="appearance.icons[option.value]" />
        {{ option.label }}
        <AppIcon
          v-if="option.value === appearance.appearance.value"
          :icon="Check"
          class="ml-auto"
        />
      </button>
    </div>
  </div>
</template>
