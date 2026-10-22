<script setup lang="ts">
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Plus, X } from '@lucide/vue'
import { berlinLocalNow } from '~/utils/berlin-time'
import { SESSION_NAME_MAX, SLOTS_MAX } from '~~/shared/session'

// Create a Session (screen M2, `?s=create`): a name, then a Date poll with up to 8 Slots or one
// direct Date. Only Users with the Host permission get the form (ADR 0002); everyone else sees the
// Construction page. Times are Berlin wall-clock values; the server is the final judge.

const { t } = useI18n()
useHead({ title: () => `${t('mvp.create.kicker')} | ${t('app.name')}` })
const user = useAuthUser()

const name = ref('')
const mode = ref('poll')
const slots = ref([''])
const direct = ref('')
const now = ref(berlinLocalNow())
const attempted = ref(false)
const saving = ref(false)
const failure = ref<string | null>(null)
const created = ref<{ slug: string, inviteUrl: string } | null>(null)
const doneHeading = useTemplateRef('doneHeading')

const trimmedName = computed(() => name.value.trim())
const nameError = computed(() => {
  if (attempted.value && trimmedName.value === '') return t('error.nameRequired')
  if ([...trimmedName.value].length > SESSION_NAME_MAX) return t('error.nameTooLong', { max: SESSION_NAME_MAX })
  return undefined
})

// Each filled Slot is either in the past, a repeat of an earlier one, or fine. Berlin values share a
// format, so comparing them as text compares the times.
const slotProblems = computed(() => {
  const seen = new Set<string>()
  return slots.value.map((value) => {
    if (value === '') return null
    if (value <= now.value) return 'past'
    if (seen.has(value)) return 'duplicate'
    seen.add(value)
    return null
  })
})
const slotErrors = computed(() => slotProblems.value.map((problem) => {
  if (problem === 'past') return t('error.slotPast')
  if (problem === 'duplicate') return t('error.slotDuplicate')
  return undefined
}))
const directError = computed(() => (direct.value !== '' && direct.value <= now.value ? t('error.slotPast') : undefined))

/** Why the CTA is blocked, or null when the form can be sent. */
const blocker = computed<string | null>(() => {
  if (trimmedName.value === '') return t('error.nameRequired')
  if ([...trimmedName.value].length > SESSION_NAME_MAX) return t('error.nameTooLong', { max: SESSION_NAME_MAX })
  if (mode.value === 'direct') {
    if (direct.value === '') return t('mvp.create.slotEmpty')
    return directError.value ? t('mvp.create.blockedPast') : null
  }
  if (slots.value.includes('')) return t('mvp.create.slotEmpty')
  if (slotProblems.value.includes('past')) return t('mvp.create.blockedPast')
  if (slotProblems.value.includes('duplicate')) return t('error.slotDuplicate')
  return null
})

const ctaLabel = computed(() => {
  if (saving.value) return t('mvp.create.saving')
  return mode.value === 'poll' ? t('mvp.create.submit') : t('mvp.create.submitDirect')
})

function addSlot() {
  slots.value.push('')
}

function removeSlot(index: number) {
  slots.value.splice(index, 1)
}

async function submit() {
  attempted.value = true
  now.value = berlinLocalNow()
  if (blocker.value || saving.value) return

  const body = mode.value === 'poll'
    ? { name: trimmedName.value, dateMode: 'poll', slots: slots.value }
    : { name: trimmedName.value, dateMode: 'direct', startsAt: direct.value }
  saving.value = true
  failure.value = null
  try {
    created.value = await $fetch<{ slug: string, inviteUrl: string }>('/api/s', { method: 'POST', body })
    await nextTick()
    doneHeading.value?.focus()
  }
  catch (error) {
    failure.value = (error as { statusCode?: number }).statusCode === 403 ? t('error.noHostRight') : t('error.saveFailed')
  }
  finally {
    saving.value = false
  }
}

const MODES = computed(() => [
  { value: 'poll', label: t('mvp.create.modePoll'), icon: CalendarDays },
  { value: 'direct', label: t('mvp.create.modeDirect'), icon: CalendarCheck },
])
</script>

