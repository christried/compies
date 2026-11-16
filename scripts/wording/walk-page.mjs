// The page scripts of the wording walk (#629): expressions the walk evaluates in the page, as strings, like read-keys.mjs's. They share the
// page's `window.__wordingNodes` (set by `findCandidates`: entry `i` is a text node, or the element for an attribute) and add
// `window.__wordingExtra` (the untagged texts `UNTAGGED` finds). A string literal here is a template literal: `\\u2060` is the page's `⁠`.

/**
 * Per entry of `window.__wordingNodes`, the element's `mono`, `srOnly` and `component`, in the same order, plus the mono family read from the token.
 * `mono`: the first family of the computed font equals the first family of `--cp-font-mono` (`app/assets/css/compies-tokens.css`; read, never typed).
 * `srOnly`: the element or an ancestor is clipped to 1 x 1 px or less (Tailwind's `sr-only`). `component`: the first `__vueParentComponent.type.__file` up
 * the ancestors, which Vue's dev build sets (absolute: the walk makes it repo-relative).
 */
export const DESCRIBE = `(() => {
  const family = text => text.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase()
  const mono = family(getComputedStyle(document.documentElement).getPropertyValue('--cp-font-mono'))
  const known = new Map()
  const describe = el => {
    if (!known.has(el)) {
      let srOnly = false
      for (let up = el; up && up !== document.body && !srOnly; up = up.parentElement) {
        const rect = up.getBoundingClientRect()
        srOnly = rect.width <= 1 && rect.height <= 1 && getComputedStyle(up).overflow !== 'visible'
      }
      let component = null
      for (let up = el; up && !component; up = up.parentElement) component = up.__vueParentComponent?.type?.__file ?? null
      known.set(el, { mono: mono !== '' && family(getComputedStyle(el).fontFamily) === mono, srOnly, component })
    }
    return known.get(el)
  }
  return { family: mono, items: (window.__wordingNodes ?? []).map(node => describe(node.nodeType === 1 ? node : node.parentElement)) }
})()`

/**
 * The visible text nodes without a tag, for the mono elements and the fixed texts, and the fields set in the mono font. `wanted` is
 * `{ exact: [[id, text]], months: [[id, patternSource]] }` (the fixed texts this state may show): the first node that equals a text or matches a
 * month pattern is returned with the id. Mono: one entry per `(component, local name)`. Everything returned is kept in `window.__wordingExtra[ref]`
 * (a `{ node, from, to }` or an `{ el }`) for `PICTURE`. A field's value never leaves the page (`text` is the placeholder, or empty).
 */
export const untaggedScript = wanted => `((wanted) => {
  const OPEN = /\\u2060[\\u2062\\u2063]/
  const SKIP = new Set(['script', 'style', 'noscript', 'template'])
  const family = text => text.split(',')[0].trim().replace(/^["']|["']$/g, '').toLowerCase()
  const mono = family(getComputedStyle(document.documentElement).getPropertyValue('--cp-font-mono'))
  const extra = (window.__wordingExtra = [])
  const monoSeen = new Set()
  const result = { count: 0, mono: [], fixed: [] }
  const fixedSeen = new Set()
  const componentOf = el => {
    for (let up = el; up; up = up.parentElement) {
      const file = up.__vueParentComponent?.type?.__file
      if (file) return file
    }
    return null
  }
  const isMono = el => mono !== '' && family(getComputedStyle(el).fontFamily) === mono
  const painted = rects => [...rects].some(rect => rect.width > 0 && rect.height > 0)
  const noteMono = (el, text, target) => {
    const component = componentOf(el)
    const id = component + '|' + el.localName
    if (monoSeen.has(id)) return
    monoSeen.add(id)
    result.mono.push({ ref: extra.push(target) - 1, component, element: el.localName, text })
  }
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.nodeType === 1 && (SKIP.has(node.localName) || node.id === 'nuxt-devtools-container' || node.id === 'wording-frame') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === 1) {
      if ((node.localName === 'input' || node.localName === 'textarea') && (node.value || node.placeholder) && painted(node.getClientRects()) && isMono(node)) {
        noteMono(node, node.value ? '' : node.placeholder.slice(0, 60), { el: node })
      }
      continue
    }
    const raw = node.nodeValue ?? ''
    const text = raw.trim()
    if (text === '' || OPEN.test(raw)) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    if (!painted(range.getClientRects())) continue
    result.count++
    const el = node.parentElement
    const from = raw.indexOf(text)
    const target = { node, from, to: from + text.length }
    if (isMono(el)) noteMono(el, text.slice(0, 60), target)
    for (const [id, fixed] of wanted.exact) {
      if (text === fixed && !fixedSeen.has(id)) {
        fixedSeen.add(id)
        result.fixed.push({ id, ref: extra.push(target) - 1, text })
      }
    }
    for (const [id, source] of wanted.months) {
      if (!fixedSeen.has(id) && new RegExp(source).test(text)) {
        fixedSeen.add(id)
        result.fixed.push({ id, ref: extra.push(target) - 1, text })
      }
    }
  }
  return result
})(${JSON.stringify(wanted)})`

