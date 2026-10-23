<script setup lang="ts">
import { CircleAlert, LoaderCircle, MessageSquare, Play } from '@lucide/vue'
import type { Component } from 'vue'
import type { SignInProvider } from '~~/shared/auth'

export interface InvitePreview {
  eventName: string
  host: { name: string, image: string | null }
}

// Sign-in card (screen 02, `App Einstieg ?s=login`): Standard, Über Einladung, Weiterleitung,
// Abgebrochen. Discord is primary, Twitch secondary; neutral icons instead of brand logos.
withDefaults(defineProps<{
  /** The visitor came from an Invite link. */
  invited?: boolean
  /** Event and Host for the invite notice. */
  invite?: InvitePreview | null
  /** The provider whose round trip is running (Weiterleitung). */
  busy?: SignInProvider | null
  /** The sign-in came back without success (Abgebrochen): the provider, or true when unknown. */
  failed?: SignInProvider | true | null
}>(), { invited: false, invite: null, busy: null, failed: null })

const emit = defineEmits<{ signIn: [provider: SignInProvider] }>()

const { t } = useI18n()

const buttons: { provider: SignInProvider, variant: 'primary' | 'secondary', icon: Component }[] = [
  { provider: 'discord', variant: 'primary', icon: MessageSquare },
  { provider: 'twitch', variant: 'secondary', icon: Play },
]

const providerName = (provider: SignInProvider) => t(`auth.provider.${provider}`)
</script>

<template>
  <div class="flex w-full max-w-[400px] flex-col gap-4">
    <div
      v-if="invite"
      class="outline-memphis flex items-center gap-3 rounded-lg bg-surface px-3.5 py-3 shadow-sm"
    >
      <UserAvatar
        :name="invite.host.name"
        :image="invite.host.image"
        :size="40"
      />
      <i18n-t
        keypath="auth.inviteNotice"
        tag="span"
        scope="global"
        class="text-[14px] leading-[1.35] text-pretty"
      >
        <template #host>
          <b>{{ invite.host.name }}</b>
        </template>
        <template #event>
          <b>{{ invite.eventName }}</b>
        </template>
      </i18n-t>
    </div>

    <div class="flex flex-col gap-1.5">
      <h1 class="m-0 text-[38px] leading-none md:text-[46px]">
        {{ invited ? t('auth.titleInvite') : t('auth.title') }}
      </h1>
      <p class="m-0 text-body text-pretty text-ink-2">
        {{ t('auth.intro') }}
      </p>
    </div>

    <div
      v-if="failed"
      role="alert"
      class="flex items-start gap-2.5 rounded-md border-2 border-line bg-surface px-3.5 py-3"
    >
      <span class="grid size-7 flex-none place-items-center rounded-pill border-2 border-line bg-error text-on-error">
        <AppIcon
          :icon="CircleAlert"
          :size="14"
        />
      </span>
      <span
        v-if="failed === true"
        class="text-[14px] text-pretty"
      >{{ t('auth.cancelled') }}</span>
      <i18n-t
        v-else
        keypath="auth.cancelledProvider"
        tag="span"
        scope="global"
        class="text-[14px] text-pretty"
      >
        <template #headline>
          <b>{{ t('auth.cancelledTitle') }}</b>
        </template>
        <template #provider>
          {{ providerName(failed) }}
        </template>
      </i18n-t>
    </div>

    <AppButton
      v-for="button in buttons"
      :key="button.provider"
      :variant="button.variant"
      size="xl"
      class="w-full"
      :class="busy && busy !== button.provider && 'opacity-50'"
      :disabled="!!busy"
      @click="emit('signIn', button.provider)"
    >
      <template #icon>
        <AppIcon
          v-if="busy === button.provider"
          :icon="LoaderCircle"
          :size="20"
          class="animate-spin reduced:animate-none motion-reduce:animate-none"
        />
        <AppIcon
          v-else
          :icon="button.icon"
          :size="20"
        />
      </template>
      {{ busy === button.provider ? t('auth.redirecting', { provider: providerName(button.provider) }) : t(`auth.${button.provider}`) }}
    </AppButton>

    <p class="m-0 text-center text-small text-pretty text-ink-2">
      {{ t('auth.linkLater') }}
    </p>
  </div>
</template>
