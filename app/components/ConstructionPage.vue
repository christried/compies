<script setup lang="ts">
import { CalendarDays, House } from '@lucide/vue'
import type { ConstructionArea } from '~/utils/construction'

// Full page for every route that is not built yet (M4). The CTA leads to the User's latest open
// poll when they have one (`latestPollSlug`), otherwise to Home.
const props = withDefaults(defineProps<{
  area: ConstructionArea
  latestPollSlug?: string | null
}>(), { latestPollSlug: null })

const { t } = useI18n()
const cta = computed(() => props.latestPollSlug
  ? { to: `/e/${props.latestPollSlug}`, label: t('mvp.site.toPoll'), icon: CalendarDays }
  : { to: '/', label: t('mvp.site.toHome'), icon: House })
const heading = useTemplateRef('heading')
const nuxtApp = useNuxtApp()

// Focus the title after client-side navigation, not on the first page load.
onMounted(() => {
  if (!nuxtApp.isHydrating) heading.value?.focus()
})
</script>

<template>
  <div class="outline-memphis relative flex min-h-[686px] flex-1 flex-col overflow-hidden rounded-xl bg-paper-2 text-ink max-md:min-h-[640px]">
    <ConstructionTape variant="hero" />

    <div class="relative layer-sticky flex flex-1 items-center justify-center gap-12 px-12 pt-24 pb-3 max-md:flex-col max-md:gap-3.5 max-md:px-[18px] max-md:pt-22 max-md:pb-2">
      <div class="w-[250px] flex-none max-md:w-[170px]">
        <Compibert
          variant="full"
          accessory="hardhat"
        />
      </div>

      <div class="flex max-w-[520px] flex-col items-start gap-3 text-left max-md:items-center max-md:text-center">
        <ConstructionChip size="md">
          {{ t('mvp.zone.chip') }}
        </ConstructionChip>
        <h1
          ref="heading"
          tabindex="-1"
          class="m-0 text-[56px] leading-[.98] max-md:text-[36px]"
        >
          {{ t(`mvp.site.${area}.title`) }}
        </h1>
        <p class="m-0 text-[16px] leading-normal text-ink-2">
          {{ t(`mvp.site.${area}.text`) }}
        </p>
        <div class="mt-1.5 flex flex-wrap gap-2.5 max-md:justify-center">
          <AppButton
            :to="cta.to"
            size="lg"
          >
            <template #icon>
              <AppIcon :icon="cta.icon" />
            </template>
            {{ cta.label }}
          </AppButton>
          <slot name="secondary" />
        </div>
      </div>
    </div>

    <ConstructionGround
      variant="hero"
      sign
    />
  </div>
</template>
