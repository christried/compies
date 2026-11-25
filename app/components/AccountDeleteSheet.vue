<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import type { HostedCounts } from '~~/shared/auth'

// The sheet of „Konto löschen“ (#918, spec #907, ADR 0020), a second copy of EventDeleteSheet's shape on purpose: its text, its read of two numbers and its notice differ.
// It names what goes (five lines, then the Host's Events and the library once the numbers are known) and what stays, and the hold stays unusable until the numbers
// are there, so nobody confirms before the sheet says what goes. The section owns the deletion (`remove`) and the read; a refusal keeps the sheet open.
defineProps<{
  open: boolean
  /** What the deletion takes beyond the account; null until the read answered. */
  hosted: HostedCounts | null
  hostedFailed: boolean
  /** The last deletion was refused. */
  failed: boolean
  /** Sends the deletion; resolves to whether the server took it (the hold goes back to idle on false). */
  remove: () => Promise<boolean>
}>()

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const goes = ['goesProfile', 'goesLink', 'goesMessages', 'goesVotes', 'goesTeamWord'] as const
</script>

<template>
  <AppSheet
    :open="open"
    :title="t('accountDelete.sheetTitle')"
    @close="emit('close')"
  >
    <div class="flex flex-col gap-2 text-[14px] text-ink-2">
      <p class="m-0 font-bold text-ink">
        {{ t('accountDelete.goes') }}
      </p>
      <ul class="m-0 flex list-disc flex-col gap-1 pl-5">
        <li
          v-for="line in goes"
          :key="line"
        >
          {{ t(`accountDelete.${line}`) }}
        </li>
      </ul>
    </div>

    <p
      v-if="hosted && hosted.events > 0"
      class="m-0 text-[14px] text-pretty text-ink-2"
    >
      {{ t('accountDelete.hosting', { n: hosted.events }, hosted.events) }}
    </p>
    <p
      v-if="hosted && hosted.games > 0"
      class="m-0 text-[14px] text-pretty text-ink-2"
    >
      {{ t('accountDelete.library') }}
    </p>

    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t('accountDelete.stays', { name: t('common.deletedUser') }) }}
    </p>
    <p class="m-0 text-[14px] font-bold text-pretty text-ink">
      {{ t('accountDelete.final') }}
    </p>

    <NoticeBanner
      v-if="failed"
      tone="critical"
    >
      {{ t('accountDelete.failed') }}
    </NoticeBanner>

    <HoldToConfirmButton
      variant="hot"
      :icon="Trash2"
      :label="t('accountDelete.hold')"
      :action="remove"
      :disabled="hosted === null"
      :disabled-reason="hostedFailed ? t('accountDelete.countFailed') : hosted === null ? t('accountDelete.counting') : undefined"
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
