<script setup lang="ts">
import { CircleAlert } from '@lucide/vue'

// Fields that belong together (from and to, start, end and length, amount and source) with ONE message line under
// them, as wide as the group (#797, CODING_STANDARDS § Copy). The members (TextField, DateTimeField, the Price source)
// register their shown message; the line shows the first, once. The default slot gets it as `error`, so a hint under a
// member can give way to the line.
const { errorId, error } = provideFieldGroup()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <slot :error="error" />
    <span
      v-if="error"
      :id="errorId"
      class="flex items-center gap-1.5 text-small font-bold text-error-fg"
    >
      <AppIcon
        :icon="CircleAlert"
        :size="14"
      />
      {{ error }}
    </span>
  </div>
</template>
