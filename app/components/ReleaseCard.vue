<script setup lang="ts">
import { Calendar, Link as LinkIcon, Sparkles } from '@lucide/vue'
import type { Release } from '~~/shared/changelog'
import { formatReleaseDate } from '~/utils/changelog'
import { confetti } from '~/utils/confetti'
import { reducedMotion } from '~/utils/motion'

// One Release on Neuigkeiten (09 § ReleaseCard, § CopyLinkButton, § NewStamp). The newest carries the „Neu“
// stamp. It is always in the markup, so it shows without JS. The first time the card's head is in view on
// this device, the stamp lands with the page's one celebration; under reduced motion it just stays put.
const props = defineProps<{ release: Release, newest?: boolean }>()

const { t } = useI18n()
const { toast } = useToast()
const { seen, markSeen } = useNewsSeen()

const headingId = `v-${props.release.version.replaceAll('.', '-')}`

async function copyLink() {
  const url = `${window.location.origin}/neuigkeiten#${props.release.version}`
  try {
    await navigator.clipboard.writeText(url)
    toast({ tone: 'success', text: t('news.copied') })
  }
  catch {
    toast({ tone: 'error', text: t('news.copyFailed', { url }) })
  }
}

const card = useTemplateRef('card')
const head = useTemplateRef('head')
const stamp = useTemplateRef('stamp')
const layer = useTemplateRef('layer')
/** Hidden until it lands, only on the client and only when it will land. */
const pending = ref(false)
let observer: IntersectionObserver | undefined

// The timeline from 09 § NewStamp: the stamp lands (0.4 s, overshoot), the card bumps at 0.30 s, confetti at 0.32 s.
function celebrate() {
  if (!stamp.value || !card.value || !layer.value) return
  pending.value = false
  stamp.value.animate(
    [{ opacity: 0, transform: 'scale(2.2) rotate(-10deg)' }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }],
    { duration: 400, easing: 'cubic-bezier(.34,1.56,.64,1)' },
  )
  card.value.animate(
    [{ transform: 'translateY(0)' }, { transform: 'translateY(5px)' }, { transform: 'translateY(0)' }],
    { delay: 300, duration: 160, easing: 'ease-out' },
  )
  const chip = stamp.value.parentElement!
  const count = window.matchMedia('(min-width: 61.25rem)').matches ? 18 : 10
  const target = layer.value
  setTimeout(() => confetti(target, chip.offsetLeft + chip.offsetWidth / 2, chip.offsetTop + chip.offsetHeight / 2, count), 320)
  markSeen(props.release.version)
}

// Runs after useNewsSeen's own mount hook, so `seen` is already read from storage.
onMounted(() => {
  if (!props.newest || seen.value === props.release.version || !head.value) return
  const reduced = reducedMotion()
  pending.value = !reduced
  observer = new IntersectionObserver((entries) => {
    if (!entries.some(entry => entry.isIntersecting)) return
    observer?.disconnect()
    if (reduced) markSeen(props.release.version)
    else setTimeout(celebrate, 350)
  }, { threshold: 0.6 })
  observer.observe(head.value)
})
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <section
    :id="release.version"
    :aria-labelledby="headingId"
    class="scroll-mt-20 md:scroll-mt-[88px]"
  >
    <article
      ref="card"
      class="outline-memphis relative rounded-xl bg-surface px-[18px] pt-6 pb-[22px] shadow-card md:px-8 md:pt-[30px] md:pb-8"
    >
      <div
        ref="layer"
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 layer-confetti"
      />
      <div
        ref="head"
        class="flex items-start gap-3.5"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-2">
          <h2
            :id="headingId"
            tabindex="-1"
            class="m-0 flex flex-wrap items-baseline gap-x-3.5 gap-y-1 leading-none"
          >
            <CpNum
              :value="release.version"
              :say="t('news.say', { v: release.version })"
              class="text-[32px] md:text-[44px]"
              :class="newest && '[text-shadow:3px_3px_0_var(--cp-primary)]'"
            />
            <span class="font-display text-[24px] leading-[1.05] md:text-[30px]">{{ release.name }}</span>
          </h2>
          <span
            v-if="newest"
            class="absolute -top-[19px] left-4 -rotate-6 md:left-[26px]"
          >
            <span
              ref="stamp"
              class="outline-memphis inline-flex h-[34px] items-center gap-1.5 rounded-pill bg-primary pr-3.5 pl-2.5 text-[14px] leading-none font-extrabold tracking-[.06em] text-on-primary uppercase shadow-sm"
              :class="pending && 'opacity-0'"
            >
              <AppIcon
                :icon="Sparkles"
                :size="16"
              />
              {{ t('news.new') }}
            </span>
          </span>
          <time
            :datetime="release.date"
            class="inline-flex items-center gap-1.5 text-[14px] font-bold text-ink-2"
          >
            <AppIcon
              :icon="Calendar"
              :size="15"
            />
            {{ formatReleaseDate(release.date) }}
          </time>
        </div>
        <IconButton
          :icon="LinkIcon"
          :label="t('news.copy', { v: release.version })"
          class="hover:bg-primary focus-visible:bg-primary"
          @click="copyLink"
        />
      </div>

      <p
        v-if="release.intro"
        class="m-0 mt-4 max-w-[62ch] text-[16px] leading-normal font-semibold md:text-[17px]"
      >
        <ChangelogInline :nodes="release.intro" />
      </p>

      <div class="mt-5 flex flex-col gap-6 md:mt-[26px]">
        <ChangeGroup
          v-for="group in release.groups"
          :key="group.type"
          :group="group"
        />
      </div>
    </article>
  </section>
</template>
