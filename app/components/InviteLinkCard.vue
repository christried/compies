<script setup lang="ts">
import { Copy } from '@lucide/vue'

// The Invite link with a copy button (02-components § InviteLinkCard). The confirmation is a
// toast, which screen readers announce. Rotating the link arrives with the invite sheet (#16).
const props = defineProps<{ url: string }>()

const { t } = useI18n()
const { toast } = useToast()

async function copy() {
  try {
    await navigator.clipboard.writeText(props.url)
    toast({ tone: 'success', text: t('invite.copied') })
  }
  catch {
    toast({ tone: 'error', text: t('invite.copyFailed') })
  }
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <span class="flex h-[52px] min-w-[200px] flex-1 items-center overflow-hidden rounded-md border-(length:--cp-bw) border-line bg-paper-2 px-3.5 font-mono text-[14px] text-ellipsis whitespace-nowrap text-ink">
      {{ url }}
    </span>
    <AppButton
      size="lg"
      @click="copy"
    >
      <template #icon>
        <AppIcon :icon="Copy" />
      </template>
      {{ t('mvp.create.copyLink') }}
    </AppButton>
  </div>
</template>
