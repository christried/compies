<script setup lang="ts">
import { Check, Minus, Plus, RefreshCw, Shield } from '@lucide/vue'
import type { ChangeGroup } from '~~/shared/changelog'

// One Keep-a-Changelog group of a Release (09 § ChangeGroup): a tilted label pill, then the list with one
// nested level. Each group differs in colour, icon and bullet shape, never colour alone.
const props = defineProps<{ group: ChangeGroup }>()

const STYLES = {
  neu: { icon: Plus, pill: 'bg-primary text-on-primary rotate-[-2deg]', bullet: 'mt-[7px] size-3 rounded-pill border-2 bg-primary', child: 'mt-2 ml-px size-[9px] rounded-pill bg-surface' },
  geaendert: { icon: RefreshCw, pill: 'bg-info text-on-info rotate-[1.5deg]', bullet: 'mt-2 ml-px size-2.5 rotate-45 rounded-[2px] border-2 bg-info', child: 'mt-[9px] ml-0.5 size-2 rotate-45 rounded-[2px] bg-surface' },
  behoben: { icon: Check, pill: 'bg-success text-on-success rotate-[-1.5deg]', bullet: 'mt-[7px] size-[11px] rounded-[2px] border-2 bg-success', child: 'mt-2 ml-px size-2 rounded-[2px] bg-surface' },
  entfernt: { icon: Minus, pill: 'bg-hot text-on-hot rotate-2', bullet: 'mt-[9px] h-[7px] w-[15px] rounded-pill border-2 bg-hot', child: 'mt-2.5 ml-px h-[5px] w-[11px] rounded-pill bg-surface' },
  sicherheit: { icon: Shield, pill: 'bg-ink text-paper rotate-[-1deg]', bullet: 'mt-[7px] size-3 rounded-pill border-[3px] bg-surface', child: 'mt-2 ml-px size-[9px] rounded-pill bg-ink' },
}

const style = computed(() => STYLES[props.group.type])
</script>

<template>
  <div>
    <h3 class="m-0 mb-3.5 flex items-center gap-3">
      <span
        class="outline-memphis inline-flex h-9 flex-none items-center gap-2 rounded-pill pr-3.5 pl-1 font-display text-[20px] leading-none shadow-sm"
        :class="style.pill"
      >
        <span
          aria-hidden="true"
          class="grid size-6 place-items-center rounded-pill border-2 border-line bg-surface text-ink"
        >
          <AppIcon
            :icon="style.icon"
            :size="13"
          />
        </span>
        {{ group.name }}
      </span>
      <span
        aria-hidden="true"
        class="h-0 flex-1 border-t-2 border-dashed border-line-soft"
      />
    </h3>
    <ul class="m-0 flex list-none flex-col gap-2.5 p-0">
      <li
        v-for="(item, i) in group.items"
        :key="i"
        class="grid grid-cols-[26px_minmax(0,1fr)] text-[16px] leading-normal md:text-[17px]"
      >
        <span
          aria-hidden="true"
          class="box-border border-line"
          :class="style.bullet"
        />
        <div class="max-w-[64ch] min-w-0">
          <ChangelogInline :nodes="item.inline" />
          <ul
            v-if="item.children.length"
            class="m-0 mt-1.5 flex list-none flex-col gap-1.5 p-0"
          >
            <li
              v-for="(child, j) in item.children"
              :key="j"
              class="grid grid-cols-[22px_minmax(0,1fr)]"
            >
              <span
                aria-hidden="true"
                class="box-border border-2 border-line"
                :class="style.child"
              />
              <span class="min-w-0"><ChangelogInline :nodes="child" /></span>
            </li>
          </ul>
        </div>
      </li>
    </ul>
  </div>
</template>
