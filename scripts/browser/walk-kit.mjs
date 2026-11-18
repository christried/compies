// The helpers of the wording walk's own state files (`walk-states-forms.mjs`, `walk-states-event.mjs`, #630, spec #620). `states.mjs` loads only files that
// start with `walk-states-` or `dark-states-`, so this file is never loaded as a state file. A helper that a page expression needs comes as a function of the
// tab and returns a promise; one that is a page expression itself is a function that returns its source (`fieldByLabel`).
// Labels and texts always come from the caller's `COPY` (`de.json`), never a typed German literal.
import { sleep } from './chrome.mjs'

// On a dev server started with `--wording` every translated text and attribute carries invisible key-tag characters (shared/key-tag.ts, #627), so a page
// expression that compares a text with `===` strips them first. The backslashes are written doubled: the string holds `\u2060` as text, which the page's regex reads.
export const UNTAG = '/[\\u2060\\u2062\\u2063]/g'

/** The page expression for the input a `<label>` with this text points at: the label's text after `UNTAG`, then `document.getElementById(label.htmlFor)` (Vue's ids hold characters a selector does not take). */
export const fieldByLabel = text => `(() => { const label = [...document.querySelectorAll('label')].find(l => l.textContent.replace(${UNTAG}, '').trim() === ${JSON.stringify(text)}); return label ? document.getElementById(label.htmlFor) : null })()`

/**
 * Sets the value of the element `expression` evaluates to as a User's typing would: the native value setter of the element's own prototype, then an `input`
 * event, so `v-model` sees it, also on a prefilled field (the kit's `typeInto` only inserts). `''` empties it. Throws when there is no such element.
 */
export async function setField(tab, expression, value) {
  const set = await tab.evaluate(`(() => {
    const el = ${expression}
    if (!el) return false
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, ${JSON.stringify(value)})
    el.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  if (!set) throw new Error(`no field for ${expression.slice(0, 80)}`)
}

/** `{ date: 'DDMMYYYY', time: 'HHMM' }` of a kit date (`YYYY-MM-DDTHH:mm`, Berlin, ADR 0003) given as `date` alone; two digit strings given as they are. */
function digitsOf(date, time) {
  if (time !== undefined) return { date, time }
  const [day = '', clock = ''] = date.split('T')
  const [year, month, dayOfMonth] = day.split('-')
  return { date: `${dayOfMonth}${month}${year}`, time: clock.replace(':', '') }
}

/**
 * Types a date and a time into the `nth` `DateTimeField` (ADR 0010: two text inputs `input[id$="-date"]` and `input[id$="-time"]` that keep only digits) among the
 * elements that match `scopeSelector` and hold such a field. `setField` writes both, so a filled field is overwritten. `date` is `DDMMYYYY` with `time` `HHMM`, or
 * a kit date (`inDays(n)`, `YYYY-MM-DDTHH:mm`) alone.
 */
export async function typeDateTime(tab, scopeSelector, date, time, { nth = 0 } = {}) {
  const digits = digitsOf(date, time)
  const scope = `[...document.querySelectorAll(${JSON.stringify(scopeSelector)})].filter(el => el.querySelector('input[id$="-date"]'))[${nth}]`
  await setField(tab, `(${scope})?.querySelector('input[id$="-date"]')`, digits.date)
  await setField(tab, `(${scope})?.querySelector('input[id$="-time"]')`, digits.time)
}

/** The page expression for the visible `NumberStepper` button whose `aria-label` (after `UNTAG`) holds the stepper's `label` and the word `'mehr'` / `'weniger'`: each fixed part on its own, as the placeholder in it may be tagged apart. */
const stepperButton = (label, word) => `[...document.querySelectorAll('button[aria-label]')].find(b => { const a = b.getAttribute('aria-label').replace(${UNTAG}, ''); return a.includes(${JSON.stringify(label)}) && a.includes(${JSON.stringify(word)}) && b.getBoundingClientRect().width > 0 })`

/** Clicks that `NumberStepper` button `times` times, 60 ms apart (it stops short at its limit: the button then does nothing). Throws when there is no such button. */
export async function stepBy(tab, label, word, times) {
  for (let i = 0; i < times; i++) {
    if (!await tab.evaluate(`(() => { const el = ${stepperButton(label, word)}; if (!el) return false; el.scrollIntoView({ block: 'center', behavior: 'instant' }); el.click(); return true })()`)) throw new Error(`no stepper button „${label}: ${word}“`)
    await sleep(60)
  }
}

/**
 * Clicks the `NumberStepper` button whose `aria-label` holds `label` and the word (`'mehr'` or `'weniger'`) until it is `aria-disabled="true"`, at most 40 clicks, 40 ms apart.
 * A button at its limit does nothing and carries its reason as `title` and as an `sr-only` span (`NumberStepper.vue`): the walk reads both. Throws when there is no such button.
 */
export async function toLimit(tab, label, word) {
  const button = stepperButton(label, word)
  for (let i = 0; i < 40; i++) {
    const state = await tab.evaluate(`(() => { const el = ${button}; if (!el) return 'none'; if (el.getAttribute('aria-disabled') === 'true') { el.scrollIntoView({ block: 'center', behavior: 'instant' }); return 'limit' } el.click(); return 'clicked' })()`)
    if (state === 'none') throw new Error(`no stepper button „${label}: ${word}“`)
    if (state === 'limit') return
    await sleep(40)
  }
  throw new Error(`the stepper „${label}: ${word}“ never reached its limit in 40 clicks`)
}

/** Presses the mouse at the centre of the first visible element matching `selector` that holds `text`, waits `ms`, lets go (`HoldToConfirmButton` starts a 1 s timer on `pointerdown`). Throws when there is none. */
export async function holdPress(tab, selector, text, ms = 1300) {
  const at = await tab.evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find(e => e.getBoundingClientRect().width > 0 && (e.textContent.replace(${UNTAG}, '').includes(${JSON.stringify(text)}) || (e.getAttribute('aria-label') || '').replace(${UNTAG}, '').includes(${JSON.stringify(text)})))
    if (!el) return null
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  })()`)
  if (!at) throw new Error(`no ${selector} „${text}“ to hold`)
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...at })
  await tab.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...at, button: 'left', buttons: 1, clickCount: 1 })
  await sleep(ms)
  await tab.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...at, button: 'left', buttons: 0, clickCount: 1 })
}

