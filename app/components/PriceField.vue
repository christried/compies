<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'
import { apiErrorKey } from '~/utils/api-error'
import { formatFullDay } from '~/utils/berlin-time'
import { priceSourceLabel, type PriceDraft } from '~/utils/price'
import {
  PRICE_SOURCES, formatPriceAmount, parsePriceAmount, priceTakesAmount, type GamePrice, type GameView, type PriceSource,
} from '~~/shared/game'

// The Price group of the game form (#337, #361; GLOSSARY: Price): the amount, the source, the „Stand“ line with
// „Preis stimmt noch“, and „Preis entfernen“. It owns its inputs and its rules' wording; the form reads the Price
// through `v-model` (the amount as typed, the source, null while neither is set) and the one blocker of the Price
// through `error`. The rules themselves are the shared ones (shared/game.ts). `failure` tells the form why the
// confirm was refused, for its banner.
const model = defineModel<PriceDraft>({ required: true })
const props = defineProps<{
  /** The Price the server holds: the „Stand“ line and „Preis stimmt noch“ read it (#337). */
  stored: GamePrice | null
  /** Edit mode: the game „Preis stimmt noch“ PATCHes. Undefined in create mode. */
  gameId?: string
  /** The form's save attempt: a missing amount or source shows only after it (#337). */
  attempted: boolean
}>()
const emit = defineEmits<{
  error: [message: string | null]
  failure: [message: string | null]
}>()

const { t } = useI18n()
const { toast } = useToast()

// The model is read once, here: the field's own refs are the Price while the User types.
const initialCents = model.value?.cents ?? null
const priceText = ref(typeof initialCents === 'number' ? formatPriceAmount(initialCents) : (initialCents ?? ''))
const priceSource = ref<PriceSource | ''>(model.value?.source ?? '')
const storedPrice = ref<GamePrice | null>(props.stored)
const confirming = ref(false)
const sourceId = useId()
const sourceErrorId = `${sourceId}-error`

// Free-to-play and Abo take no amount, so choosing one empties the amount field. The amount is the shared
// rule's (parsePriceAmount); the errors show at once for a wrong amount, and for a missing one only after a save attempt.
const amountless = computed(() => priceSource.value !== '' && !priceTakesAmount(priceSource.value))
watch(priceSource, (source) => {
  if (source !== '' && !priceTakesAmount(source)) priceText.value = ''
})
const priceCents = computed(() => parsePriceAmount(priceText.value))
const priceEntered = computed(() => priceText.value.trim() !== '')
const amountError = computed(() => {
  if (amountless.value) return undefined
  if (priceEntered.value && priceCents.value === null) return t('gameEdit.priceRange')
  if (props.attempted && priceSource.value !== '' && !priceEntered.value) return t('gameEdit.priceRange')
  return undefined
})
const amountHelp = computed(() => {
  if (amountless.value) return t('gameEdit.priceNoAmount')
  return amountError.value ? undefined : t('gameEdit.priceAmountHelp')
})
const sourceError = computed(() => (props.attempted && priceEntered.value && priceSource.value === '' ? t('gameEdit.priceNeedsSource') : undefined))
const sourceOptions = computed(() => PRICE_SOURCES.map(source => ({ value: source, label: priceSourceLabel(source, t) })))
/** The source the FilterSelect chose: a value that is no source is „none chosen“ (#362). */
function setSource(value: string) {
  priceSource.value = PRICE_SOURCES.find(source => source === value) ?? ''
}

// The Price as the form holds it (#337): the amount as cents, or as its text when the shared rule refuses it, so the
// rules refuse the body too; the source, or null while none is chosen.
const price = computed<PriceDraft>(() => (priceEntered.value || priceSource.value !== ''
  ? { cents: amountless.value ? null : (priceCents.value ?? priceText.value), source: priceSource.value || null }
  : null))
// `flush: 'sync'`: the form's submit reads its Price in the same tick as the click, so the model must not lag a flush (#361).
watch(price, (value) => {
  model.value = value
}, { flush: 'sync' })

const blocker = computed<string | null>(() => sourceError.value ?? amountError.value ?? null)
watch(blocker, message => emit('error', message), { flush: 'sync' })

/** „Preis entfernen“ (#337): empties both fields; in edit mode nothing is deleted until the form's save sends `price: null`. */
function removePrice() {
  priceText.value = ''
  priceSource.value = ''
}

/**
 * „Preis stimmt noch“ (#337, edit mode): stamps today's day on the stored Price. It sends the flag alone (#360): the server
 * restamps the day on its own row, so nothing the page holds, and nothing a Host changed since the page loaded, is written back.
 */
async function confirmPrice() {
  const gameId = props.gameId
  if (!gameId || confirming.value) return
  confirming.value = true
  emit('failure', null)
  try {
    const answer = await $fetch<GameView>(`/api/games/${gameId}`, {
      method: 'PATCH',
      body: { priceChecked: true },
    })
    storedPrice.value = answer.price
    toast({ tone: 'success', text: t('gameEdit.priceConfirmed') })
    // The page does not navigate: the list and the game's own page show the new day (no `saved` event).
    await Promise.all([refreshGameLibrary(), refreshNuxtData(libraryGameKey(gameId))])
  }
  catch (error) {
    emit('failure', t(apiErrorKey(error)))
  }
  finally {
    confirming.value = false
  }
}
</script>

<template>
  <fieldset class="m-0 flex min-w-0 flex-col gap-2.5 border-0 p-0">
    <legend class="mb-1.5 text-[14px] font-bold">
      {{ t('gameEdit.price') }}
    </legend>
    <div class="grid grid-cols-2 gap-2.5">
      <TextField
        v-model="priceText"
        :label="t('gameEdit.priceAmount')"
        :help="amountHelp"
        :error="amountError"
        :disabled="amountless"
        inputmode="text"
        autocomplete="off"
      />
      <div class="flex min-w-0 flex-col gap-1.5">
        <label
          :for="sourceId"
          class="text-[14px] font-bold"
        >{{ t('gameEdit.priceSource') }}</label>
        <FilterSelect
          :id="sourceId"
          :model-value="priceSource"
          variant="field"
          :options="sourceOptions"
          :empty-label="t('gameEdit.priceSourceNone')"
          :invalid="Boolean(sourceError)"
          :aria-describedby="sourceError ? sourceErrorId : undefined"
          @update:model-value="setSource"
        />
        <span
          v-if="sourceError"
          :id="sourceErrorId"
          class="flex items-center gap-1.5 text-small font-bold text-error-fg"
        >
          <AppIcon
            :icon="CircleAlert"
            :size="14"
          />
          {{ sourceError }}
        </span>
      </div>
    </div>
    <div
      v-if="storedPrice"
      class="flex flex-wrap items-center gap-3"
    >
      <span class="text-small text-ink-2">{{ t('gameEdit.priceChecked', { day: formatFullDay(new Date(storedPrice.checkedAt)) }) }}</span>
      <AppButton
        variant="secondary"
        :disabled="confirming"
        @click="confirmPrice"
      >
        {{ t('gameEdit.priceConfirm') }}
      </AppButton>
    </div>
    <div v-if="priceText !== '' || priceSource !== ''">
      <AppButton
        variant="secondary"
        @click="removePrice"
      >
        {{ t('gameEdit.priceRemove') }}
      </AppButton>
    </div>
  </fieldset>
</template>
