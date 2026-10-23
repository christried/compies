<script setup lang="ts">
import { isSignInProvider, type SignInProvider } from '~~/shared/auth'
import type { InvitePreview } from '~/components/SignInCard.vue'
import { isInviteLinkPath, safeRedirect, SIGN_IN_PATH } from '~/utils/auth-guard'

// Sign-in (screen 02). The OAuth round trip leaves the app: Better Auth comes back to the target
// in `redirect`, or here with `error` (and the `provider` we sent along) when it did not work.
const route = useRoute()
const { t } = useI18n()
useHead({ title: () => `${t('auth.title')} | ${t('app.name')}` })

const target = computed(() => safeRedirect(route.query.redirect))
const invitePath = computed(() => {
  const path = target.value.split(/[?#]/)[0]!
  return isInviteLinkPath(path) ? path : null
})
const invited = computed(() => invitePath.value !== null)
// The notice names the Session and the Host (#10). The preview answers only for valid links.
const { data: invite } = await useAsyncData<InvitePreview | null>('sign-in-invite', async () => {
  if (!invitePath.value) return null
  try {
    return await $fetch<InvitePreview>(`/api/invite/${invitePath.value.slice('/s/'.length)}`)
  }
  catch {
    return null
  }
}, { watch: [invitePath] })

const busy = ref<SignInProvider | null>(null)
const failedHere = ref<SignInProvider | null>(null)
const failed = computed<SignInProvider | true | null>(() => {
  if (busy.value) return null
  if (failedHere.value) return failedHere.value
  if (!route.query.error) return null
  return isSignInProvider(route.query.provider) ? route.query.provider : true
})

async function signIn(provider: SignInProvider) {
  busy.value = provider
  failedHere.value = null
  const back = new URLSearchParams({ provider })
  if (target.value !== '/') back.set('redirect', target.value)
  try {
    const { url } = await $fetch<{ url: string }>('/api/auth/sign-in/social', {
      method: 'POST',
      body: { provider, callbackURL: target.value, errorCallbackURL: `${SIGN_IN_PATH}?${back}`, disableRedirect: true },
    })
    // Not navigateTo: it stops the app scope first, and the page would flash until the provider page replaces ours (#32).
    window.location.href = url
  }
  catch {
    busy.value = null
    failedHere.value = provider
  }
}

// Coming back with the browser's back button can restore this page from the bfcache, mid-redirect.
function resetOnRestore(event: PageTransitionEvent) {
  if (event.persisted) busy.value = null
}
onMounted(() => window.addEventListener('pageshow', resetOnRestore))
onBeforeUnmount(() => window.removeEventListener('pageshow', resetOnRestore))
</script>

<template>
  <AppShell
    kind="bare"
    flush
  >
    <div class="grid flex-1 md:grid-cols-[1.15fr_1fr]">
      <div
        class="relative flex flex-col overflow-hidden border-r-(length:--cp-bw) border-line bg-primary p-10 text-on-primary max-md:hidden"
        aria-hidden="true"
      >
        <img
          src="/sunburst.svg"
          alt=""
          class="absolute top-[42%] left-[60%] w-[1100px] max-w-none -translate-1/2 opacity-50"
        >
        <!-- Headline and text on a solid sticker card, off the sunburst (#32). -->
        <div class="relative flex max-w-[420px] flex-col gap-2.5 self-start rounded-xl bg-surface p-6 text-ink outline-memphis shadow-card">
          <p class="m-0 font-display text-[56px] leading-[.92]">
            {{ t('auth.heroTitle') }}
          </p>
          <p class="m-0 text-[17px] font-semibold">
            {{ t('auth.heroText') }}
          </p>
        </div>
        <!-- Compibert stands on the bottom edge and is cut off by it, so he peeks up (#32). -->
        <div class="absolute right-8 bottom-0 translate-y-[14%]">
          <Compibert
            variant="full"
            :size="300"
          />
        </div>
      </div>

      <div class="flex flex-col items-center justify-center gap-[18px] px-[22px] py-6 md:p-10">
        <Compibert
          variant="bust"
          :size="120"
          class="md:hidden"
        />
        <SignInCard
          :invited="invited"
          :invite="invite"
          :busy="busy"
          :failed="failed"
          @sign-in="signIn"
        />
      </div>
    </div>

    <footer class="flex flex-wrap justify-center gap-x-5 gap-y-2 border-t-(length:--cp-bw) border-line bg-surface px-4 py-3 text-small">
      <NuxtLink
        to="/impressum"
        class="font-bold text-ink"
      >
        {{ t('legal.links.impressum') }}
      </NuxtLink>
      <NuxtLink
        to="/datenschutz"
        class="font-bold text-ink"
      >
        {{ t('legal.links.datenschutz') }}
      </NuxtLink>
    </footer>
  </AppShell>
</template>
