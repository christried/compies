<script setup lang="ts">
import { ChevronRight } from '@lucide/vue'
import { formatSlotDay, formatSlotTime } from '~/utils/berlin-time'
import { isInviteLinkPath } from '~/utils/auth-guard'

// The Session link (`/s/<slug>`, ADR 0006) in the session shell. In this ticket Members see the
// Session read-only: name, Phase, and the Slots in time order or the set Date. Voting comes with
// #11 and the Host actions with #13. The Invite link (`/s/<slug>-<token>`) is handled by InviteEntry (#10).

type Phase = 'draft' | 'poll' | 'date_set' | 'running' | 'finished' | 'archived'

interface SessionView {
  session: { slug: string, name: string, phase: Phase, dateMode: 'poll' | 'direct', startsAt: string | null, isHost: boolean }
  slots: { id: string, startsAt: string }[]
}

const route = useRoute()
const { t } = useI18n()
const slug = computed(() => String(route.params.slug))
const invite = isInviteLinkPath(route.path)
const { data, error } = await useFetch<SessionView>(() => `/api/s/${slug.value}`, { immediate: !invite })

const notFound = computed(() => error.value?.statusCode === 404)
const deleted = computed(() => error.value?.statusCode === 410)
const failed = computed(() => error.value !== null && !notFound.value && !deleted.value)

function when(iso: string) {
  const instant = new Date(iso)
  return { iso, day: formatSlotDay(instant), time: formatSlotTime(instant) }
}
const slotTimes = computed(() => (data.value?.slots ?? []).map(slot => ({ id: slot.id, ...when(slot.startsAt) })))
const setDate = computed(() => (data.value?.session.startsAt ? when(data.value.session.startsAt) : null))

useHead({ title: () => `${data.value?.session.name ?? t('app.name')} | ${t('app.name')}` })
</script>

<template>
  <InviteEntry
    v-if="invite"
    :invite="slug"
  />
  <AppShell
    v-else
    kind="session"
  >
    <template
      v-if="data"
      #title
    >
      <h1 class="m-0 min-w-0 truncate text-[22px] leading-none">
        {{ data.session.name }}
      </h1>
      <PhasePill :phase="data.session.phase" />
    </template>

    <div
      v-if="data"
      class="mx-auto flex w-full max-w-[680px] flex-col gap-4"
    >
      <section
        v-if="data.session.phase === 'poll'"
        class="flex flex-col gap-3"
      >
        <h2 class="m-0 text-[14px] font-bold">
          {{ t('mvp.create.slotsTitle') }}
        </h2>
        <ol class="m-0 grid list-none gap-2.5 p-0 md:grid-cols-2">
          <li
            v-for="slot in slotTimes"
            :key="slot.id"
            class="flex items-baseline justify-between gap-3 rounded-[14px] border-(length:--cp-bw) border-line bg-surface p-4"
          >
            <time
              :datetime="slot.iso"
              class="font-bold"
            >{{ slot.day }}</time>
            <time
              :datetime="slot.iso"
              class="font-num text-[24px] leading-none"
            >{{ slot.time }}</time>
          </li>
        </ol>
      </section>

      <p
        v-else-if="setDate"
        class="m-0 flex items-center gap-2 rounded-[14px] border-(length:--cp-bw) border-line bg-surface p-4 font-bold"
      >
        {{ t('poll.confirmedBanner', { slot: `${setDate.day} ${setDate.time}` }) }}
      </p>
    </div>

    <FullScreenState
      v-else-if="notFound"
      kind="invalid"
    >
      <template #actions>
        <AppButton
          to="/"
          size="lg"
        >
          {{ t('errorPage.home') }}
          <AppIcon :icon="ChevronRight" />
        </AppButton>
      </template>
    </FullScreenState>

    <FullScreenState
      v-else-if="deleted"
      kind="deleted"
    >
      <template #actions>
        <AppButton
          to="/"
          size="lg"
        >
          {{ t('errorPage.home') }}
          <AppIcon :icon="ChevronRight" />
        </AppButton>
      </template>
    </FullScreenState>

    <FullScreenState
      v-else-if="failed"
      kind="generic"
    />
  </AppShell>
</template>
