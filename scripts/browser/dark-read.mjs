// The reader of the Dunkel-Check (#407): two page functions that read computed styles and return raw values. They judge
// nothing (`contrast.mjs` does). `dark.mjs` evaluates `READ` per state and, after the screenshot, `READ_RINGS` (focus
// can change a page). The functions are written as functions so eslint reads them and sent as source: each is
// self-contained, because it runs in the page.
//
// A Raw item: `key` is its DOM path from <body> (`div:2>main:1>h1:1`, plus `#t<n>` for the n-th text node), `role` the
// role attribute else the tag, `text` the trimmed text content (at most 60 characters), `behind` the layers under it,
// nearest first, up to the first opaque one or the canvas. See `contrast.mjs` for the layer shape.

/**
 * What the check leaves out: #398 says „Illustrations and stage pieces keep their fixed colours and are left out of the
 * measurement“. An element that matches one or sits inside one is counted in `excluded` and produces nothing.
 */
export const EXCLUDED = [
  // Compibert, the bust and the rig: fixed colours, a sticker (`Compibert.vue`, `CompibertRig.vue`).
  { selector: '.compibert, .compibert-rig', why: 'Compibert' },
  // The construction tape across a page and the marker beside a navigation entry: physical objects, the same in both themes.
  { selector: '.construction-tape, .tape-chip', why: 'the construction tape and the nav marker' },
  // The construction ground with fence and sign: `ConstructionGround.vue` has no hook of its own, only this aria-hidden root around the fence mesh.
  { selector: '[aria-hidden="true"]:has(.fence-mesh)', why: 'the construction ground' },
  // The Coin flip's coin, a fixed-colour piece of the stage (`CoinFlip.vue`).
  { selector: '[data-testid="coin-spin"]', why: 'the coin of the Coin flip' },
  // The Award ceremony's scene, the stage of Compibert's run (`AwardCeremony.vue`): the trophy he carries (fixed colours,
  // „a physical sticker in both themes“) and the box he runs in. The winner card and the rows are measured.
  { selector: '[data-part="compibert"], [data-part="trophy"]', why: 'the Award ceremony scene' },
  // The Share image: `ShareDialog.vue`'s <img>, the blob of `useShareImage`. The server draws it light whatever the Appearance (#398);
  // the frame around it and the sheet are measured.
  { selector: '[role="dialog"] img[src^="blob:"]', why: 'the Share image' },
]

