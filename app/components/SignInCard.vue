<script setup lang="ts">
import { LoaderCircle } from '@lucide/vue'
import type { SignInProvider } from '~~/shared/auth'
import type { InvitePreview } from '~~/shared/event'

// Sign-in card (screen 02, `App Einstieg ?s=login`): Standard, Über Einladung, Weiterleitung,
// Abgebrochen. Each button wears its brand's logo and fill, side by side as equals (#792).
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

const providers: SignInProvider[] = ['discord', 'twitch']

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
    </div>

    <NoticeBanner
      v-if="failed"
      tone="critical"
    >
      <span v-if="failed === true">{{ t('auth.cancelled') }}</span>
      <i18n-t
        v-else
        keypath="auth.cancelledProvider"
        tag="span"
        scope="global"
      >
        <template #headline>
          <b>{{ t('auth.cancelledTitle') }}</b>
        </template>
        <template #provider>
          {{ providerName(failed) }}
        </template>
      </i18n-t>
    </NoticeBanner>

    <AppButton
      v-for="provider in providers"
      :key="provider"
      :variant="provider"
      size="xl"
      class="w-full"
      :class="busy && busy !== provider && 'opacity-50'"
      :disabled="!!busy"
      @click="emit('signIn', provider)"
    >
      <template #icon>
        <AppIcon
          v-if="busy === provider"
          :icon="LoaderCircle"
          :size="20"
          class="animate-spin reduced:animate-none motion-reduce:animate-none"
        />
        <BrandIcon
          v-else
          :provider
          :size="20"
        />
      </template>
      {{ busy === provider ? t('auth.redirecting', { provider: providerName(provider) }) : t(`auth.${provider}`) }}
    </AppButton>

    <p class="m-0 text-body text-pretty text-ink-2">
      {{ t('auth.intro') }}
    </p>
  </div>
</template>