<template>
  <AppShell
    v-if="!user?.canHost"
    kind="hub"
  >
    <ConstructionPage area="generic" />
  </AppShell>

  <AppShell
    v-else
    kind="hub"
  >
    <div class="mx-auto flex w-full max-w-[680px] flex-col gap-[18px] px-1">
      <NuxtLink
        to="/"
        class="inline-flex items-center gap-1 self-start text-small font-bold text-ink-2 no-underline"
      >
        <AppIcon
          :icon="ChevronLeft"
          :size="14"
        />
        {{ t('mvp.create.back') }}
      </NuxtLink>

      <section
        v-if="created"
        class="flex flex-col gap-5 rounded-xl border-3 border-line bg-surface p-5 shadow-card md:flex-row md:items-center"
      >
        <div
          class="w-[120px] flex-none"
          aria-hidden="true"
        >
          <Compibert variant="bust" />
        </div>
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <h1
            ref="doneHeading"
            tabindex="-1"
            class="m-0 text-[34px] leading-none outline-none"
          >
            {{ t('mvp.create.doneTitle', { name: trimmedName }) }}
          </h1>
          <p class="m-0 font-semibold text-pretty">
            {{ mode === 'poll' ? t('mvp.create.doneText', { n: slots.length }) : t('mvp.create.doneDirectText') }}
          </p>
          <InviteLinkCard :url="created.inviteUrl" />
          <NuxtLink
            :to="`/s/${created.slug}`"
            class="inline-flex items-center gap-1 self-start font-extrabold no-underline"
          >
            {{ t('mvp.create.toPoll') }}
            <AppIcon
              :icon="ChevronRight"
              :size="16"
            />
          </NuxtLink>
        </div>
      </section>

      <form
        v-else
        novalidate
        class="flex flex-col gap-[18px]"
        @submit.prevent="submit"
      >
        <div class="flex flex-col gap-0.5">
          <span class="text-small font-bold text-ink-2">{{ t('mvp.create.kicker') }}</span>
          <h1 class="m-0 font-display text-[34px] leading-none md:text-[44px]">
            {{ t('mvp.create.title') }}
          </h1>
        </div>

        <TextField
          v-model="name"
          :label="t('mvp.create.nameLabel')"
          :help="t('mvp.create.nameHelp')"
          :error="nameError"
          :maxlength="SESSION_NAME_MAX"
        />

        <SegmentedControl
          v-model="mode"
          :label="t('mvp.create.dateLabel')"
          :options="MODES"
        />

        <div
          v-if="mode === 'poll'"
          class="flex flex-col gap-2"
        >
          <b class="text-[14px]">{{ t('mvp.create.slotsTitle') }}</b>
          <div
            v-for="(_, index) in slots"
            :key="index"
            class="flex items-start gap-2"
          >
            <DateTimeField
              :model-value="slots[index] ?? ''"
              class="min-w-0 flex-1"
              :label="t('mvp.create.slotLabel', { n: index + 1 })"
              :min="now"
              :error="slotErrors[index]"
              @update:model-value="value => (slots[index] = value)"
            />
            <IconButton
              v-if="slots.length > 1"
              :icon="X"
              :label="t('mvp.create.removeSlot')"
              class="mt-1"
              @click="removeSlot(index)"
            />
          </div>
          <button
            v-if="slots.length < SLOTS_MAX"
            type="button"
            class="hit-44 inline-flex items-center gap-1.5 self-start rounded-pill border-[2.5px] border-dashed border-line px-3.5 text-small font-bold text-ink outline-memphis"
            @click="addSlot"
          >
            <AppIcon
              :icon="Plus"
              :size="16"
            />
            {{ t('mvp.create.addSlot') }}
          </button>
          <p class="m-0 text-small text-pretty text-ink-2">
            {{ t('mvp.create.slotsHelp') }}
          </p>
        </div>

        <DateTimeField
          v-else
          v-model="direct"
          :label="t('mvp.create.dateLabel')"
          :min="now"
          :error="directError"
        />

        <BaustelleZone
          :sign="false"
          :title="t('mvp.create.laterTitle')"
          :text="t('mvp.create.laterText')"
        />

        <p
          v-if="failure"
          role="alert"
          class="m-0 font-bold text-error-fg"
        >
          {{ failure }}
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <AppButton
            type="submit"
            size="lg"
            :aria-disabled="blocker !== null || saving"
            :aria-describedby="blocker ? 'create-blocker' : undefined"
          >
            {{ ctaLabel }}
            <AppIcon
              :icon="ChevronRight"
              :size="18"
            />
          </AppButton>
          <span
            v-if="blocker"
            id="create-blocker"
            class="text-small font-bold text-ink-2"
          >{{ blocker }}</span>
        </div>
      </form>
    </div>
  </AppShell>
</template>
