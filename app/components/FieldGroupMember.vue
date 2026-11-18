<script setup lang="ts">
// A member of a FieldGroup that is no TextField (the Price source's select, #797): it carries the touch and the
// registration, and hands its field the three things a message needs. `touch` goes on the field's change and blur.
const props = defineProps<{
  /** This member's problem; it shows (in the group's line) once the member was touched or a submit was tried. */
  error?: string
}>()

const { shown, touch } = useTouched()
const message = computed(() => (shown.value ? props.error : undefined))
const groupErrorId = useGroupMember(() => message.value)
</script>

<template>
  <slot
    :invalid="Boolean(message)"
    :described-by="message ? (groupErrorId ?? undefined) : undefined"
    :touch="touch"
  />
</template>
