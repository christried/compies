<script setup lang="ts">
import { unseenReleases, type Release } from '~~/shared/changelog'
import { SETUP_PATH } from '~/utils/auth-guard'
import { RELEASES } from '~/utils/changelog'

// „Was ist neu“ (#184): after a new Release the signed-in User sees the Releases they missed once, on any
// device. Mounted once in app.vue. It waits until the browser is idle, so it never delays the first paint, and it
// keeps away from Neuigkeiten (which shows the same) and from profile setup. Closing it any way marks the newest
// Release as seen for the User.
const { t } = useI18n()
const user = useAuthUser()
const route = useRoute()
const { seen, markSeen } = useNewsSeen()

const open = ref(false)
// The Releases as they were when it opened: marking them seen must not empty the dialog while it closes.
const shown = ref<Release[]>([])
// Once per visit: a page load shows it at most once, however many pages the User opens after.
let done = false

const panel = useTemplateRef<HTMLElement>('panel')
const titleId = useId()

function close() {
  open.value = false
  markSeen(shown.value[0]!.version)
}
const { onKeydown } = useDialog(open, panel, close)

function tryOpen() {
  if (done || !user.value || route.path === '/neuigkeiten' || route.path === SETUP_PATH) return
  done = true
  shown.value = unseenReleases(RELEASES, seen.value ?? null)
  open.value = shown.value.length > 0
}

function whenIdle(run: () => void) {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 3000 })
  else setTimeout(run, 1000)
}

// The route is read when the browser is idle, not when it is asked, so a quick click away from Neuigkeiten or setup counts.
onMounted(() => whenIdle(tryOpen))
watch(() => route.path, () => whenIdle(tryOpen))
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 layer-modal flex items-end justify-center md:items-center md:p-6"
    >
      <div
        class="absolute inset-0 animate-enter bg-overlay"
        aria-hidden="true"
        @click="close"
      />
      <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -- Escape and the focus trap of the dialog -->
      <section
        ref="panel"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        class="animate-enter relative flex max-h-[90dvh] w-full flex-col gap-4 border-(length:--cp-bw) border-line bg-surface p-5.5 text-ink shadow-modal max-md:rounded-t-[24px] md:max-w-[640px] md:rounded-[20px]"
        @keydown="onKeydown"
      >
        <header class="flex items-center gap-3">
          <Compibert
            variant="bust"
            :size="64"
            aria-hidden="true"
          />
          <h2
            :id="titleId"
            data-autofocus
            tabindex="-1"
            class="m-0 flex-1 font-display text-[28px] leading-none font-normal outline-none"
          >
            {{ t('whatsNew.title') }}
          </h2>
        </header>

        <div class="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto px-1 pt-5 pb-2">
          <ReleaseCard
            v-for="release in shown"
            :key="release.version"
            :release="release"
          />
        </div>

        <div class="flex flex-col gap-2 sm:flex-row">
          <AppButton
            size="lg"
            class="w-full"
            @click="close"
          >
            {{ t('common.close') }}
          </AppButton>
          <AppButton
            variant="secondary"
            size="lg"
            class="w-full"
            to="/neuigkeiten"
            @click="close"
          >
            {{ t('whatsNew.all') }}
          </AppButton>
        </div>
      </section>
    </div>
  </Teleport>
</template>
