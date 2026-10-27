<script setup lang="ts">
import { ChevronRight, LoaderCircle } from '@lucide/vue'
import { apiFailure } from '~/utils/api-error'
import { SIGN_IN_PATH } from '~/utils/auth-guard'
import type { InvitePreview, JoinedEvent } from '~~/shared/event'
import { eventPath } from '~~/shared/links'

// The Invite link `/e/<slug>-<token>` (#10, ADR 0006, screen 07 `App Einstieg ?s=open`). A signed-out
// visitor sees the Event name and the Host's Display name and avatar, nothing else, and is sent to
// sign-in with the link as the redirect. A signed-in User joins on the Bench and moves on to the
// Event link. Invalid and rotated links get the generic page; a former Member of a deleted
// Event gets „Event gelöscht“.

const props = defineProps<{ invite: string }>()

const { t } = useI18n()
const { toast } = useToast()
const user = useAuthUser()
const signedIn = user.value !== null

useHead({ title: () => t(signedIn ? 'invite.kicker' : 'auth.titleInvite') })

const { data: preview, error: previewError } = await useFetch<InvitePreview>(`/api/invite/${props.invite}`, { immediate: !signedIn })
const previewFailed = computed(() => !signedIn && !!previewError.value)
// The sign-in returns to this Invite link, which is the current route.
const signInPath = `${SIGN_IN_PATH}?redirect=${encodeURIComponent(useRoute().path)}`

const failure = ref<'invalid' | 'deleted' | null>(null)

async function join() {
  try {
    const { slug, joined } = await $fetch<JoinedEvent>(`/api/invite/${props.invite}`, { method: 'POST' })
    if (joined) toast({ tone: 'success', text: t('invite.joinedToast') })
    await navigateTo(eventPath(slug), { replace: true })
  }
  catch (error) {
    failure.value = apiFailure(error).status === 410 ? 'deleted' : 'invalid'
  }
}

onMounted(() => {
  if (signedIn) join()
})
</script>

<template>
  <AppShell
    kind="bare"
    flush
  >
    <div class="flex flex-1 flex-col items-center justify-center px-[22px] py-10 md:p-10">
      <FullScreenState
        v-if="failure || previewFailed"
        :kind="failure ?? 'invalid'"
      >
        <template #actions>
          <AppButton
            to="/"
            size="lg"
          >
            {{ t('errorPage.home') }}
            <AppIcon :icon="ChevronRight" />
          </AppButton>
        </template>
      </FullScreenState>

      <div
        v-else-if="preview"
        class="flex w-full max-w-[480px] flex-col items-center gap-4 text-center"
      >
        <span class="inline-flex h-[26px] items-center rounded-pill border-2 border-line bg-primary px-2.5 text-small font-extrabold text-on-primary">
          {{ t('invite.kicker') }}
        </span>
        <UserAvatar
          :name="preview.host.name"
          :image="preview.host.image"
          :size="64"
        />
        <h1 class="m-0 text-[34px] leading-none text-balance">
          {{ t('auth.invitedBy', { host: preview.host.name, event: preview.eventName }) }}
        </h1>
        <p class="m-0 max-w-[42ch] text-body text-pretty text-ink-2">
          {{ t('auth.intro') }}
        </p>
        <AppButton
          :to="signInPath"
          size="lg"
          class="w-full max-w-[340px]"
        >
          {{ t('auth.joinAndSignIn') }}
          <AppIcon :icon="ChevronRight" />
        </AppButton>
      </div>

      <div
        v-else
        role="status"
        class="flex flex-col items-center gap-3 text-ink-2"
      >
        <AppIcon
          :icon="LoaderCircle"
          :size="28"
          class="animate-spin reduced:animate-none motion-reduce:animate-none"
        />
        <span>{{ t('invite.joining') }}</span>
      </div>
    </div>
  </AppShell>
</template>
