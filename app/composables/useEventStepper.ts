import { followTeamSize, type EventDraft } from '~/utils/event-draft'

/**
 * The wiring the Event stepper (`/neu`, #144) and the settings editor (`/e/<slug>/einstellungen`, #147) share: which
 * step is current, the blocker the steps report, the info column's topic and the Team size rule. `keys` are the
 * page's steps (copy in `stepper.steps.<key>`), `draft` its draft. Each page keeps its own submit and what follows it.
 */
export function useEventStepper<K extends string>(keys: readonly K[], draft: Ref<EventDraft>) {
  const { t } = useI18n()

  // An untouched Veto allowance follows the Team size (#145); a stored one counts as chosen (draftFromEvent).
  watch(() => draft.value.settings.teamSize, () => {
    draft.value = followTeamSize(draft.value)
  })

  const current = ref(0)
  /** The furthest step the Host has been on; `/neu` links the steps up to it. */
  const reached = ref(0)
  /** Why the current step cannot go on; each step reports it through `v-model:blocker`. */
  const blocker = ref<string | null>(null)
  /** What the last submit answered; a step change clears it. */
  const failure = ref<string | null>(null)

  const steps = computed(() => keys.map(key => ({ key, label: t(`stepper.steps.${key}.label`) })))
  const stepKey = computed<K>(() => keys[current.value]!)
  // The info column explains the Format or, on the Selection mode step, the chosen mode (#145), and the Tiebreaker pool (#146).
  const infoTopic = computed(() => {
    if (stepKey.value === 'format') return draft.value.settings.format
    if (stepKey.value === 'mode') return draft.value.settings.selectionMode === 'lucky_wheel' ? 'wheel' : 'admin'
    if (stepKey.value === 'tiebreaker') return 'tiebreaker'
    return null
  })
  const infoTitle = computed(() => (infoTopic.value ? t(`setup.info.${infoTopic.value}.title`) : undefined))
  const isLast = computed(() => current.value === keys.length - 1)

  function go(index: number) {
    current.value = index
    failure.value = null
  }

  /** One step on (not past the last), remembering how far the Host has come. */
  function advance() {
    go(current.value + 1)
    reached.value = Math.max(reached.value, current.value)
  }

  return { current, reached, blocker, failure, steps, stepKey, infoTopic, infoTitle, isLast, go, advance }
}
