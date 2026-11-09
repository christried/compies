<script setup lang="ts">
import { Sun, Volume2 } from '@lucide/vue'
import type { Appearance } from '~~/shared/auth'

// The card „Einstellungen“ on the Profil page (screen 25, shipped trimmed, #400): one SettingsRow per setting. Ton is the device's Sound
// (GLOSSARY § Sound), the same state as the header's button, stored as before. Darstellung is the User's Appearance (GLOSSARY § Appearance,
// #404): a tap shows it at once and saves it; a failed save switches back with a notice.
const { t } = useI18n()
const sound = useSound()
const appearance = useAppearance()
const appearanceOptions = computed<{ value: Appearance, label: string }[]>(() => [
  { value: 'light', label: t('settings.light') },
  { value: 'dark', label: t('settings.dark') },
  { value: 'system', label: t('settings.system') },
])
</script>

<template>
  <section
    aria-labelledby="settings-card-title"
    class="outline-memphis flex flex-col rounded-xl bg-surface pt-[18px] pb-1.5 shadow-card"
  >
    <h2
      id="settings-card-title"
      class="m-0 px-[18px] pb-1.5 text-[20px]"
    >
      {{ t('settings.title') }}
    </h2>

    <div class="flex flex-col divide-y-[1.5px] divide-line-soft">
      <SettingsRow
        :icon="Volume2"
        :title="t('common.sound')"
        :description="t('settings.soundHelp')"
      >
        <template #default="{ titleId, descriptionId }">
          <ToggleSwitch
            :model-value="sound.enabled.value"
            :labelledby="titleId"
            :describedby="descriptionId"
            @update:model-value="sound.toggle"
          />
        </template>
      </SettingsRow>

      <SettingsRow
        :icon="Sun"
        :title="t('settings.theme')"
        :description="t('settings.themeHelp')"
      >
        <template #default="{ descriptionId }">
          <SegmentedControl
            :model-value="appearance.appearance.value"
            :options="appearanceOptions"
            :label="t('settings.theme')"
            :aria-describedby="descriptionId"
            @update:model-value="appearance.choose"
          />
        </template>
      </SettingsRow>
    </div>

    <div
      v-if="appearance.failed.value"
      class="px-[18px] pt-1.5 pb-3"
    >
      <NoticeBanner tone="critical">
        {{ t('settings.themeSaveFailed') }}
      </NoticeBanner>
    </div>
  </section>
</template>
