import type { MaybeRefOrGetter, Ref } from 'vue'
import type { ShareFormat } from '~~/shared/share-image'

// The real PNG of the Share image for the sheet (#313): one request per format while the sheet is open, kept for as long as it stays open, so
// toggling back asks nothing. A newer format aborts the older request, and an answer that arrives late is dropped. Every object URL is revoked
// when the sheet closes, and the sheet asks nothing while it is closed. The blob is kept next to its URL because „Teilen“ must hand the file to
// `navigator.share` inside the click (iOS Safari refuses after an awaited fetch).

export type ShareImageStatus = 'loading' | 'ready' | 'error'

interface Entry {
  status: ShareImageStatus
  url: string | null
  blob: Blob | null
}

export function useShareImage(slug: MaybeRefOrGetter<string>, format: Ref<ShareFormat>, active: Ref<boolean>) {
  const entries = ref<Partial<Record<ShareFormat, Entry>>>({})
  let loading: { format: ShareFormat, controller: AbortController } | null = null

  function drop(which: ShareFormat) {
    const url = entries.value[which]?.url
    if (url) URL.revokeObjectURL(url)
    entries.value[which] = undefined
  }

  function abort() {
    if (!loading) return
    loading.controller.abort()
    drop(loading.format)
    loading = null
  }

  async function load(which: ShareFormat) {
    abort()
    const controller = new AbortController()
    const mine = { format: which, controller }
    loading = mine
    entries.value[which] = { status: 'loading', url: null, blob: null }
    try {
      const blob = await $fetch<Blob>(`/api/e/${toValue(slug)}/share-image`, { query: { format: which }, responseType: 'blob', retry: 0, signal: controller.signal })
      if (loading !== mine) return
      entries.value[which] = { status: 'ready', url: URL.createObjectURL(blob), blob }
    }
    catch {
      if (loading !== mine) return
      entries.value[which] = { status: 'error', url: null, blob: null }
    }
    loading = null
  }

  watch([active, format], ([isActive, which]) => {
    if (!isActive) {
      abort()
      for (const key of Object.keys(entries.value) as ShareFormat[]) drop(key)
      return
    }
    // Another format was loading: its answer is not wanted any more.
    if (loading && loading.format !== which) abort()
    const entry = entries.value[which]
    if (!entry || (entry.status === 'error')) void load(which)
  }, { immediate: true })

  onBeforeUnmount(() => {
    abort()
    for (const key of Object.keys(entries.value) as ShareFormat[]) drop(key)
  })

  const current = computed(() => entries.value[format.value])

  return {
    status: computed<ShareImageStatus>(() => current.value?.status ?? 'loading'),
    url: computed(() => current.value?.url ?? null),
    blob: computed(() => current.value?.blob ?? null),
    retry: () => load(format.value),
  }
}
