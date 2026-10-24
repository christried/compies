<script setup lang="ts">
// Impressum, Datenschutz and Neuigkeiten as small text links (09 § VersionLabel): the user menu's last row,
// the sign-in footer and the Neuigkeiten footer. The parent lays them out and adds the version label.
defineProps<{ role?: 'menuitem' }>()

const { t } = useI18n()
const route = useRoute()

const PAGES = ['impressum', 'datenschutz', 'neuigkeiten'] as const
</script>

<template>
  <NuxtLink
    v-for="page in PAGES"
    :key="page"
    :to="`/${page}`"
    :role="role"
    :aria-current="route.path === `/${page}` ? 'page' : undefined"
    class="inline-flex min-h-11 items-center text-[13px] font-bold text-ink-2 no-underline hover:text-ink hover:underline aria-[current=page]:font-extrabold aria-[current=page]:text-ink"
  >
    {{ t(`legal.links.${page}`) }}
  </NuxtLink>
</template>
