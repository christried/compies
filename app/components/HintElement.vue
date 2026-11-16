<script setup lang="ts">
import { QuestionMark } from '~/utils/question-mark-icon'

// The hint element (#515, 02-components § HintElement): a round „?“, one circle (the button's own), that opens a popover with a short text
// or its slot. It opens by the shared reveal behaviour (#616, useRevealPopover): mouse hover, focus; a click pins it. The popover is a
// RevealPopover, in the look and on the layer of the Notes popover (GameNotesButton). The native tooltip is off: a mouse resting on the „?“
// would show it next to the popover. One root element, so the caller's class (where it sits, on which pointers it shows: #465) lands on it.
const props = withDefaults(defineProps<{
  /** The button's accessible name; „Hinweis anzeigen“ when left out. */
  label?: string
  /** The short text; a default slot replaces it. */
  text?: string
  /** The button's visual diameter. */
  size?: 32 | 36 | 40
}>(), { label: undefined, text: undefined, size: 32 })

const { t } = useI18n()
const button = useTemplateRef<{ $el: HTMLElement }>('button')
const triggerEl = computed(() => button.value?.$el ?? null)
const { open, triggerAttrs, popoverAttrs } = useRevealPopover(triggerEl)
</script>

<template>
  <span class="inline-flex">
    <IconButton
      ref="button"
      :icon="QuestionMark"
      :label="props.label ?? t('hint.open')"
      :size="size"
      :tooltip="false"
      v-bind="triggerAttrs"
    />
    <RevealPopover
      :open="open"
      :anchor="triggerEl"
      v-bind="popoverAttrs"
    >
      <slot>{{ text }}</slot>
    </RevealPopover>
  </span>
</template>
