<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import type { AdminUserDeletion } from '~~/shared/admin'
import type { HostedCounts } from '~~/shared/auth'

// The sheet of „Konto löschen“ (#918, spec #907, ADR 0020), a second copy of EventDeleteSheet's shape on purpose: its text, its read of two numbers and its notice differ.
// It names what goes (five lines, then the Host's Events and the library once the numbers are known) and what stays, and the hold stays unusable until the numbers
// are there, so nobody confirms before the sheet says what goes. The section owns the deletion (`remove`) and the read; a refusal keeps the sheet open.
// With `person` (#941, spec #938) it is the Platform admin's variant for another User's account: the same lines in the third person, the five counts of the
// server's dry run instead of the two, and the refusal `account_games_held` as a notice from the read on, the hold idle. `name` is null for a User with no Display name.
const props = withDefaults(defineProps<{
  open: boolean
  /** What the deletion takes beyond the account; null until the read answered. */
  hosted?: HostedCounts | null
  hostedFailed?: boolean
  /** The last deletion was refused. */
  failed: boolean
  /** Sends the deletion; resolves to whether the server took it (the hold goes back to idle on false). */
  remove: () => Promise<boolean>
  /** The Platform admin's variant: whose account, and what the dry run counted (null until it answered). */
  person?: { name: string | null, counts: AdminUserDeletion | null, countsFailed: boolean, held: boolean }
}>(), { hosted: null, hostedFailed: false, person: undefined })

const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const goes = ['goesProfile', 'goesLink', 'goesMessages', 'goesVotes', 'goesTeamWord'] as const
/** The key group of the lines: „du“ on the Profil page, the third person for another User. */
const group = computed(() => props.person ? 'admin.delete' : 'accountDelete')

const title = computed(() => {
  if (!props.person) return t('accountDelete.sheetTitle')
  return props.person.name === null ? t('admin.delete.titleUnnamed') : t('admin.delete.title', { name: props.person.name })
})
const waiting = computed(() => props.person ? props.person.counts === null : props.hosted === null)
const countFailed = computed(() => props.person ? props.person.countsFailed : props.hostedFailed)
const idle = computed(() => waiting.value || (props.person?.held ?? false))
// A refusal (`held`) is worded by the notice above the hold, so the hold's own reason line stays empty then.
const reason = computed(() => {
  if (props.person?.held) return undefined
  return countFailed.value ? t('accountDelete.countFailed') : waiting.value ? t('accountDelete.counting') : undefined
})
</script>

<template>
  <AppSheet
    :open="open"
    :title="title"
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
          {{ t(`${group}.${line}`) }}
        </li>
      </ul>
    </div>

    <template v-if="person">
      <p
        v-if="person.counts && person.counts.hostedEvents > 0"
        class="m-0 text-[14px] text-pretty text-ink-2"
      >
        {{ t('admin.delete.hosting', { n: person.counts.hostedEvents }, person.counts.hostedEvents) }}
      </p>
      <p
        v-if="person.counts && person.counts.games > 0"
        class="m-0 text-[14px] text-pretty text-ink-2"
      >
        {{ t('admin.delete.library', { n: person.counts.games }, person.counts.games) }}
      </p>
      <p
        v-if="person.counts && person.counts.membershipsEnding > 0"
        class="m-0 text-[14px] text-pretty text-ink-2"
      >
        {{ t('admin.delete.ending', { n: person.counts.membershipsEnding }, person.counts.membershipsEnding) }}
      </p>
      <p
        v-if="person.counts && person.counts.membershipsStaying > 0"
        class="m-0 text-[14px] text-pretty text-ink-2"
      >
        {{ t('admin.delete.staying', { n: person.counts.membershipsStaying }, person.counts.membershipsStaying) }}
      </p>
      <p
        v-if="person.counts && person.counts.imageObjects > 0"
        class="m-0 text-[14px] text-pretty text-ink-2"
      >
        {{ t('admin.delete.images', { n: person.counts.imageObjects }, person.counts.imageObjects) }}
      </p>
    </template>
    <template v-else>
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
    </template>

    <p class="m-0 text-[14px] text-pretty text-ink-2">
      {{ t(`${group}.stays`, { name: t('common.deletedUser') }) }}
    </p>
    <p class="m-0 text-[14px] font-bold text-pretty text-ink">
      {{ t(`${group}.final`) }}
    </p>

    <NoticeBanner
      v-if="failed || person?.held"
      tone="critical"
    >
      {{ person?.held ? t('admin.delete.held') : t(`${group}.failed`) }}
    </NoticeBanner>

    <HoldToConfirmButton
      variant="hot"
      :icon="Trash2"
      :label="t('accountDelete.hold')"
      :action="remove"
      :disabled="idle"
      :disabled-reason="reason"
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
