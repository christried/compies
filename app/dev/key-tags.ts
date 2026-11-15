import { createTextVNode, Text } from 'vue'
import { tagKey } from '~~/shared/key-tag'

// The post-translation handler of the key tags (#627): vue-i18n calls it with every finished text and the key the caller passed, and what it
// returns is what the page shows. Imported by app/dev/key-tags-plugin.ts only, which the `key-tags` module in nuxt.config.ts registers on the
// dev server when COMPIES_WORDING=1 asks for it (stage.ts carriesKeyTags), so no production build bundles it.
// A string is the common case. `<i18n-t>` hands over an array of vnodes, a Text vnode for each string part around the slots: each part is
// tagged with the same key, and a slot's own vnode passes through. Anything else stays as it is.
// Generic in what vue-i18n hands over, so the composer's own handler type accepts it.
export function tagTranslation<T>(translated: T, key: string): T {
  if (typeof translated === 'string') return tagKey(key, translated) as T
  if (Array.isArray(translated)) {
    return translated.map(item => (item && item.type === Text && typeof item.children === 'string' ? createTextVNode(tagKey(key, item.children)) : item)) as T
  }
  return translated
}
