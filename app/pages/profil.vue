<script setup lang="ts">
import { LogOut } from '@lucide/vue'

// Profil (screen 25, shipped trimmed, #399): one column, the card „Profil“ and „Abmelden“. The card „Einstellungen“ follows with #400.
const { t } = useI18n()
useHead({ title: () => t('profile.title') })
const signOut = useSignOut()
</script>

<template>
  <AppShell kind="hub">
    <div class="mx-auto flex w-full max-w-[640px] flex-col gap-4">
      <h1 class="m-0 font-display text-[32px] leading-none md:text-[44px]">
        {{ t('profile.title') }}
      </h1>

      <ProfileCard />

      <button
        type="button"
        class="inline-flex min-h-11 items-center gap-1.5 self-start px-1 text-[14px] font-bold text-ink underline decoration-2 decoration-line-soft underline-offset-4 hover:decoration-line focus-visible:focus-ring"
        @click="signOut"
      >
        <AppIcon
          :icon="LogOut"
          :size="16"
        />
        {{ t('auth.logout') }}
      </button>
    </div>
  </AppShell>
</template>
