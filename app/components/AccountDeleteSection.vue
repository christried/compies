<script setup lang="ts">
import { Trash2 } from '@lucide/vue'

// „Konto löschen“ below „Abmelden“ on the Profil page (#918, spec #907): a heading, a short text and the button that opens the sheet. No card and no primary button:
// the rule above keeps it apart from „Abmelden“. The click opens the sheet and reads what the deletion takes with it; the sheet's hold runs the deletion.
const { t } = useI18n()
const { hosted, hostedFailed, failed, load, remove } = useAccountDelete()
const open = ref(false)

function openSheet() {
  open.value = true
  void load()
}
</script>

<template>
  <section
    aria-labelledby="account-delete-title"
    class="flex flex-col items-start gap-3 border-t-(length:--cp-bw) border-line-soft pt-4"
  >
    <h2
      id="account-delete-title"
      class="m-0 text-[20px]"
    >
      {{ t('accountDelete.title') }}
    </h2>
    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t('accountDelete.text') }}
    </p>
    <AppButton
      variant="secondary"
      @click="openSheet"
    >
      <template #icon>
        <AppIcon
          :icon="Trash2"
          :size="14"
        />
      </template>
      {{ t('accountDelete.open') }}
    </AppButton>

    <AccountDeleteSheet
      :open="open"
      :hosted="hosted"
      :hosted-failed="hostedFailed"
      :failed="failed"
      :remove="remove"
      @close="open = false"
    />
  </section>
</template>
