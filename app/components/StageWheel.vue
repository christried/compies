<script setup lang="ts">
import type { EventView } from '~~/shared/event'

// The wheel block of the Event page (#229, #231, #257): the Lucky Wheel and, while a draw has its Veto window, the window. The page
// lists the block only when the view has the wheel (eventPageState, #256), so `wheel` is there. The Veto bar (VetoBar) is not in
// here: it is a fixed layer that must stay outside the page's TransitionGroup, and the window itself never casts a Veto.
const props = defineProps<{
  view: EventView
  /** The server's clock in epoch ms (the page's useServerClock). */
  serverNow: () => number
}>()

const wheel = computed(() => props.view.wheel!)
</script>

<template>
  <div class="flex flex-col gap-[18px] md:gap-[22px]">
    <LuckyWheel
      :wheel="wheel"
      :hidden="view.settings?.hiddenWheel ?? false"
      :is-host="view.event.isHost"
      :server-now="serverNow"
      :host-games="view.hostGames"
    />
    <VetoWindow
      v-if="wheel.vetoes.draw"
      :wheel="wheel"
      :teams="view.teams"
      :server-now="serverNow"
    />
  </div>
</template>
