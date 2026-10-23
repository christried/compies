<script setup lang="ts">
import { CalendarCheck, CalendarDays, ChevronLeft, ChevronRight, Minus, Plus, X } from '@lucide/vue'
import { apiErrorKey } from '~/utils/api-error'
import { EVENT_NAME_MAX, SESSIONS_MAX, SLOTS_MAX, eventNameLength, slotProblems as slotRuleProblems } from '~~/shared/event'
import { berlinToUtc, utcToBerlin } from '~~/shared/time'

// Create an Event (screen M2, `?s=create`): a name, the Session count (1 to 8), then a Date poll with
// up to 8 Slots (at least one per Session) or one direct Date per Session. Only Users with the Host
// permission get the form (ADR 0002); everyone else sees the Construction page. Times are Berlin
// wall-clock values; the server is the final judge.

const { t } = useI18n()
useHead({ title: () => `${t('mvp.create.kicker')} | ${t('app.name')}` })
const user = useAuthUser()

const name = ref('')
const mode = ref('poll')
const sessionCount = ref(1)
const slots = ref([''])
/** One Date per Session in direct mode; its rows follow the Session count. */
const direct = ref([''])
/** Berlin wall-clock now, minute precision, as the fields' lower bound (ADR 0003). */
const now = ref(utcToBerlin(new Date()))
const attempted = ref(false)
const saving = ref(false)
const failure = ref<string | null>(null)
const created = ref<{ slug: string, inviteUrl: string } | null>(null)
const doneHeading = useTemplateRef('doneHeading')

watch(sessionCount, (count) => {
  direct.value.splice(count)
  while (direct.value.length < count) direct.value.push('')
})

const trimmedName = computed(() => name.value.trim())
const nameTooLong = computed(() => eventNameLength(name.value) > EVENT_NAME_MAX)
const nameError = computed(() => {
  if (attempted.value && trimmedName.value === '') return t('error.nameRequired')
  if (nameTooLong.value) return t('error.nameTooLong', { max: EVENT_NAME_MAX })
  return undefined
})

/** Each row's problem under the server's Slot rules (shared/event.ts); null for an empty row. */
function rowProblems(values: string[]) {
  const instants = values.map(value => (value === '' ? null : berlinToUtc(value)))
  const problems = slotRuleProblems(instants.filter(instant => instant !== null), [], berlinToUtc(now.value))
  let next = 0
  return instants.map(instant => (instant === null ? null : problems[next++] ?? null))
}
const slotProblems = computed(() => rowProblems(slots.value))
const slotErrors = computed(() => slotProblems.value.map((problem) => {
  if (problem === 'in_past') return t('error.slotPast')
  if (problem === 'duplicate_slot') return t('error.slotDuplicate')
  return undefined
}))
const directProblems = computed(() => rowProblems(direct.value))
const directErrors = computed(() => directProblems.value.map((problem) => {
  if (problem === 'in_past') return t('error.slotPast')
  if (problem === 'duplicate_slot') return t('error.dateDuplicate')
  return undefined
}))

/** Why the CTA is blocked, or null when the form can be sent. */
const blocker = computed<string | null>(() => {
  if (trimmedName.value === '') return t('error.nameRequired')
  if (nameTooLong.value) return t('error.nameTooLong', { max: EVENT_NAME_MAX })
  if (mode.value === 'direct') {
    if (direct.value.includes('')) return t('mvp.create.directEmpty')
    if (directProblems.value.includes('in_past')) return t('mvp.create.blockedPast')
    if (directProblems.value.includes('duplicate_slot')) return t('error.dateDuplicate')
    return null
  }
  if (slots.value.includes('')) return t('mvp.create.slotEmpty')
  if (slots.value.length < sessionCount.value) return t('mvp.create.minSlots', { n: sessionCount.value })
  if (slotProblems.value.includes('in_past')) return t('mvp.create.blockedPast')
  if (slotProblems.value.includes('duplicate_slot')) return t('error.slotDuplicate')
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
  now.value = utcToBerlin(new Date())
  if (blocker.value || saving.value) return

  const body = mode.value === 'poll'
    ? { name: trimmedName.value, dateMode: 'poll', sessions: sessionCount.value, slots: slots.value }
    : { name: trimmedName.value, dateMode: 'direct', sessions: sessionCount.value, startsAt: direct.value }
  saving.value = true
  failure.value = null
  try {
    created.value = await $fetch<{ slug: string, inviteUrl: string }>('/api/e', { method: 'POST', body })
    await nextTick()
    doneHeading.value?.focus()
  }
  catch (error) {
    failure.value = t(apiErrorKey(error), { max: SLOTS_MAX })
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
    no-tabs
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
        <Compibert
          variant="bust"
          :size="120"
        />
        <div class="flex min-w-0 flex-1 flex-col gap-3">
          <h1
            ref="doneHeading"
            tabindex="-1"
            class="m-0 text-[34px] leading-none outline-none"
          >
            {{ mode === 'poll' ? t('mvp.create.doneTitle', { name: trimmedName }) : t('mvp.create.doneTitleDirect', { name: trimmedName }) }}
          </h1>
          <p class="m-0 font-semibold text-pretty">
            {{ mode === 'poll' ? t('mvp.create.doneText') : sessionCount > 1 ? t('mvp.create.doneDirectTextPlural') : t('mvp.create.doneDirectText') }}
          </p>
          <InviteLinkCard :url="created.inviteUrl" />
          <NuxtLink
            :to="`/e/${created.slug}`"
            class="inline-flex items-center gap-1 self-start font-extrabold no-underline"
          >
            {{ mode === 'poll' ? t('mvp.create.toPoll') : t('mvp.create.toEvent') }}
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
          :maxlength="EVENT_NAME_MAX"
        />

        <div class="flex flex-col gap-2">
          <b class="text-[14px]">{{ t('mvp.create.sessionsLabel') }}</b>
          <div class="flex items-center gap-3">
            <IconButton
              :icon="Minus"
              :label="t('mvp.create.sessionsLess')"
              :disabled="sessionCount <= 1"
              @click="sessionCount -= 1"
            />
            <output
              class="min-w-8 text-center font-num text-[22px]"
              aria-live="polite"
            >{{ sessionCount }}</output>
            <IconButton
              :icon="Plus"
              :label="t('mvp.create.sessionsMore')"
              :disabled="sessionCount >= SESSIONS_MAX"
              @click="sessionCount += 1"
            />
          </div>
          <p class="m-0 text-small text-pretty text-ink-2">
            {{ t('mvp.create.sessionsHelp') }}
          </p>
        </div>

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
            class="hit-44 inline-flex min-h-11 items-center gap-1.5 self-start rounded-pill border-[2.5px] border-dashed border-line px-3.5 text-small font-bold text-ink outline-memphis lift"
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

        <div
          v-else
          class="flex flex-col gap-[18px]"
        >
          <DateTimeField
            v-for="(_, index) in direct"
            :key="index"
            :model-value="direct[index] ?? ''"
            :label="sessionCount > 1 ? t('mvp.create.slotLabel', { n: index + 1 }) : t('mvp.create.dateLabel')"
            :error="directErrors[index]"
            @update:model-value="value => (direct[index] = value)"
          />
        </div>

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
