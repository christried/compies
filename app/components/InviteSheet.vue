<script setup lang="ts">
import { Check, RefreshCw, X } from '@lucide/vue'
import type { RotatedInvite } from '~~/shared/event'

// The Invite sheet (#16, 02-components § Sheet, screen 06 `App Einstieg ?s=invite`). The Host shares the
// Invite link here and can rotate it when it leaks. Rotating asks first and needs a one second hold.
// The old link stops working at once; Members stay in. The page renders this only for the Host, because
// only the Host's read gets the link (ADR 0006). Rotating goes through the one send (#74); `changed` asks the
// page to refetch afterwards.

const props = defineProps<{
  open: boolean
  slug: string
  url: string
}>()

const emit = defineEmits<{ close: [], changed: [] }>()

const { t } = useI18n()
const { send } = useEventMutation(() => props.slug, () => emit('changed'))
const current = ref(props.url)
const confirming = ref(false)
const rotated = ref(false)

watch(() => props.url, (url) => {
  current.value = url
})

watch(() => props.open, (open) => {
  if (!open) return
  confirming.value = false
  rotated.value = false
})

function rotate() {
  return send<RotatedInvite>('POST', 'rotate', {
    done: ({ inviteUrl }) => {
      current.value = inviteUrl
      rotated.value = true
      confirming.value = false
    },
  })
}
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('invite.title')"
    @close="emit('close')"
  >
    <template v-if="!confirming">
      <p class="m-0 text-[14px] text-pretty text-ink-2">
        {{ t('invite.sheetText') }}
      </p>

      <InviteLinkCard :url="current" />

      <NoticeBanner
        v-if="rotated"
        tone="success"
        :icon="Check"
      >
        <b>{{ t('invite.renewed') }}</b> {{ t('invite.renewedText') }}
      </NoticeBanner>

      <div class="flex flex-wrap items-center gap-3 border-t-2 border-line-soft pt-3">
        <div class="flex min-w-[180px] flex-1 flex-col gap-0.5 text-[13px] leading-snug">
          <b class="text-[14px]">{{ t('invite.leakedTitle') }}</b>
          <span class="text-ink-2">{{ t('invite.rotateText') }}</span>
        </div>
        <AppButton
          variant="secondary"
          size="lg"
          @click="confirming = true"
        >
          <template #icon>
            <AppIcon :icon="RefreshCw" />
          </template>
          {{ t('invite.renew') }}
        </AppButton>
      </div>
    </template>

    <template v-else>
      <h3 class="m-0 font-display text-[26px] leading-none font-normal">
        {{ t('invite.renewTitle') }}
      </h3>

      <ul class="m-0 flex list-none flex-col gap-2 p-0 text-[14px]">
        <li class="flex gap-2">
          <AppIcon
            :icon="X"
            :size="16"
          />
          {{ t('invite.renewOld') }}
        </li>
        <li class="flex gap-2">
          <AppIcon
            :icon="Check"
            :size="16"
          />
          {{ t('invite.renewMembers') }}
        </li>
        <li class="flex gap-2">
          <AppIcon
            :icon="Check"
            :size="16"
          />
          {{ t('invite.renewShare') }}
        </li>
      </ul>

      <HoldToConfirmButton
        variant="hot"
        :label="t('invite.renew')"
        :icon="RefreshCw"
        :action="rotate"
      />

      <AppButton
        variant="secondary"
        class="self-start"
        @click="confirming = false"
      >
        {{ t('common.cancel') }}
      </AppButton>
    </template>
  </AppSheet>
</template>
