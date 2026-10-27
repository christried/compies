<script setup lang="ts">
import { VOTE_VALUES } from '~~/shared/poll'
import { VOTE_LOOK } from '~/utils/vote-look'

// What the three vote options promise (#50): shown above the Slot cards during the Date poll, each
// in the option's own look. One line on desktop, stacked on phones. Meh is text only, no icon.
const { t } = useI18n()

const items = computed(() => VOTE_VALUES.map(value => ({ key: value, label: t(VOTE_LOOK[value].labelKey), promise: t(`poll.legend.${value}`), icon: VOTE_LOOK[value].icon, look: VOTE_LOOK[value].fill })))
</script>

<template>
  <ul
    data-testid="vote-legend"
    class="m-0 flex list-none flex-col gap-2 p-0 text-[13px] md:flex-row md:flex-wrap md:gap-x-5"
  >
    <li
      v-for="item in items"
      :key="item.key"
      class="flex items-center gap-2"
    >
      <span
        class="inline-flex h-6 items-center gap-1 rounded-pill border-2 border-line px-2 text-[12px] font-bold"
        :class="item.look"
      >
        <AppIcon
          v-if="item.icon"
          :icon="item.icon"
          :size="11"
        />
        {{ item.label }}
      </span>
      <span>{{ item.promise }}</span>
    </li>
  </ul>
</template>
