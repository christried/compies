<script setup lang="ts">
import { formatReleaseDate, RELEASES } from '~/utils/changelog'

// The Release navigation on Neuigkeiten: the sticky rail from md up (09 § ReleaseRail), the jump strip below
// (09 § ReleaseJumpStrip). Both link to `#<version>` and leave the scrolling to the page through `jump`.
defineProps<{
  variant: 'rail' | 'strip'
  /** The Release in view, marked in the rail. */
  current?: string
}>()
const emit = defineEmits<{ jump: [version: string] }>()

const { t } = useI18n()

const items = RELEASES.map((release, i) => {
  const date = formatReleaseDate(release.date)
  const newest = i === 0
  const label = t(newest ? 'news.itemNew' : 'news.item', { v: release.version, name: release.name, date })
  return { version: release.version, name: release.name, date, newest, label }
})
</script>

<template>
  <nav
    v-if="variant === 'rail'"
    :aria-label="t('news.rail')"
    class="outline-memphis flex flex-col gap-0.5 rounded-xl bg-surface p-2 shadow-card"
  >
    <span class="label px-3 pt-2 pb-1.5 text-ink-2">{{ t('news.rail') }}</span>
    <a
      v-for="item in items"
      :key="item.version"
      :href="`#${item.version}`"
      :aria-current="item.version === current ? 'true' : undefined"
      :aria-label="item.label"
      class="flex min-h-[58px] flex-col justify-center gap-1 rounded-lg px-3 py-2 no-underline"
      :class="item.version === current ? 'bg-ink text-paper' : 'text-ink hover:bg-paper-2'"
      @click.prevent="emit('jump', item.version)"
    >
      <span class="flex min-w-0 items-baseline gap-2">
        <span class="flex-none font-num text-[15px] leading-none">{{ item.version }}</span>
        <span
          class="min-w-0 truncate text-[14px]"
          :class="item.version === current ? 'font-extrabold' : 'font-bold'"
        >{{ item.name }}</span>
      </span>
      <span
        class="flex items-center gap-1.5 text-[12px] font-semibold"
        :class="item.version !== current && 'text-ink-2'"
      >
        {{ item.date }}
        <span
          v-if="item.newest"
          class="inline-flex h-[18px] items-center rounded-pill bg-primary px-1.5 text-[12px] leading-none font-extrabold text-on-primary"
          :class="item.version !== current && 'border-[1.5px] border-line'"
        >{{ t('news.new') }}</span>
      </span>
    </a>
  </nav>

  <nav
    v-else
    :aria-label="t('news.rail')"
    class="flex flex-col gap-1.5"
  >
    <span class="label text-ink-2">{{ t('news.jump') }}</span>
    <!-- Bleeds to the screen edge over the page padding, without a scrollbar. -->
    <div class="-mx-4 flex gap-2 overflow-x-auto px-4 pt-0.5 pb-2 [scrollbar-width:none]">
      <a
        v-for="item in items"
        :key="item.version"
        :href="`#${item.version}`"
        :aria-label="item.label"
        class="inline-flex h-11 flex-none items-center rounded-pill border-2 border-line px-3.5 font-num text-[14px] leading-none text-ink no-underline shadow-sm"
        :class="item.newest ? 'bg-primary' : 'bg-surface'"
        @click.prevent="emit('jump', item.version)"
      >{{ item.version }}</a>
    </div>
  </nav>
</template>
