<script setup lang="ts">
import { Check, Copy } from '@lucide/vue'

// The Invite link with a copy button (02-components § InviteLinkCard, `App Einstieg ?s=invite`). Once
// copied, the button reads „Kopiert“ with a check (state `copied`, #1 story 30) until the link changes,
// and a toast announces it to screen readers.
const props = defineProps<{ url: string }>()

const { t } = useI18n()
const { toast } = useToast()
const copied = ref(false)

watch(() => props.url, () => {
  copied.value = false
})

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url)
    copied.value = true
    toast({ tone: 'success', text: t('invite.copied') })
  }
  catch {
    toast({ tone: 'error', text: t('invite.copyFailed') })
  }
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <!-- A read-only field: a click selects the whole link, and it can be scrolled and selected by hand. -->
    <input
      type="text"
      readonly
      :value="url"
      :aria-label="t('invite.linkLabel')"
      class="h-[52px] min-w-[200px] flex-1 rounded-md border-(length:--cp-bw) border-line bg-paper-2 px-3.5 font-mono text-[14px] text-ink"
      @click="($event.target as HTMLInputElement).select()"
    >
    <AppButton
      size="lg"
      @click="copy"
    >
      <template #icon>
        <AppIcon :icon="copied ? Check : Copy" />
      </template>
      {{ copied ? t('invite.copiedShort') : t('mvp.create.copyLink') }}
    </AppButton>
  </div>
</template>
