<script setup lang="ts">
import { Compass, Sun, Volume2 } from '@lucide/vue'
import type { SavedTourSeen } from '~~/shared/auth'

// The card „Einstellungen“ on the Profil page (screen 25, shipped trimmed, #400): one SettingsRow per setting. Ton is the device's Sound
// (GLOSSARY § Sound), the same state as the header's button, stored as before. Darstellung is the User's Appearance (GLOSSARY § Appearance,
// #404): a tap shows it at once and saves it; a failed save switches back with a notice. Rundgang (GLOSSARY: Tour, #649) sets the User's
// stored Tour version back to 0, so the Tour shows again; a failed reset changes nothing and says so.
const { t } = useI18n()
const sound = useSound()
const appearance = useAppearance()
const user = useAuthUser()
const { toast } = useToast()
const tourResetting = ref(false)
const tourResetFailed = ref(false)

async function resetTour() {
  // The button is aria-disabled while this runs (a native `disabled` would drop the focus, AppButton): a click still arrives, so it is turned away here (#785).
  if (tourResetting.value) return
  tourResetFailed.value = false
  tourResetting.value = true
  try {
    const saved = await $fetch<SavedTourSeen>('/api/me/tour-reset', { method: 'POST' })
    if (user.value) user.value = { ...user.value, tourSeen: saved.tourSeen }
    toast({ tone: 'success', text: t('settings.tourResetDone') })
  }
  catch {
    tourResetFailed.value = true
  }
  finally {
    tourResetting.value = false
  }
}
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
        :title="t('settings.appearance')"
        :description="t('settings.appearanceHelp')"
      >
        <template #default="{ descriptionId }">
          <SegmentedControl
            :model-value="appearance.appearance.value"
            :options="appearance.choices.value"
            :label="t('settings.appearance')"
            :aria-describedby="descriptionId"
            @update:model-value="appearance.choose"
          />
        </template>
      </SettingsRow>

      <SettingsRow
        :icon="Compass"
        :title="t('settings.tour')"
        :description="t('settings.tourHelp')"
      >
        <template #default="{ descriptionId }">
          <AppButton
            variant="secondary"
            size="md"
            :aria-disabled="tourResetting || undefined"
            :aria-describedby="descriptionId"
            @click="resetTour"
          >
            {{ t('settings.tourAgain') }}
          </AppButton>
        </template>
      </SettingsRow>
    </div>

    <div
      v-if="appearance.failed.value"
      class="px-[18px] pt-1.5 pb-3"
    >
      <NoticeBanner tone="critical">
        {{ t('settings.appearanceSaveFailed') }}
      </NoticeBanner>
    </div>

    <div
      v-if="tourResetFailed"
      class="px-[18px] pt-1.5 pb-3"
    >
      <NoticeBanner tone="critical">
        {{ t('settings.tourResetFailed') }}
      </NoticeBanner>
    </div>
  </section>
</template>
