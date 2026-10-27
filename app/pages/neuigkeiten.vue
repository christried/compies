<script setup lang="ts">
import { RELEASES } from '~/utils/changelog'
import { reducedMotion } from '~/utils/motion'

// Neuigkeiten (#80, 09-neuigkeiten, reference/Neuigkeiten.dc.html): every Release from CHANGELOG.md, newest
// first. Public like the legal pages, in the bare shell. Opening `/neuigkeiten#1.2.0` scrolls to that
// Release through the router's hash scrolling (ids are found with getElementById, so the digits are fine).
const { t } = useI18n()
useHead({ title: () => t('news.title') })

// The rail marks the last Release whose top has passed this line: 160 px under the 64 px sticky header.
const SPY_LINE = 224
const current = ref(RELEASES[0]?.version)
let spyPausedUntil = 0

function spy() {
  if (Date.now() < spyPausedUntil) return
  const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
  const passed = RELEASES.filter(r => (document.getElementById(r.version)?.getBoundingClientRect().top ?? Infinity) <= SPY_LINE)
  current.value = (atBottom ? RELEASES.at(-1) : passed.at(-1) ?? RELEASES[0])?.version
}

// Jump from the rail or the strip: scroll to the Release, focus its heading, keep the anchor in the address.
function jump(version: string) {
  const section = document.getElementById(version)
  if (!section) return
  const reduced = reducedMotion()
  spyPausedUntil = Date.now() + (reduced ? 50 : 700)
  current.value = version
  section.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' })
  section.querySelector('h2')?.focus({ preventScroll: true })
  window.history.replaceState(window.history.state, '', `#${version}`)
}

function toTop() {
  window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' })
}

onMounted(() => {
  window.addEventListener('scroll', spy, { passive: true })
  spy()
})
onBeforeUnmount(() => window.removeEventListener('scroll', spy))
</script>

<template>
  <AppShell
    kind="bare"
    flush
  >
    <div class="mx-auto flex w-full max-w-[1160px] flex-col px-4 pt-2 pb-8 md:px-10 md:pt-5 md:pb-12">
      <BackLink />

      <div class="mt-2 mb-5 flex items-center gap-2.5 md:mb-8 md:gap-8">
        <div class="flex min-w-0 flex-1 flex-col gap-2.5">
          <h1 class="m-0 text-[44px] leading-[.95] md:text-[64px]">
            {{ t('news.title') }}
          </h1>
          <p class="m-0 max-w-[34ch] text-[16px] leading-[1.4] font-semibold text-ink-2 md:text-[19px]">
            {{ t('news.intro') }}
          </p>
        </div>
        <Compibert
          variant="bust"
          :size="104"
          class="md:hidden"
        />
        <Compibert
          variant="bust"
          :size="168"
          class="max-md:hidden"
        />
      </div>

      <ReleaseNav
        variant="strip"
        class="mb-7 md:hidden"
        @jump="jump"
      />

      <div class="grid items-start md:grid-cols-[236px_minmax(0,1fr)] md:gap-10">
        <ReleaseNav
          variant="rail"
          :current="current"
          class="sticky top-[88px] layer-sticky max-md:hidden"
          @jump="jump"
        />
        <div class="flex min-w-0 flex-col gap-9 md:gap-11">
          <ReleaseCard
            v-for="(release, i) in RELEASES"
            :key="release.version"
            :release="release"
            :newest="i === 0"
          />
        </div>
      </div>

      <footer class="mt-10 flex flex-wrap items-center gap-x-[18px] border-t-2 border-dashed border-line-soft pt-3 md:mt-14">
        <nav
          :aria-label="t('legal.nav')"
          class="flex flex-wrap gap-x-[18px]"
        >
          <LegalLinks />
        </nav>
        <VersionLabel @click="toTop" />
      </footer>
    </div>
  </AppShell>
</template>
