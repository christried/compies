import type { Ref } from 'vue'

// A text area as tall as its text (#223). Browsers with `field-sizing: content` do it themselves, so this does
// nothing there; the rest get the height set from the scroll height whenever the value changes. Shared by the
// Vote note (#102) and the multiline TextField (#223), so both grow the same way.
export function useAutoHeight(el: Readonly<Ref<HTMLTextAreaElement | null>>, value: () => string) {
  function resize() {
    const node = el.value
    if (!node || globalThis.CSS?.supports?.('field-sizing', 'content')) return
    // 2 px borders, border-box: the scroll height plus the borders is the height that shows every line.
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight + 4}px`
  }

  onMounted(resize)
  watch(value, resize, { flush: 'post' })

  return { resize }
}
