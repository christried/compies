import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, resolveComponent } from 'vue'
import { useI18n } from 'vue-i18n'
import { tagTranslation } from '~/dev/key-tags'
import { decodeTags, stripTags } from '~~/shared/key-tag'

// The key tags on a real vue-i18n composer (app/dev/key-tags.ts, #627): the proof that one handler on the global composer reaches the
// texts a page shows, the `<i18n-t>` ones included. Each case reads the DOM the way scripts/wording/read-keys.mjs does: every text node
// and attribute that holds a tag gives its key and its visible text.
const TAG_CHARACTER = /[⁠⁢⁣]/u

const Probe = defineComponent({
  setup() {
    const { t } = useI18n()
    const version = resolveComponent('i18n-t')
    return () => h('div', [
      h('p', { id: 'plain' }, t('app.name')),
      h('p', { id: 'placeholders' }, t('phase.game', { n: 3, total: 5 })),
      h('p', { id: 'one' }, t('board.slotsFree', 1)),
      h('p', { id: 'many' }, t('board.slotsFree', 2)),
      h('input', { 'id': 'field', 'aria-label': t('auth.title'), 'placeholder': t('common.counter', { n: 1, max: 5 }) }),
      h(version, { keypath: 'legal.links.version', scope: 'global', tag: 'span', id: 'fragments' }, { v: () => h('b', '0.13.3') }),
    ])
  },
})

function textNodesOf(root: Element): string[] {
  const found: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) found.push(node.nodeValue ?? '')
  return found
}

describe('key tags on the global composer', () => {
  beforeEach(() => {
    useNuxtApp().$i18n.setPostTranslationHandler(tagTranslation)
  })
  afterEach(() => {
    useNuxtApp().$i18n.setPostTranslationHandler(null)
  })

  it('a plain text gives back its key and its text', async () => {
    const page = await mountSuspended(Probe)

    const [tag] = decodeTags(page.get('#plain').element.textContent).tags
    expect(tag).toMatchObject({ key: 'app.name', text: 'Compies' })
  })

  it('a text with placeholders gives the key and the text as rendered', async () => {
    const page = await mountSuspended(Probe)

    const decoded = decodeTags(page.get('#placeholders').element.textContent)
    expect(decoded.tags).toEqual([expect.objectContaining({ key: 'phase.game', text: 'Spiel 3 von 5' })])
    expect(decoded.text).toBe('Spiel 3 von 5')
  })

  it('a plural message gives the key and the form as rendered', async () => {
    const page = await mountSuspended(Probe)

    expect(decodeTags(page.get('#one').element.textContent).tags[0]).toMatchObject({ key: 'board.slotsFree', text: '1 Platz frei' })
    expect(decodeTags(page.get('#many').element.textContent).tags[0]).toMatchObject({ key: 'board.slotsFree', text: '2 Plätze frei' })
  })

  it('an aria-label and a placeholder give their keys and texts', async () => {
    const page = await mountSuspended(Probe)

    const field = page.get('#field').element
    expect(decodeTags(field.getAttribute('aria-label') ?? '').tags[0]).toMatchObject({ key: 'auth.title', text: 'Anmelden' })
    expect(decodeTags(field.getAttribute('placeholder') ?? '').tags[0]).toMatchObject({ key: 'common.counter', text: '1/5' })
  })

  it('<i18n-t> tags the fragments around its slot with the message key, and the slot stays untagged', async () => {
    const page = await mountSuspended(Probe)

    const host = page.get('#fragments').element
    const tags = textNodesOf(host).flatMap(raw => decodeTags(raw).tags)
    expect(tags).toEqual([expect.objectContaining({ key: 'legal.links.version', text: 'Version ' })])
    expect(stripTags(host.textContent ?? '')).toBe('Version 0.13.3')
    expect(textNodesOf(page.get('#fragments b').element).some(raw => TAG_CHARACTER.test(raw))).toBe(false)
  })

  it('changes no visible text: without the tag characters the page reads as it does with the handler off', async () => {
    const on = await mountSuspended(Probe)
    const withTags = on.element.textContent ?? ''
    expect(TAG_CHARACTER.test(withTags)).toBe(true)

    useNuxtApp().$i18n.setPostTranslationHandler(null)
    const off = await mountSuspended(Probe)

    expect(stripTags(withTags)).toBe(off.element.textContent)
  })
})

describe('without the handler (the switch is off)', () => {
  it('no tag character is rendered anywhere', async () => {
    const page = await mountSuspended(Probe)

    expect(TAG_CHARACTER.test(page.html())).toBe(false)
    expect(TAG_CHARACTER.test(page.element.textContent ?? '')).toBe(false)
  })
})
