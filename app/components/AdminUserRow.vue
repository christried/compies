<script setup lang="ts">
import { Shield } from '@lucide/vue'
import { formatMonthYear } from '~/utils/berlin-time'
import type { AdminUser } from '~~/shared/admin'

// One User of the Admin page's list (#682, spec #938; artboard screen 26 „Plattform-Admin“): the Profile picture, the Display name (or „Noch nicht eingerichtet“),
// the services they linked, the month of their first sign-in, a mark for a Platform admin and the switch „Darf hosten“. A Platform admin's switch is on and locked, with a
// hint, because a Platform admin always hosts (the server refuses the same, `platform_admin_hosts`). The switch only says what was pressed (`toggle`, the value wanted);
// the list decides what follows. The row stacks at 390 px: the person above, the switch below. The name and the label name the switch together, so a screen reader hears whose it is.
const props = defineProps<{ user: AdminUser }>()
const emit = defineEmits<{ toggle: [canHost: boolean] }>()

const { t } = useI18n()
const nameId = useId()
const labelId = useId()
const hintId = useId()

const named = computed(() => props.user.displayName !== null)
// The provider's name is never on the entry (ADR 0008), so the shared `shownName` has nothing to fall back to: the row says „Noch nicht eingerichtet“.
const shownName = computed(() => props.user.displayName === null ? t('admin.notSetUp') : props.user.displayName)
const providers = computed(() => props.user.providers.map(provider => t(`auth.provider.${provider}`)).join(', '))
const since = computed(() => t('admin.since', { date: formatMonthYear(new Date(props.user.firstSignInAt)) }))
</script>

<template>
  <li class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b-[1.5px] border-line-soft px-3.5 py-2 last:border-b-0 md:min-h-16">
    <UserAvatar
      :name="shownName"
      :image="user.image"
      :size="40"
    />
    <div class="flex min-w-[140px] flex-1 flex-col leading-[1.3]">
      <span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <b
          :id="nameId"
          class="min-w-0 [overflow-wrap:anywhere]"
          :class="named ? '' : 'text-ink-2'"
        >{{ shownName }}</b>
        <span
          v-if="user.isAdmin"
          class="inline-flex items-center gap-1 rounded-pill border-2 border-line bg-ink px-2 text-[12px] font-bold text-paper"
        >
          <AppIcon
            :icon="Shield"
            :size="12"
          />
          {{ t('admin.platformAdmin') }}
        </span>
      </span>
      <span class="text-[12px] text-ink-2">{{ providers }}</span>
    </div>
    <span class="text-[12px] text-ink-2 md:min-w-[150px]">{{ since }}</span>
    <div class="flex items-center gap-2 max-md:w-full">
      <ToggleSwitch
        :model-value="user.canHost || user.isAdmin"
        :disabled="user.isAdmin"
        :labelledby="`${nameId} ${labelId}`"
        :describedby="user.isAdmin ? hintId : undefined"
        @update:model-value="emit('toggle', $event)"
      />
      <span
        :id="labelId"
        class="text-[13px] font-bold"
      >{{ t('admin.canHost') }}</span>
    </div>
    <span
      v-if="user.isAdmin"
      :id="hintId"
      class="w-full text-[12px] text-ink-3 md:text-right"
    >{{ t('admin.hostLocked') }}</span>
  </li>
</template>