/** The source of `keepToasts` (`dark-states-event.mjs`), for a script that runs on every page load: a success toast leaves after 4 s, shorter than a reading, so a delay of exactly 4000 ms is never scheduled. */
const KEEP_TOASTS = `(() => {
  if (window.__toastsKept) return
  window.__toastsKept = true
  const real = window.setTimeout
  window.setTimeout = (fn, ms, ...rest) => (ms === 4000 ? 0 : real(fn, ms, ...rest))
})()`

/** Keeps the success and info toasts of every page the tab loads from now on (a toast that appears on a page load, `invite.joinedToast`). Returns the script's identifier for `releaseToasts`. Call it before the load. */
export async function keepToastsFromLoad(tab) {
  const { result } = await tab.send('Page.addScriptToEvaluateOnNewDocument', { source: KEEP_TOASTS })
  return result.identifier
}

/**
 * Runs `source` on every page the tab loads from now on, before the page's own scripts: a fetch that must be faked before a page load (#810). Returns the script's
 * identifier; `releaseToasts` takes any such script away again, whatever it was.
 */
export async function scriptFromLoad(tab, source) {
  const { result } = await tab.send('Page.addScriptToEvaluateOnNewDocument', { source })
  return result.identifier
}

/** Takes the script of `keepToastsFromLoad` (or of `scriptFromLoad`) away again, so later loads of the tab are as they were. */
export async function releaseToasts(tab, identifier) {
  await tab.send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
}

/**
 * Makes every request whose URL matches one of `patterns` (Chrome's wildcard syntax: `*` is any run of characters) fail, from now on and in every page the tab loads, until
 * `unblockUrls`: what a script from the load cannot do, a dynamic import that fails (#826). Call it before the page opens.
 */
export async function blockUrls(tab, patterns) {
  await tab.send('Network.enable', {})
  await tab.send('Network.setBlockedURLs', { urls: patterns })
}

/** Takes the block of `blockUrls` away again, so later loads of the tab are as they were. Safe to call when nothing was blocked. */
export async function unblockUrls(tab) {
  await tab.send('Network.setBlockedURLs', { urls: [] })
}

/**
 * Puts the caret into the notes editor of `scope` (#810: the Tiptap editor of `RichNotesEditor.vue`, a contenteditable `div[role=textbox][data-notes-editor]` from a lazy,
 * client-only chunk). Waits until it exists and is not `aria-disabled`, at most 10 s, scrolls it into view, focuses it and puts the caret at its end, or with `select`
 * selects the whole content, so the next input replaces it. Throws `no notes editor` on a timeout.
 */
export async function focusNotes(tab, { scope = 'body', select = false } = {}) {
  const selector = `${scope} [data-notes-editor]`
  const ready = `(() => { const el = document.querySelector(${JSON.stringify(selector)}); return !!el && el.getAttribute('aria-disabled') !== 'true' })()`
  for (const end = Date.now() + 10_000; !await tab.evaluate(ready).catch(() => false); await sleep(200)) {
    if (Date.now() > end) throw new Error('no notes editor')
  }
  await tab.evaluate(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)})
    el.scrollIntoView({ block: 'center', behavior: 'instant' })
    el.focus()
    const range = document.createRange()
    range.selectNodeContents(el)
    if (!${select}) range.collapse(false)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  })()`)
  // ProseMirror reads the DOM selection on `selectionchange`, which comes after this call.
  await sleep(150)
}

/**
 * Types `text` into the notes editor of `scope` as the keyboard would (`Input.insertText`, as the kit's `typeInto` does for an input; `text` may be 2001 characters).
 * `replace` (the default) selects the editor's whole content first, so the text takes its place; without it the text goes at the caret's end. Throws `no notes editor` on a timeout.
 */
export async function typeNotes(tab, text, { scope = 'body', replace = true } = {}) {
  await focusNotes(tab, { scope, select: replace })
  await tab.send('Input.insertText', { text })
  await sleep(300)
}

/** Deletes what is selected in the focused editor as Backspace does (`focusNotes` with `select` first). The kit's `pressKey` has no code for it, so the event carries its own. */
export async function backspace(tab) {
  const key = { key: 'Backspace', code: 'Backspace', windowsVirtualKeyCode: 8, nativeVirtualKeyCode: 8 }
  await tab.send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key, commands: ['deleteBackward'] })
  await tab.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key })
  await sleep(300)
}
