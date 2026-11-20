<script setup lang="ts">
// Fields that belong together (from and to, start, end and length, amount and source) with ONE message line under
// them, as wide as the group (#797, CODING_STANDARDS § Copy). The members (TextField, the Price source's
// FieldGroupMember) register their shown message; the line shows the first, once. The default slot gets it as `error`,
// so a hint under a member can give way to the line. (DateTimeField draws its own line and registers in no group.)
const { errorId, error } = provideFieldGroup()
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <slot :error="error" />
    <FieldError
      v-if="error"
      :id="errorId"
    >
      {{ error }}
    </FieldError>
  </div>
</template>
