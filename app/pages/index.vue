<script setup lang="ts">
// Home skeleton: the real Home (session cards, host CTA, empty state) lands with MVP 11.
const { t } = useI18n()
</script>

<template>
  <AppShell kind="hub">
    <div class="mx-auto flex w-full max-w-[1040px] flex-col gap-5">
      <h1 class="m-0 text-[32px] leading-none md:text-[44px]">
        {{ t('mvp.home.title') }}
      </h1>
      <BaustelleZone
        :title="t('mvp.zone.homeTitle')"
        :text="t('mvp.zone.homeText')"
      />
    </div>
  </AppShell>
</template>
