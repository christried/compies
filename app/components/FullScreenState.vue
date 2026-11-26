<script setup lang="ts">
// Full-page system states (screen 31) in the bare shell. Focus goes to the title on mount, and the
// tab title names the state, over whatever the page around it set.
import type { CompibertMood } from '~/utils/compibert-mood'

type Kind = 'notFound' | 'noPermission' | 'generic' | 'invalid' | 'deleted' | 'removed'
const props = defineProps<{
  kind: Kind
}>()

const { t } = useI18n()
const heading = useTemplateRef('heading')

onMounted(() => heading.value?.focus())

const copy = computed(() => `errorPage.${props.kind}`)

// The head's baked mood (#819): a page that is not there or a link that does not work is confused, a deleted Event sad; the others keep the plain head.
const MOODS: Partial<Record<Kind, CompibertMood>> = { notFound: 'confused', generic: 'confused', invalid: 'confused', deleted: 'sad' }
const mood = computed(() => MOODS[props.kind])

useHead({ title: () => t(`${copy.value}.title`) })
</script>

<template>
  <div class="mx-auto flex max-w-[560px] flex-1 flex-col items-center justify-center gap-3.5 py-10 text-center">
    <div class="w-[140px]">
      <Compibert
        variant="head"
        :mood="mood"
      />
    </div>
    <h1
      ref="heading"
      tabindex="-1"
      class="m-0 text-[36px] leading-none md:text-[44px]"
    >
      {{ t(`${copy}.title`) }}
    </h1>
    <p class="m-0 text-[16px] text-ink-2">
      {{ t(`${copy}.text`) }}
    </p>
    <div class="mt-1.5 flex flex-wrap justify-center gap-2.5">
      <slot name="actions" />
    </div>
  </div>
</template>
