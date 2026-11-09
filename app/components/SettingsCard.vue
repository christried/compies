<script setup lang="ts">
import { Volume2 } from '@lucide/vue'

// The card „Einstellungen“ on the Profil page (screen 25, shipped trimmed, #400): one SettingsRow per setting. Ton is the device's Sound
// (GLOSSARY § Sound), the same state as the header's button, stored as before. Darstellung follows as the second row (#404).
const { t } = useI18n()
const sound = useSound()
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
    </div>
  </section>
</template>
