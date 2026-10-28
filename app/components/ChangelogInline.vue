<script setup lang="ts">
import type { Inline } from '~~/shared/changelog'

// Changelog text (09 § ChangelogInline): text, bold, code and links. Links open GitHub (or any page) in a
// new tab; a link named „#64“ is an Issue chip, and parentheses that only wrap Issue chips go
// („… geändert. ([#49](…), [#52](…))“ reads „… geändert. #49, #52“).
const props = defineProps<{ nodes: Inline[] }>()

const { t } = useI18n()

const isIssue = (node?: Inline) => node?.type === 'link' && /^#\d+$/.test(node.text)

const parts = computed(() => {
  const nodes = props.nodes.map(node => ({ ...node }))
  nodes.forEach((open, i) => {
    if (open.type !== 'text' || !open.text.endsWith('(')) return
    let last = i + 1
    while (isIssue(nodes[last]) && nodes[last + 1]?.type === 'text' && nodes[last + 1]!.text === ', ' && isIssue(nodes[last + 2])) last += 2
    const close = nodes[last + 1]
    if (!isIssue(nodes[last]) || close?.type !== 'text' || !close.text.startsWith(')')) return
    open.text = `${open.text.slice(0, -1).trimEnd()} `
    close.text = close.text.slice(1)
  })
  return nodes
})
</script>

<template>
  <template
    v-for="(node, i) in parts"
    :key="i"
  >
    <strong
      v-if="node.type === 'bold'"
      class="font-extrabold"
    >{{ node.text }}</strong>
    <code
      v-else-if="node.type === 'code'"
      class="rounded-[6px] border-[1.5px] border-line-soft bg-paper-2 px-1.5 py-px font-mono text-[.86em] font-bold"
    >{{ node.text }}</code>
    <a
      v-else-if="node.type === 'link' && isIssue(node)"
      :href="node.href"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="t('news.issue', { n: node.text.slice(1) })"
      :title="t('news.issue', { n: node.text.slice(1) })"
      class="inline-flex h-[22px] items-center rounded-pill border-2 border-line bg-surface-2 px-[7px] align-[2px] font-mono text-[12px] leading-none font-bold text-ink no-underline transition-colors dur-fast hover:bg-primary hover:text-on-primary"
    >{{ node.text }}</a>
    <a
      v-else-if="node.type === 'link'"
      :href="node.href"
      target="_blank"
      rel="noopener noreferrer"
      :title="t('news.newTab')"
      class="font-bold text-ink underline decoration-2 underline-offset-[3px] transition-colors dur-fast hover:text-focus"
    >{{ node.text }}</a>
    <template v-else>
      {{ node.text }}
    </template>
  </template>
</template>
