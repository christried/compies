<script setup lang="ts">
import { Check, RefreshCw, X } from '@lucide/vue'

// The Invite sheet (#16, 02-components § Sheet, screen 06 `App Einstieg ?s=invite`). The Host shares the
// Invite link here and can rotate it when it leaks. Rotating asks first and needs a one second hold.
// The old link stops working at once; Members stay in. The page renders this only for the Host, because
// only the Host's read gets the link (ADR 0006).

const props = defineProps<{
  open: boolean
  slug: string
  url: string
}>()

const emit = defineEmits<{ close: [], rotated: [url: string] }>()

const { t } = useI18n()
const { toast } = useToast()
const current = ref(props.url)
const confirming = ref(false)
const rotated = ref(false)
/** Bumped after a failed rotation so the hold button starts again from zero. */
const attempt = ref(0)

watch(() => props.url, (url) => {
  current.value = url
})

watch(() => props.open, (open) => {
  if (!open) return
  confirming.value = false
  rotated.value = false
})

async function rotate() {
  try {
    const { inviteUrl } = await $fetch<{ inviteUrl: string }>(`/api/s/${props.slug}/rotate`, { method: 'POST' })
    current.value = inviteUrl
    rotated.value = true
    confirming.value = false
    emit('rotated', inviteUrl)
  }
  catch {
    attempt.value += 1
    toast({ tone: 'error', text: t('error.saveFailed') })
  }
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

      <div
        v-if="rotated"
        role="status"
        class="flex items-center gap-2.5 rounded-[12px] border-2 border-line bg-paper-2 p-3 text-[14px]"
      >
        <span class="grid size-[26px] flex-none place-items-center rounded-full border-2 border-line bg-success text-on-success">
          <AppIcon
            :icon="Check"
            :size="13"
          />
        </span>
        <span>
          <b>{{ t('invite.renewed') }}</b> {{ t('invite.renewedText') }}
        </span>
      </div>

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
        :key="attempt"
        variant="hot"
        :label="t('invite.renew')"
        :icon="RefreshCw"
        @confirm="rotate"
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
