// The helpers of the wording walk's own state files (`walk-states-forms.mjs`, `walk-states-event.mjs`, #630, spec #620). `states.mjs` loads only files that
// start with `walk-states-` or `dark-states-`, so this file is never loaded as a state file. A helper that a page expression needs comes as a function of the
// tab and returns a promise; one that is a page expression itself is a function that returns its source (`fieldByLabel`).
// Labels and texts always come from the caller's `COPY` (`de.json`), never a typed German literal.
import { sleep } from './chrome.mjs'

// On a dev server started with `--wording` every translated text and attribute carries invisible key-tag characters (shared/key-tag.ts, #627), so a page
// expression that compares a text with `===` strips them first. The backslashes are written doubled: the string holds `⁠` as text, which the page's regex reads.
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

/** Takes the script of `keepToastsFromLoad` away again, so later loads of the tab are as they were. */
export async function releaseToasts(tab, identifier) {
  await tab.send('Page.removeScriptToEvaluateOnNewDocument', { identifier })
}
