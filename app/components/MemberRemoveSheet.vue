<script setup lang="ts">
import { UserMinus } from '@lucide/vue'

// The removal sheet (#896, spec #894): the Host takes a Member out of the Event with a one second hold, the pattern of EventDeleteSheet, and
// decides in the same step whether the Invite link is renewed (on by default: the person may still hold the old one). The sheet owns the switch;
// the board owns the request (`remove`), which resolves to whether the server took it, so a refusal sends the hold back to idle and keeps the sheet open.
const props = defineProps<{
  open: boolean
  /** The person's shown name, for the title and the switch's description. */
  name: string
  /** Sends the removal with the switch's value; resolves to whether the server took it. */
  remove: (rotateInvite: boolean) => Promise<boolean>
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const rotate = ref(true)

// Every opening starts with the switch on again (as InviteSheet resets its state).
watch(() => props.open, (open) => {
  if (open) rotate.value = true
})
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('board.remove.title', { name })"
    @close="emit('close')"
  >
    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t('board.remove.text') }}
    </p>

    <ToggleSwitch
      v-model="rotate"
      :label="t('board.remove.rotate')"
      :help="rotate ? t('invite.rotateText') : t('board.remove.rotateOff', { name })"
    />

    <HoldToConfirmButton
      variant="hot"
      :label="t('board.remove.hold')"
      :icon="UserMinus"
      :action="() => remove(rotate)"
    />

    <AppButton
      variant="secondary"
      class="self-start"
      @click="emit('close')"
    >
      {{ t('common.cancel') }}
    </AppButton>
  </AppSheet>
</template>