/** The helpers both page functions share. Returns them as an object; runs in the page. */
function makeKit(exclusionSelector) {
  const canvas = document.createElement('canvas')
  canvas.width = 1
  canvas.height = 1
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const cache = new Map()

  // Chrome answers rgb(), rgba(), color(srgb …) (every color-mix) and oklab() (bg-ink/25). rgb(a) is read as written, so
  // a low alpha keeps its exact value; the rest goes through a 1 × 1 canvas, which resolves any CSS colour, with the
  // alpha cut off first (a canvas keeps only 8 bits of it) and read back from the text.
  function toRgba(css) {
    if (cache.has(css)) return cache.get(css)
    let rgba
    const plain = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(css)
    if (plain) {
      rgba = [Number(plain[1]), Number(plain[2]), Number(plain[3]), plain[4] === undefined ? 1 : plain[5] ? Number(plain[4]) / 100 : Number(plain[4])]
    }
    else {
      const alpha = /\/\s*([\d.]+)(%?)\s*\)$/.exec(css)
      const opaque = alpha ? css.replace(/\s*\/\s*[\d.]+%?\s*\)$/, ')') : css
      context.globalCompositeOperation = 'copy'
      context.fillStyle = 'rgba(0, 0, 0, 0)'
      context.fillStyle = opaque
      context.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = context.getImageData(0, 0, 1, 1).data
      rgba = [r, g, b, alpha ? (alpha[2] ? Number(alpha[1]) / 100 : Number(alpha[1])) : a / 255]
    }
    cache.set(css, rgba)
    return rgba
  }

  /** The colour functions in a CSS value (a gradient, a shadow), each as written. */
  function colourTokens(text) {
    const found = []
    const start = /(?:rgba?|color|oklab|oklch|hsla?|lab|lch|hwb)\(/g
    let hit
    while ((hit = start.exec(text))) {
      let depth = 1
      let i = hit.index + hit[0].length
      while (i < text.length && depth) {
        if (text[i] === '(') depth++
        else if (text[i] === ')') depth--
        i++
      }
      found.push(text.slice(hit.index, i))
      start.lastIndex = i
    }
    return found
  }

  const flat = color => ({ color, image: 'none', stops: [] })

  /** Whether an image paints anything at rest: a `background-size` of 0 in a direction (the footer links' highlight, which grows on hover) draws nothing. */
  const drawn = size => size.split(/,(?![^(]*\))/).some(layer => !layer.trim().split(/\s+/).some(part => /^0(?:\.0+)?(?:px|%)?$/.test(part)))

  /** The layers one element paints, nearest first: the image over the background colour. */
  function layersOf(el) {
    const style = getComputedStyle(el)
    const color = toRgba(style.backgroundColor)
    const image = style.backgroundImage
    const layers = []
    if (image !== 'none' && !drawn(style.backgroundSize)) {
      if (color[3] > 0) layers.push(flat(color))
    }
    else if (image !== 'none') {
      const stops = colourTokens(image).map(toRgba)
      // The page texture (`tex-paper`, AppShell) and a stroke over a transparent rest (the footer link's highlight on the
      // current page): the stops go with the layer, so the text is judged on the flat colour and on every stop, the
      // lowest ratio counting, instead of a skip.
      if (el.matches('.tex-paper') || (!image.includes('url(') && stops.length > 1 && stops.some(stop => stop[3] === 0) && stops.some(stop => stop[3] > 0))) layers.push({ color, image: 'texture', stops })
      // A gradient of one colour is the `tint` utility (the hover tint): that colour as a layer of its own, no picture.
      else if (!image.includes('url(') && stops.length && stops.every(stop => stop.join() === stops[0].join())) {
        layers.push(flat(stops[0]))
        if (color[3] > 0) layers.push(flat(color))
      }
      else layers.push({ color, image: 'picture', stops: [] })
    }
    else if (color[3] > 0) layers.push(flat(color))
    return layers
  }

  /** What is under an element: the layers of it and its ancestors up to the first opaque one (`closer`), else the canvas. */
  function behindFrom(start) {
    const behind = []
    let closer = null
    for (let el = start; el; el = el.parentElement) {
      const layers = layersOf(el)
      behind.push(...layers)
      const last = layers.at(-1)
      if (last && last.image !== 'picture' && last.color[3] === 1) {
        closer = el
        break
      }
    }
    if (!closer) behind.push(flat([255, 255, 255, 1]))
    return { behind, closer }
  }

  const tagOf = el => el.tagName.toLowerCase()

  const pathCache = new Map()
  function pathOf(el) {
    if (el === document.body || !el.parentElement) return ''
    if (pathCache.has(el)) return pathCache.get(el)
    const same = [...el.parentElement.children].filter(child => child.tagName === el.tagName)
    const own = `${tagOf(el)}:${same.indexOf(el) + 1}`
    const parent = pathOf(el.parentElement)
    const path = parent ? `${parent}>${own}` : own
    pathCache.set(el, path)
    return path
  }

  const squash = text => text.replace(/\s+/g, ' ').trim().slice(0, 60)
  const role = el => el.getAttribute('role') || tagOf(el)
  const inactive = el => !!el.closest(':disabled, [aria-disabled="true"]')
  const excluded = el => !!exclusionSelector && !!el.closest(exclusionSelector)

  const opacityCache = new Map()
  function opacityOf(el) {
    if (!el) return 1
    if (opacityCache.has(el)) return opacityCache.get(el)
    const value = Number(getComputedStyle(el).opacity) * opacityOf(el.parentElement)
    opacityCache.set(el, value)
    return value
  }

  /** Displayed, `visibility: visible`, and not wholly transparent. */
  function shown(el) {
    const visible = el.checkVisibility
      ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true, checkOpacity: true, checkVisibilityCSS: true })
      : getComputedStyle(el).visibility === 'visible'
    return visible && opacityOf(el) > 0
  }

  /** Clipped to a pixel by an ancestor (the screen-reader-only utility). */
  function clipped(el) {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const style = getComputedStyle(e)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const rect = e.getBoundingClientRect()
      if (rect.width <= 1 || rect.height <= 1) return true
    }
    return false
  }

  /** The element stack at a point; an element with `pointer-events: none` is made hit-testable for the moment. */
  function stackAt(el, x, y) {
    const style = getComputedStyle(el).pointerEvents
    if (style === 'none') el.style.setProperty('pointer-events', 'auto', 'important')
    const stack = document.elementsFromPoint(x, y)
    if (style === 'none') el.style.removeProperty('pointer-events')
    return stack
  }

  /**
   * The middle of what of `rect` can be seen: cut to the viewport and to every ancestor that clips (`overflow` other than visible). A text
   * that runs on past its box (`truncate`: the 60-character game name, #408) has its rect's middle outside the viewport and under the clip;
   * the middle of the part that shows is where it is hit. Null when nothing shows.
   */
  function visibleMiddle(el, rect) {
    let { left, top, right, bottom } = rect
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) {
      const style = getComputedStyle(e)
      if (style.overflowX === 'visible' && style.overflowY === 'visible') continue
      const box = e.getBoundingClientRect()
      if (style.overflowX !== 'visible') {
        left = Math.max(left, box.left)
        right = Math.min(right, box.right)
      }
      if (style.overflowY !== 'visible') {
        top = Math.max(top, box.top)
        bottom = Math.min(bottom, box.bottom)
      }
    }
    left = Math.max(left, 0)
    top = Math.max(top, 0)
    right = Math.min(right, window.innerWidth)
    bottom = Math.min(bottom, window.innerHeight)
    return right > left && bottom > top ? { x: (left + right) / 2, y: (top + bottom) / 2 } : null
  }

  /** Scrolls a rect's element to the middle and returns the stack at the middle of what shows of the rect, or null when that is off the viewport. */
  function reach(el, rectOf) {
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const rect = rectOf()
    const { x, y } = visibleMiddle(el, rect) ?? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return null
    return stackAt(el, x, y)
  }

  /** Not under something else: the top of the stack is the element, a descendant or an ancestor. */
  const free = (el, stack) => !!stack[0] && (stack[0] === el || el.contains(stack[0]) || stack[0].contains(el))

  const inDocument = (rect) => {
    const left = rect.left + window.scrollX
    const top = rect.top + window.scrollY
    return rect.right + window.scrollX > 0 && top + rect.height > 0 && left < document.documentElement.scrollWidth
  }

  const border = (style) => {
    if (!(parseFloat(style.borderTopWidth) > 0) || style.borderTopStyle === 'none' || style.borderTopStyle === 'hidden') return null
    const color = toRgba(style.borderTopColor)
    return color[3] > 0 ? color : null
  }
  const fill = (style) => {
    const color = toRgba(style.backgroundColor)
    return color[3] > 0 ? color : null
  }

  const roots = () => {
    if (!exclusionSelector) return 0
    return [...document.querySelectorAll(exclusionSelector)].filter(el => !el.parentElement?.closest(exclusionSelector)).length
  }

  return { toRgba, colourTokens, behindFrom, pathOf, squash, role, inactive, excluded, opacityOf, shown, clipped, stackAt, reach, free, inDocument, border, fill, roots, tagOf }
}