/**
 * The picture's preparation. `target` is `{ list: 'nodes' | 'extra', i, from?, to?, labelled?: true }` or `{ selector }`: the text (a Range over
 * `[from, to]`) or the element. A text that is only read out (`labelled`) takes the box of the nearest ancestor wider and higher than 1 px.
 * Scrolls the element to the middle when its box is not fully in the viewport, measures it live, and when something else is at its centre
 * (`elementFromPoint` is neither inside nor around the element: a dialog over the page) answers `{ skip: 'covered' }`. Otherwise it draws
 * `div#wording-frame` around the box (3 px #ff00aa, outline offset 2 px, never takes a click) and answers `{ box }` in viewport CSS px, clipped to the viewport.
 */
export const pictureScript = target => `((target) => {
  document.getElementById('wording-frame')?.remove()
  const entry = target.selector ? document.querySelector(target.selector) : (target.list === 'extra' ? window.__wordingExtra : window.__wordingNodes)?.[target.i]
  if (!entry) return { skip: 'notPainted' }
  const isText = !target.selector && (entry.node ? true : entry.nodeType === 3)
  const node = entry.node ?? entry
  const from = target.from ?? entry.from
  const to = target.to ?? entry.to
  let el = isText ? node.parentElement : (entry.el ?? entry)
  if (isText && target.labelled) {
    for (; el && el !== document.body; el = el.parentElement) {
      const rect = el.getBoundingClientRect()
      if (rect.width > 1 && rect.height > 1) break
    }
  }
  if (!el) return { skip: 'notPainted' }
  const measure = () => {
    const rects = (isText && !target.labelled ? (() => {
      try {
        const range = document.createRange()
        range.setStart(node, from)
        range.setEnd(node, to)
        return [...range.getClientRects()]
      }
      catch { return [] }
    })() : [el.getBoundingClientRect()]).filter(rect => rect.width > 0 && rect.height > 0)
    if (!rects.length) return null
    return { left: Math.min(...rects.map(r => r.left)), top: Math.min(...rects.map(r => r.top)), right: Math.max(...rects.map(r => r.right)), bottom: Math.max(...rects.map(r => r.bottom)) }
  }
  let box = measure()
  if (!box) return { skip: 'notPainted' }
  if (box.left < 0 || box.top < 0 || box.right > innerWidth || box.bottom > innerHeight) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' })
    box = measure()
    if (!box) return { skip: 'notPainted' }
  }
  const at = [Math.min(Math.max((box.left + box.right) / 2, 0), innerWidth - 1), Math.min(Math.max((box.top + box.bottom) / 2, 0), innerHeight - 1)]
  const hit = document.elementFromPoint(at[0], at[1])
  if (!hit || !(el.contains(hit) || hit.contains(el))) return { skip: 'covered' }
  const round = n => Math.round(n * 100) / 100
  const clipped = { x: Math.max(box.left, 0), y: Math.max(box.top, 0), right: Math.min(box.right, innerWidth), bottom: Math.min(box.bottom, innerHeight) }
  if (clipped.right - clipped.x <= 0 || clipped.bottom - clipped.y <= 0) return { skip: 'notPainted' }
  const frame = document.createElement('div')
  frame.id = 'wording-frame'
  frame.style.cssText = 'position:fixed;box-sizing:border-box;pointer-events:none;z-index:2147483647;outline:3px solid #ff00aa;outline-offset:2px;left:' + box.left + 'px;top:' + box.top + 'px;width:' + (box.right - box.left) + 'px;height:' + (box.bottom - box.top) + 'px'
  document.documentElement.append(frame)
  return { box: { x: round(clipped.x), y: round(clipped.y), width: round(clipped.right - clipped.x), height: round(clipped.bottom - clipped.y) } }
})(${JSON.stringify(target)})`

/** Takes the frame away and scrolls back to the top: after the last picture of a reading. */
export const CLEAR_FRAME = `(() => {
  document.getElementById('wording-frame')?.remove()
  scrollTo(0, 0)
})()`
