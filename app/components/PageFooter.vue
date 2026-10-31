<script setup lang="ts">
import { RELEASES } from '~/utils/changelog'
import { reducedMotion } from '~/utils/motion'

// The footer on every page (10-footer-und-anmerkungen § PageFooter): „Impressum ◆ Datenschutz ● Version x.y.z“,
// the version being the newest Release (Neuigkeiten). The NEU chip shows for a signed-in User until this device
// has seen that Release. `menu` is the same row inside UserMenu, below md (the menu closes on a click).
const props = withDefaults(defineProps<{ variant?: 'page' | 'menu' }>(), { variant: 'page' })

const { t } = useI18n()
const route = useRoute()
const user = useAuthUser()
const { seen } = useNewsSeen()
const { docked } = useHostDock()

const version = RELEASES[0]?.version
const page = computed(() => props.variant === 'page')
// Undefined until mounted, so the server render and the first paint show no chip.
const unseen = computed(() => !!user.value && seen.value !== undefined && seen.value !== version)

// Link look (10 § PageFooter): the marker is a highlighter that grows on hover and stays on
// the current page; the 44 px hit area comes from the padding.
const LINK = 'inline-block rounded-[8px] px-0.5 py-3 leading-5 font-bold whitespace-nowrap text-ink underline decoration-2 decoration-line-soft underline-offset-[5px] bg-[image:linear-gradient(transparent_55%,var(--cp-primary)_55%)] bg-no-repeat bg-origin-content bg-clip-content bg-[length:0%_100%] transition-[background-size,text-decoration-color] duration-(--cp-dur-base) ease-(--cp-ease-out) hover:bg-[length:100%_100%] hover:text-ink hover:decoration-line motion-reduce:transition-none reduced:transition-none aria-[current=page]:bg-[length:100%_100%] aria-[current=page]:font-extrabold aria-[current=page]:no-underline'

const items = computed(() => [
  { to: '/impressum', text: t('legal.links.impressum'), sep: null },
  { to: '/datenschutz', text: t('legal.links.datenschutz'), sep: 'diamond' },
  { to: '/neuigkeiten', text: null, sep: 'circle' },
] as const)

// On Neuigkeiten the version link goes to the top of the page instead of reloading the list.
function toTop() {
  if (route.path !== '/neuigkeiten') return
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
}
</script>

<template>
  <component
    :is="page ? 'footer' : 'div'"
    v-if="version"
    :class="page ? 'flex flex-none flex-col items-center border-t-(length:--cp-bw) border-line bg-surface px-4 py-1.5' : 'flex flex-wrap items-center gap-x-2 px-1.5'"
    :role="page ? undefined : 'group'"
    :aria-label="page ? undefined : t('legal.nav')"
  >
    <component
      :is="page ? 'nav' : 'div'"
      :aria-label="page ? t('legal.nav') : undefined"
      :class="page ? 'flex flex-wrap items-center justify-center gap-x-3' : 'contents'"
    >
      <span
        v-for="item in items"
        :key="item.to"
        class="inline-flex items-center gap-2 whitespace-nowrap"
      >
        <span
          v-if="item.sep === 'diamond'"
          aria-hidden="true"
          class="size-[9px] flex-none rotate-45 border-2 border-line bg-mint"
        />
        <span
          v-if="item.sep === 'circle'"
          aria-hidden="true"
          class="size-[9px] flex-none rounded-full border-2 border-line bg-primary"
        />
        <NuxtLink
          :to="item.to"
          :role="page ? undefined : 'menuitem'"
          :aria-current="route.path === item.to ? 'page' : undefined"
          :aria-label="item.to === '/neuigkeiten' && unseen ? t('news.versionUnseen', { v: version }) : undefined"
          :class="[LINK, page ? 'text-[14px]' : 'text-[13px]']"
          @click="item.to === '/neuigkeiten' && toTop()"
        >
          <template v-if="item.to === '/neuigkeiten'">
            <i18n-t
              keypath="legal.links.version"
              scope="global"
              tag="span"
            >
              <template #v>
                <span class="font-num text-[13px] font-normal tracking-[.02em]">{{ version }}</span>
              </template>
            </i18n-t><NewChip v-if="unseen" />
          </template>
          <template v-else>
            {{ item.text }}
          </template>
        </NuxtLink>
      </span>
    </component>
    <!-- Room for the dock and for the reason bubble above its disabled primary (#166). -->
    <span
      v-if="page && docked"
      aria-hidden="true"
      class="h-32 flex-none"
    />
  </component>
</template>