/** The page's texts, boxes and surfaces. Runs in the page; returns the `Reading` of `dark.mjs`. */
function readPage(kit) {
  const { toRgba, colourTokens, behindFrom, pathOf, squash, role, inactive, excluded, opacityOf, shown, clipped, reach, free, inDocument, border, fill, roots, tagOf } = kit
  const PICTURE = new Set(['IMG', 'PICTURE', 'VIDEO', 'CANVAS', 'SVG', 'IFRAME'])
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'TEXTAREA', 'OPTION', 'SELECT', 'TITLE'])
  const BOX = 'input:not([type=hidden], [type=checkbox], [type=radio], [type=file]), textarea, select, button, a, [role=button], [role=switch], [role=radio], [role=checkbox], [role=tab], [role=combobox]'
  const FIELD = 'input:not([type=hidden], [type=checkbox], [type=radio], [type=file]), textarea, select'
  const texts = []
  const boxes = []
  const surfaces = []
  const unseen = []

  /** Whether something is drawn over the picture-like elements between `el` and what closed its backdrop. */
  function overPicture(el, stack, closer) {
    if (el.closest('svg')) return 'picture'
    for (const e of stack) {
      if (e === closer) break
      if (PICTURE.has(e.tagName.toUpperCase()) && !e.contains(el)) return 'picture'
    }
    return 'none'
  }

  function pushText(el, text, key, rectOf, style, extra = {}) {
    const stack = reach(el, rectOf)
    if (!stack) {
      unseen.push(`${key} (${style.fontSize})`)
      return
    }
    if (!free(el, stack)) return
    const { behind, closer } = behindFrom(el)
    texts.push({
      key,
      role: extra.role ?? role(el),
      text: squash(text),
      behind,
      color: toRgba(extra.color ?? style.color),
      opacity: opacityOf(el),
      size: parseFloat(style.fontSize),
      weight: parseInt(style.fontWeight, 10),
      inactive: inactive(el),
      over: overPicture(el, stack, closer),
    })
  }

  // Text nodes.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) {
    const node = walker.currentNode
    const el = node.parentElement
    if (node.nodeValue.trim() && el && !SKIP.has(el.tagName)) nodes.push(node)
  }
  const range = document.createRange()
  for (const node of nodes) {
    const el = node.parentElement
    if (excluded(el) || !shown(el) || clipped(el)) continue
    range.selectNodeContents(node)
    const first = [...range.getClientRects()].find(rect => rect.width > 0 && rect.height > 0)
    if (!first || first.width <= 1 || first.height <= 1 || !inDocument(first)) continue
    const own = [...el.childNodes].filter(child => child.nodeType === 3)
    pushText(el, node.nodeValue, `${pathOf(el)}#t${own.indexOf(node)}`, () => [...range.getClientRects()].find(rect => rect.width > 0 && rect.height > 0) ?? first, getComputedStyle(el))
  }

  // Fields: a value is a text of role `input`, an empty field's placeholder one of role `placeholder`.
  for (const el of document.querySelectorAll(FIELD)) {
    if (excluded(el) || !shown(el) || clipped(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || !inDocument(rect)) continue
    const style = getComputedStyle(el)
    const value = tagOf(el) === 'select' ? el.selectedOptions[0]?.textContent ?? '' : el.value
    if (value.trim()) pushText(el, value, `${pathOf(el)}#value`, () => el.getBoundingClientRect(), style, { role: 'input' })
    else if (el.placeholder) pushText(el, el.placeholder, `${pathOf(el)}#placeholder`, () => el.getBoundingClientRect(), style, { role: 'placeholder', color: getComputedStyle(el, '::placeholder').color })
  }

  // Boxes: the edge of a control.
  for (const el of document.querySelectorAll(BOX)) {
    if (excluded(el) || !shown(el) || clipped(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || !inDocument(rect)) continue
    const style = getComputedStyle(el)
    let carrier = el
    let edge = border(style)
    let paint = fill(style)
    if (!edge && el.matches(FIELD)) {
      // A field without a border of its own (TagInput) sits in a wrapper that has one: at most three levels up.
      let up = el.parentElement
      for (let i = 0; i < 3 && up; i++, up = up.parentElement) {
        const wrapper = getComputedStyle(up)
        if (border(wrapper)) {
          carrier = up
          edge = border(wrapper)
          paint = paint ?? fill(wrapper)
          break
        }
      }
    }
    if (!edge && !paint) continue
    const stack = reach(el, () => el.getBoundingClientRect())
    if (!stack) {
      unseen.push(`${pathOf(el)} (box)`)
      continue
    }
    if (!free(el, stack)) continue
    // A segmented control's options have no edge of their own: the boundary is the border of their group (#430). Not part of the Dunkel = System comparison.
    const group = el.getAttribute('role') === 'radio' ? el.closest('[role=radiogroup]') : null
    const groupEdge = group ? border(getComputedStyle(group)) : null
    boxes.push({
      key: pathOf(el),
      role: role(el),
      text: squash(el.textContent ?? ''),
      behind: behindFrom(carrier.parentElement).behind,
      border: edge,
      fill: paint,
      group: groupEdge ? { border: groupEdge, behind: behindFrom(group.parentElement).behind } : null,
      inactive: inactive(el),
    })
  }

  /** What each side of a layer's box meets: the window's edge, a neighbour's border, or nothing that draws an edge (#409). */
  function frameOf(el, rect) {
    const width = document.documentElement.clientWidth
    const height = document.documentElement.clientHeight
    const centre = { x: Math.min(Math.max((rect.left + rect.right) / 2, 0), width - 1), y: Math.min(Math.max((rect.top + rect.bottom) / 2, 0), height - 1) }
    const sides = {
      top: { edge: rect.top <= 0.5, at: [centre.x, rect.top - 1], facing: 'Bottom' },
      right: { edge: rect.right >= width - 0.5, at: [rect.right + 1, centre.y], facing: 'Left' },
      bottom: { edge: rect.bottom >= height - 0.5, at: [centre.x, rect.bottom + 1], facing: 'Top' },
      left: { edge: rect.left <= 0.5, at: [rect.left - 1, centre.y], facing: 'Right' },
    }
    const frame = {}
    for (const [side, { edge, at, facing }] of Object.entries(sides)) {
      if (edge) {
        frame[side] = 'window'
        continue
      }
      // 1 px beyond the side's middle: the first element that is not the layer, nor in it, nor the document itself. A neighbour
      // with pointer-events: none is not found and counts as bare, which fails safe (a FAIL, never a hidden one).
      const next = document.elementsFromPoint(...at).find(e => !el.contains(e) && e !== document.documentElement && e !== document.body)
      const style = next && getComputedStyle(next)
      const drawn = style && parseFloat(style[`border${facing}Width`]) >= 2 && !['none', 'hidden'].includes(style[`border${facing}Style`])
      const color = drawn ? toRgba(style[`border${facing}Color`]) : null
      frame[side] = color && color[3] > 0 ? { border: color } : null
    }
    return frame
  }

  // Surfaces: dialogs and sheets, menus, and cards.
  for (const el of document.body.querySelectorAll('*')) {
    const roleAttr = el.getAttribute('role')
    let kind = null
    if (roleAttr === 'dialog' || roleAttr === 'alertdialog') kind = 'dialog'
    else if (roleAttr === 'menu' || roleAttr === 'listbox') kind = 'menu'
    if (!kind && el.matches(BOX)) continue
    if (excluded(el)) continue
    const style = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    if (!kind) {
      if (rect.width < 120 || rect.height < 48 || !fill(style) || !(parseFloat(style.borderTopLeftRadius) >= 8)) continue
      const sides = ['Top', 'Right', 'Bottom', 'Left'].every(side => parseFloat(style[`border${side}Width`]) >= 2 && style[`border${side}Style`] !== 'none')
      if (style.boxShadow === 'none' && !sides) continue
      kind = 'card'
    }
    if (rect.width <= 0 || rect.height <= 0 || !shown(el) || !inDocument(rect)) continue
    const stack = reach(el, () => el.getBoundingClientRect())
    if (!stack) {
      unseen.push(`${pathOf(el)} (surface)`)
      continue
    }
    if (!free(el, stack)) continue
    const shadow = colourTokens(style.boxShadow).map(toRgba)[0] ?? null
    surfaces.push({ key: pathOf(el), role: role(el), text: squash(el.textContent ?? ''), behind: behindFrom(el.parentElement).behind, kind, fill: fill(style), border: border(style), shadow, frame: kind === 'dialog' ? frameOf(el, rect) : null })
  }

  window.scrollTo(0, 0)
  return {
    theme: document.documentElement.getAttribute('data-theme'),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    texts,
    boxes,
    surfaces,
    excluded: roots(),
    unseen,
  }
}

/** The focus rings of every control: each gets `focus()` and its outline is read. Runs in the page, after a Tab press put Chrome in keyboard mode. */
function readRings(kit) {
  const { toRgba, behindFrom, pathOf, squash, role, inactive, excluded, shown, clipped, reach, free, inDocument } = kit
  const CONTROLS = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex], [role=radio], [role=tab], [role=menuitem]'
  const ROVING = '[role=radio], [role=tab], [role=menuitem]'

  /** The outline of an element, else of the closest ancestor that draws one (`focus-within:focus-ring`), at most three levels up. */
  function ringOf(el) {
    const outline = (e) => {
      const style = getComputedStyle(e)
      const width = parseFloat(style.outlineWidth)
      if (style.outlineStyle === 'none' || !(width > 0)) return null
      return { ring: toRgba(style.outlineColor), width, style: style.outlineStyle }
    }
    let carrier = el
    let drawn = outline(el)
    let on = 'self'
    if (!drawn) {
      on = 'none'
      let up = el.parentElement
      for (let i = 0; i < 3 && up; i++, up = up.parentElement) {
        const found = outline(up)
        if (found) {
          drawn = found
          carrier = up
          on = 'ancestor'
          break
        }
      }
    }
    return {
      key: pathOf(el),
      role: role(el),
      text: squash(el.textContent || el.getAttribute('aria-label') || el.value || ''),
      behind: behindFrom(carrier.parentElement ?? carrier).behind,
      ring: drawn?.ring ?? null,
      width: drawn?.width ?? 0,
      style: drawn?.style ?? 'none',
      on,
      visible: el.matches(':focus-visible'),
    }
  }

  const rings = []
  const unseen = []
  for (const el of document.querySelectorAll(CONTROLS)) {
    // `[tabindex]` alone is a control from 0 up; -1 is a screen reader target (a heading), not a control.
    if (!el.matches(`${ROVING}, a[href], button, input, select, textarea, summary`) && el.tabIndex < 0) continue
    if (excluded(el) || inactive(el) || !shown(el) || clipped(el)) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0 || !inDocument(rect)) continue
    el.focus()
    // A control with `transition-colors` animates `outline-color` from its text colour to --cp-focus for 80 to 150 ms; read at once, the
    // ring would be the text colour (#17121d on the selected option of a segmented control, #430). What a User sees at rest counts.
    for (const animation of document.getAnimations()) if (animation instanceof CSSTransition) animation.finish()
    const stack = reach(el, () => el.getBoundingClientRect())
    if (!stack) {
      unseen.push(`${pathOf(el)} (ring)`)
      continue
    }
    if (!free(el, stack)) continue
    rings.push(ringOf(el))
  }
  document.activeElement?.blur()
  window.scrollTo(0, 0)
  return { rings, unseen }
}

/** The page function behind `keysOf`: the DOM path of every element matching `selector`. */
function readKeys(kit, selector) {
  return [...document.querySelectorAll(selector)].map(el => kit.pathOf(el))
}

const sources = fn => `(${fn})((${makeKit})(${JSON.stringify(EXCLUDED.map(entry => entry.selector).join(', '))}))`

/** Evaluated in the page: the keys (DOM paths) of the elements matching `selector`, as the readings' items carry them (#408, `State.differs`). */
export const keysOf = selector => `(${readKeys})((${makeKit})(''), ${JSON.stringify(selector)})`
/** Evaluated in the page: the `Reading` (theme, scheme, texts, boxes, surfaces, excluded, unseen). */
export const READ = sources(readPage)
/** Evaluated in the page after a Tab press: `{ rings, unseen }`. */
export const READ_RINGS = sources(readRings)
