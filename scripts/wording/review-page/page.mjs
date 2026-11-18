// compies-wording-review: the operator's review page (#631, spec #620 § The review page). Plain DOM, no dependency, no external request.
// The page reads the model, it does not reshape it: the steps come from the server (stepsOf), and the filters, the progress, the sighting
// shown and the check of a typed replacement are the tested modules of scripts/wording/, imported from /modules/.
// Letters start a replacement, so every other action is a non-letter key or Alt+key (event.code). Every save is an awaited POST.
import { checkReplacement } from '/modules/check-replacement.mjs'
import { isReworded, isStepId, stepId, stepName } from '/modules/answers.mjs'
import { filterSteps, isAnswered, progressOf, sightingToShow, textEntry } from '/modules/review-model.mjs'
import { tabKeyAction } from '/modules/review-keys.mjs'

document.documentElement.dataset.page = 'compies-wording-review'

const FILTERS = [
  ['mono', 'Mono'],
  ['sr-only', 'nur Screenreader'],
  ['new', 'neu seit dem letzten Durchgang'],
  ['open', 'offen'],
  ['alternatives', 'Alternativen'],
]
const SECTIONS = [
  ['walk', 'Mit Bild'],
  ['unpictured', 'Ohne Bild'],
  ['legal', 'Rechtstexte'],
  ['unused', 'Ungenutzt'],
]
const MARK_LABELS = { 'mono': 'Mono', 'sr-only': 'nur Screenreader' }
const CROP_MARGIN = 24
const CROP_MAX_SCALE = 3
const CROP_MAX_WIDTH = 640

/**
 * @param {string} tag
 * @param {Record<string, any>} [props] `text`, `on<Event>`, `dataset`, else attributes or properties
 * @param {...(Node | string | null)} children
 */
function h(tag, props = {}, ...children) {
  const element = document.createElement(tag)
  for (const [name, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue
    if (name === 'text') element.textContent = value
    else if (name.startsWith('on')) element.addEventListener(name.slice(2), value)
    else if (name === 'dataset') Object.assign(element.dataset, value)
    else if (name in element) /** @type {any} */ (element)[name] = value
    else element.setAttribute(name, value === true ? '' : value)
  }
  for (const child of children) if (child !== null) element.append(child)
  return element
}

/** @param {string} id */
const $ = id => /** @type {HTMLElement} */ (document.getElementById(id))

/** @typedef {import('/modules/review-model.mjs').Step} Step */

const state = {
  /** @type {any} */ data: null,
  /** @type {Step[]} */ steps: [],
  /** @type {any} */ answers: null,
  /** @type {any} */ baseline: null,
  /** @type {Set<string>} */ filters: new Set(),
  /** @type {Step[]} */ list: [],
  currentId: /** @type {string | null} */ (null),
  index: -1,
  /** @type {number | null} */ sightingIdx: null,
  /** @type {Set<string>} */ skipped: new Set(),
  mode: /** @type {'replace' | null} */ (null),
  draftOk: false,
  rulesOpen: false,
  shownId: /** @type {string | null} */ (null),
}

// ---- the parts of the step, built once and updated by render() ----
const ui = {
  /** @type {Record<string, HTMLElement>} */ filterButtons: {},
  /** @type {Record<string, HTMLElement>} */ sectionButtons: {},
}

/** The skip key of a step: its top-level group; an unused group is only itself. @param {Step} step */
const skipKey = step => (step.kind === 'unused' ? stepId('unused', step.group) : step.group)
const current = () => state.list[state.index] ?? null

function notice(/** @type {string} */ text, ok = false) {
  const element = $('notice')
  element.textContent = text
  element.className = ok ? 'ok' : ''
}

// ---- state ----
function passes(/** @type {Step} */ step) {
  return filterSteps([step], [...state.filters], { answers: state.answers, baseline: state.baseline }).length === 1
}

/** The list for the filters and answers as they are; keeps the current step when it passes, else the next one that does (then the one before). */
function relist() {
  state.list = filterSteps(state.steps, [...state.filters], { answers: state.answers, baseline: state.baseline })
  let index = state.list.findIndex(step => step.id === state.currentId)
  if (index === -1) {
    const at = state.steps.findIndex(step => step.id === state.currentId)
    const after = at === -1 ? undefined : state.steps.slice(at + 1).find(passes)
    const before = at === -1 ? undefined : state.steps.slice(0, at).reverse().find(passes)
    const target = after ?? before ?? state.list[0]
    state.currentId = target?.id ?? null
    index = target ? state.list.indexOf(target) : -1
  }
  state.index = index
}

/** The index of the next (+1) or previous (-1) step in the list that no skipped group holds, or -1. */
function neighbour(/** @type {1 | -1} */ direction, from = state.index) {
  for (let i = from + direction; i >= 0 && i < state.list.length; i += direction) {
    const step = state.list[i]
    if (step && !state.skipped.has(skipKey(step))) return i
  }
  return -1
}

function goTo(/** @type {string | null | undefined} */ id) {
  if (!id) return
  state.currentId = id
  state.sightingIdx = null
  state.mode = null
  relist()
  render()
}

// ---- saving ----
/** @param {Record<string, unknown>} body @returns {Promise<{ ok: boolean, status: number, json: any }>} */
async function post(body) {
  try {
    const response = await fetch('/api/answer', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
    return { ok: response.ok, status: response.status, json: await response.json().catch(() => ({})) }
  }
  catch (error) {
    return { ok: false, status: 0, json: { error: String(error) } }
  }
}

/** Every key is one action at a time, in order: a second Enter acts on the step the first one moved to. */
let chain = Promise.resolve()
function enqueue(/** @type {() => Promise<unknown>} */ action) {
  chain = chain.then(action).catch(error => notice(`Fehler: ${error}`))
}

/**
 * Saves, and on success moves to the next step (the one after the current, found before the answer changes the list).
 * A failure shows and does not move.
 * @param {Record<string, unknown>} body
 * @param {boolean} [moveOn]
 */
async function save(body, moveOn = true) {
  const target = state.list[neighbour(1)]?.id ?? null
  const result = await post(body)
  if (!result.ok) {
    if (result.status === 422) showIssues(result.json.refusals ?? [], result.json.warnings ?? [])
    notice(result.status === 404
      ? 'Die Aufnahme hat sich geändert, bitte neu laden'
      : result.status === 409
        ? 'Speichern ist aus, bis die Antwortdatei in Ordnung ist (siehe Hinweise), dann die Seite neu laden'
        : result.status === 422 ? 'Der Text wurde nicht gespeichert' : `Speichern fehlgeschlagen (${result.json.error ?? result.status})`)
    return false
  }
  state.answers = result.json.answers
  notice('')
  state.mode = null
  if (moveOn && target) state.currentId = target
  state.sightingIdx = null
  relist()
  render()
  return true
}

const stepEntry = (/** @type {Step} */ step) => textEntry(step, state.answers)

function storedComment(/** @type {Step} */ step) {
  if (step.kind === 'mono') return state.answers.mono[stepName(step.id, 'mono')]?.comment ?? ''
  return stepEntry(step)?.comment ?? ''
}

// ---- actions ----
function answerPasst() {
  const step = current()
  if (!step || (step.kind !== 'message' && step.kind !== 'fixed')) return
  enqueue(() => save({ id: step.id, answer: 'passt' }))
}

function answerAlternatives() {
  const step = current()
  if (!step || (step.kind !== 'message' && step.kind !== 'fixed')) return
  enqueue(() => save({ id: step.id, answer: 'alternativen' }))
}

function answerUnused(/** @type {'loeschen' | 'behalten'} */ answer) {
  const step = current()
  if (step?.kind !== 'unused') return
  enqueue(() => save({ id: step.id, answer }))
}

/** Enter outside a field: an unanswered step is „passt“ (a mono step „gesehen“), an answered one only moves on. */
function enter() {
  const step = current()
  if (!step) return
  if (step.kind === 'unused') return
  if (isAnswered(step, state.answers)) {
    next()
    return
  }
  if (step.kind === 'mono') enqueue(() => save({ id: step.id, comment: storedComment(step) }))
  else answerPasst()
}

function next() {
  const to = neighbour(1)
  if (to === -1) return notice('Das ist der letzte Schritt')
  notice('')
  state.currentId = state.list[to]?.id ?? null
  state.sightingIdx = null
  state.mode = null
  relist()
  render()
}

function previous() {
  const to = neighbour(-1)
  if (to === -1) return notice('Das ist der erste Schritt')
  notice('')
  state.currentId = state.list[to]?.id ?? null
  state.sightingIdx = null
  state.mode = null
  relist()
  render()
}

function sightingIndexOf(/** @type {Step} */ step) {
  const shown = currentSighting(step)
  return shown ? step.sightings.indexOf(shown) : -1
}

function flip(/** @type {1 | -1} */ direction) {
  const step = current()
  if (!step || step.sightings.length < 2) return
  const to = sightingIndexOf(step) + direction
  if (to < 0 || to >= step.sightings.length) return
  state.sightingIdx = to
  renderPicture(step)
  renderSightings(step)
}

function currentSighting(/** @type {Step} */ step) {
  if (state.sightingIdx !== null && step.sightings[state.sightingIdx]) return step.sightings[state.sightingIdx]
  return sightingToShow(step, /** @type {any} */ ([...state.filters]))
}

function skipGroup() {
  const step = current()
  if (!step) return
  state.skipped.add(skipKey(step))
  const to = neighbour(1) !== -1 ? neighbour(1) : neighbour(-1)
  if (to === -1) {
    renderBar()
    return notice('Alle anderen Schritte liegen in übersprungenen Gruppen')
  }
  notice('')
  state.currentId = state.list[to]?.id ?? null
  state.sightingIdx = null
  state.mode = null
  relist()
  render()
}

function toggleRules(open = !state.rulesOpen) {
  state.rulesOpen = open
  $('rules').hidden = !open
}

// ---- the replacement and the comment ----
const replacement = /** @type {HTMLTextAreaElement} */ (h('textarea', { id: 'replacement', rows: 3, spellcheck: false, ariaLabel: 'Ersatztext' }))
const comment = /** @type {HTMLTextAreaElement} */ (h('textarea', { id: 'comment', rows: 2, ariaLabel: 'Kommentar' }))
const issues = h('div', { id: 'issues' })
const saveReplacementButton = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', id: 'save-replacement', text: 'Ersetzen speichern (Enter)', onclick: () => saveReplacement() }))

function showIssues(/** @type {{ reason: string }[]} */ refusals, /** @type {{ reason: string }[]} */ warnings) {
  issues.replaceChildren(
    ...refusals.map(({ reason }) => h('div', { class: 'refusal', text: `Abgelehnt: ${reason}` })),
    ...warnings.map(({ reason }) => h('div', { class: 'warning', text: `Warnung: ${reason}` })),
  )
}

/** Checks the draft with the tested module; a refusal blocks saving, a warning does not. */
function checkDraft() {
  const step = current()
  const value = replacement.value
  if (!step || step.text === null || value.trim() === '') {
    state.draftOk = false
    showIssues([], [])
  }
  else {
    const result = checkReplacement(step.text, value)
    state.draftOk = result.ok
    showIssues(result.refusals, result.warnings)
  }
  saveReplacementButton.disabled = !state.draftOk
}

function openReplacement(/** @type {string} */ value) {
  const step = current()
  if (!step || (step.kind !== 'message' && step.kind !== 'fixed')) return
  state.mode = 'replace'
  $('replace-box').hidden = false
  replacement.value = value
  replacement.focus()
  replacement.setSelectionRange(value.length, value.length)
  checkDraft()
}

function closeReplacement() {
  state.mode = null
  replacement.value = ''
  $('replace-box').hidden = true
  showIssues([], [])
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

function saveReplacement() {
  const step = current()
  if (!step || !state.draftOk) return
  /** @type {Record<string, unknown>} */
  const body = { id: step.id, answer: 'ersetzt', replacement: replacement.value }
  if (comment.value !== storedComment(step)) body.comment = comment.value
  enqueue(() => save(body))
}

function saveComment() {
  const step = current()
  if (!step) return
  const value = comment.value
  if (step.kind === 'mono') return enqueue(() => save({ id: step.id, comment: value }))
  if (step.kind === 'unused') return
  const back = state.mode === 'replace' ? replacement : null
  if (value === storedComment(step)) {
    ;(back ?? /** @type {HTMLElement} */ (document.activeElement))?.focus?.()
    if (!back && document.activeElement instanceof HTMLElement) document.activeElement.blur()
    return
  }
  enqueue(async () => {
    const ok = await save({ id: step.id, comment: value }, false)
    if (!ok) return
    if (back) back.focus()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  })
}

function dropComment() {
  const step = current()
  comment.value = step ? storedComment(step) : ''
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}

replacement.addEventListener('input', checkDraft)
replacement.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeReplacement()
  }
  else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    if (state.draftOk) saveReplacement()
  }
})
comment.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    dropComment()
  }
  else if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    saveComment()
  }
})

// ---- keys ----
document.addEventListener('keydown', (event) => {
  const target = event.target
  const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
  if (event.ctrlKey || event.metaKey) return
  if (event.altKey) {
    if (inField && event.code !== 'KeyC' && event.code !== 'KeyR') return
    const handled = {
      KeyA: answerAlternatives,
      KeyC: () => comment.focus(),
      KeyG: skipGroup,
      KeyL: () => answerUnused('loeschen'),
      KeyB: () => answerUnused('behalten'),
      KeyR: () => toggleRules(),
    }[/** @type {'KeyA'} */ (event.code)]
    if (!handled) return
    event.preventDefault()
    handled()
    return
  }
  if (inField || !state.data) return
  // A focused button keeps its own Enter.
  if (event.key === 'Enter' && target instanceof HTMLElement && target.closest('button, summary')) return
  switch (event.key) {
    case 'Enter':
      event.preventDefault()
      if (!event.repeat) enter()
      return
    case 'F2': {
      event.preventDefault()
      const step = current()
      openReplacement(stepEntry(step ?? /** @type {any} */ ({}))?.replacement ?? step?.text ?? '')
      return
    }
    case 'ArrowLeft':
      event.preventDefault()
      return previous()
    case 'ArrowRight':
      event.preventDefault()
      return next()
    case 'ArrowUp':
      event.preventDefault()
      return flip(-1)
    case 'ArrowDown':
      event.preventDefault()
      return flip(1)
    case 'Tab': {
      const step = current()
      if (tabKeyAction(event, { inField: false, commentShown: step !== null && step.kind !== 'unused' }) === null) return
      event.preventDefault()
      comment.focus()
      comment.setSelectionRange(comment.value.length, comment.value.length)
      return
    }
  }
  // A printable character starts the replacement (a mono step: the comment). No preventDefault: the character lands in the field it opens.
  if (event.key.length === 1 && event.key !== ' ') {
    const step = current()
    if (!step) return
    if (step.kind === 'mono') {
      comment.focus()
      comment.setSelectionRange(comment.value.length, comment.value.length)
    }
    else openReplacement('')
  }
})

// A click leaves focus on the button, and the next Enter would press it again.
document.addEventListener('click', (event) => {
  const button = event.target instanceof HTMLElement ? event.target.closest('button') : null
  if (button) button.blur()
})

// ---- rendering ----
function renderBar() {
  const progress = progressOf(state.steps, state.answers)
  $('progress').textContent = progress.left === 0 ? `Alles beantwortet, erledigt ${progress.done}` : `erledigt ${progress.done}, offen ${progress.left}`
  $('position').textContent = state.list.length === 0 ? 'Schritt 0 von 0' : `Schritt ${state.index + 1} von ${state.list.length}`
  $('recording').textContent = `Aufnahme ${state.data.recording.commit}, ${state.data.recording.recordedAt}`
  $('baseline').textContent = state.data.baselineName ? `Früherer Durchgang: ${state.data.baselineName}` : 'Kein früherer Durchgang: alles ist neu'
  for (const [name, button] of Object.entries(ui.filterButtons)) button.setAttribute('aria-pressed', String(state.filters.has(name)))
  const skipped = [...state.skipped].map(key => (isStepId(key, 'unused') ? `ungenutzt ${stepName(key, 'unused')}` : key))
  const skippedBox = $('skipped')
  skippedBox.replaceChildren()
  if (skipped.length > 0) {
    skippedBox.append(`Übersprungen: ${skipped.join(', ')} `, h('button', { type: 'button', text: 'wieder einblenden', onclick: () => {
      state.skipped.clear()
      renderBar()
    } }))
  }
}

function renderSightings(/** @type {Step} */ step) {
  const count = step.sightings.length
  const line = $('sightings')
  if (count === 0) line.textContent = 'Keine Aufnahme'
  else if (count === 1) line.textContent = ''
  else line.textContent = `${count - 1} weitere Stellen, Stelle ${sightingIndexOf(step) + 1} von ${count} (Pfeil hoch und runter)`
  const sighting = currentSighting(step)
  const where = $('where')
  where.replaceChildren()
  if (sighting) {
    where.textContent = `Zustand ${sighting.state}, Konto ${sighting.account ?? 'abgemeldet'}, Breite ${sighting.width} px`
    $('rendered').textContent = sighting.rendered
    $('rendered-note').textContent = sighting.marks.includes('sr-only') ? 'wird nur vorgelesen' : ''
  }
  else {
    where.textContent = step.where ? `Datei ${step.where.file}${step.where.line === null ? '' : `:${step.where.line}`}` : 'Ort unbekannt'
    $('rendered').textContent = ''
    $('rendered-note').textContent = ''
  }
}

let pictureToken = 0
function renderPicture(/** @type {Step} */ step) {
  const box = $('pictures')
  const sighting = currentSighting(step)
  const token = ++pictureToken
  box.replaceChildren()
  if (!sighting) {
    box.append(h('div', { class: 'missing', id: 'no-picture', text: 'Keine Aufnahme' }))
    return
  }
  const crop = /** @type {HTMLCanvasElement} */ (h('canvas', { id: 'crop' }))
  const whole = /** @type {HTMLImageElement} */ (h('img', { id: 'whole', alt: 'Der ganze Bildschirm' }))
  whole.addEventListener('error', () => {
    if (token !== pictureToken) return
    box.replaceChildren(h('div', { class: 'missing', id: 'picture-missing', text: 'Bild fehlt' }))
  })
  whole.addEventListener('load', () => {
    if (token !== pictureToken) return
    drawCrop(crop, whole, sighting.box)
  })
  whole.src = `/${sighting.picture}`
  box.append(crop, whole)
}

/**
 * The box grown by the margin on each side, clamped to the picture, at most 3x and 640 px wide. The walk's frame sits 2 px off the box
 * (3 px line), so the margin keeps it in.
 * @param {HTMLCanvasElement} canvas
 * @param {HTMLImageElement} image
 * @param {{ x: number, y: number, width: number, height: number }} box
 */
function drawCrop(canvas, image, box) {
  const x0 = Math.max(0, Math.floor(box.x - CROP_MARGIN))
  const y0 = Math.max(0, Math.floor(box.y - CROP_MARGIN))
  const x1 = Math.min(image.naturalWidth, Math.ceil(box.x + box.width + CROP_MARGIN))
  const y1 = Math.min(image.naturalHeight, Math.ceil(box.y + box.height + CROP_MARGIN))
  // A box outside the picture leaves nothing to crop: show the whole picture.
  const [sx, sy, sw, sh] = x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : [0, 0, image.naturalWidth, image.naturalHeight]
  const scale = Math.min(CROP_MAX_SCALE, CROP_MAX_WIDTH / sw)
  canvas.width = Math.max(1, Math.round(sw * scale))
  canvas.height = Math.max(1, Math.round(sh * scale))
  canvas.getContext('2d')?.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
}

/** The message with its `{placeholders}` highlighted. @param {string} text */
function withPlaceholders(text) {
  return text.split(/(\{[^{}]*\})/).map(part => /^\{\s*\w+\s*\}$/.test(part) ? h('mark', { text: part }) : part)
}

function renderAnswer(/** @type {Step} */ step) {
  const answer = $('answer')
  const alternatives = $('alternatives')
  const changed = $('changed')
  alternatives.replaceChildren()
  changed.textContent = ''
  if (step.kind === 'unused') {
    const chosen = state.answers.unused[step.group]
    answer.textContent = chosen ? `Antwort: ${chosen === 'loeschen' ? 'löschen' : 'behalten'}` : 'Antwort: offen'
    return
  }
  if (step.kind === 'mono') {
    answer.textContent = isAnswered(step, state.answers) ? 'Antwort: gesehen' : 'Antwort: offen'
    return
  }
  const entry = stepEntry(step)
  const label = !entry?.answer ? 'offen' : entry.answer === 'passt' ? 'passt' : entry.answer === 'alternativen' ? 'Alternativen bitte' : 'ersetzt'
  answer.replaceChildren(`Antwort: ${label}`)
  if (entry?.answer === 'ersetzt') {
    const warnings = checkReplacement(step.text ?? '', entry.replacement).warnings
    answer.append(': ', h('strong', { text: entry.replacement }), ...warnings.map(({ reason }) => h('div', { class: 'warning', text: `Warnung: ${reason}` })))
  }
  if (entry && isReworded(entry, step.text)) {
    changed.textContent = `Der Text hat sich seit dem Durchgang geändert (war: „${entry.text}“)`
  }
  if (entry?.alternatives?.length > 0) {
    alternatives.append(h('div', { class: 'meta', text: 'Alternativen (ein Klick füllt das Ersatzfeld):' }), ...entry.alternatives.map((/** @type {string} */ alternative) => h('button', {
      type: 'button',
      text: alternative,
      onclick: () => openReplacement(alternative),
    })))
  }
}

const stepBox = $('step')
const parts = {
  empty: h('p', { id: 'empty', text: 'Keine Schritte', hidden: true }),
  body: h('div', { id: 'body' }),
}
stepBox.append(parts.empty, parts.body)
// The text and what can be done with it come first, so they are on screen with the picture below; the buttons repeat the keys.
parts.body.append(
  h('div', { class: 'meta', id: 'kind' }),
  h('div', { class: 'text', id: 'text' }),
  h('div', { class: 'meta' }, h('span', { id: 'rendered-label', text: 'Gerendert: ' }), h('span', { class: 'rendered', id: 'rendered' }), ' ', h('em', { id: 'rendered-note' })),
  h('div', { class: 'meta', id: 'where' }),
  h('div', { class: 'meta', id: 'marks' }),
  h('div', { class: 'meta', id: 'sightings' }),
  h('div', { id: 'answer' }),
  h('div', { class: 'changed', id: 'changed' }),
  h('div', { class: 'alternatives', id: 'alternatives' }),
  h('div', { id: 'replace-box', hidden: true }, h('label', { text: 'Ersatztext' }), replacement, issues, saveReplacementButton, h('button', { type: 'button', text: 'Verwerfen (Esc)', onclick: closeReplacement })),
  h('div', { id: 'unused-box', hidden: true },
    h('div', { class: 'meta', id: 'unused-count' }),
    h('ul', { class: 'unused-list', id: 'unused-list' }),
    h('div', { class: 'actions' },
      h('button', { type: 'button', id: 'btn-delete', text: 'löschen (Alt+L)', onclick: () => answerUnused('loeschen') }),
      h('button', { type: 'button', id: 'btn-keep', text: 'behalten (Alt+B)', onclick: () => answerUnused('behalten') }),
    ),
  ),
  h('div', { id: 'comment-box' },
    h('label', { text: 'Kommentar (Tab oder Alt+C, Enter speichert)' }),
    comment,
    h('button', { type: 'button', id: 'btn-comment', text: 'Kommentar speichern', onclick: saveComment }),
  ),
  h('div', { class: 'pictures', id: 'pictures' }),
  h('div', { class: 'actions', id: 'actions-text' },
    h('button', { type: 'button', id: 'btn-passt', text: 'passt (Enter)', onclick: answerPasst }),
    h('button', { type: 'button', id: 'btn-replace', text: 'Ersetzen (F2 oder tippen)', onclick: () => {
      const step = current()
      openReplacement(stepEntry(step ?? /** @type {any} */ ({}))?.replacement ?? step?.text ?? '')
    } }),
    h('button', { type: 'button', id: 'btn-alternatives', text: 'Alternativen bitte (Alt+A)', onclick: answerAlternatives }),
  ),
  h('div', { class: 'actions' },
    h('button', { type: 'button', id: 'btn-prev', text: 'Zurück (←)', onclick: previous }),
    h('button', { type: 'button', id: 'btn-next', text: 'Weiter (→)', onclick: next }),
    h('button', { type: 'button', id: 'btn-skip', text: 'Gruppe überspringen (Alt+G)', onclick: skipGroup }),
  ),
)

function render() {
  renderBar()
  const step = current()
  parts.empty.hidden = step !== null
  parts.body.hidden = step === null
  if (!step) return
  const changedStep = state.shownId !== step.id
  state.shownId = step.id

  $('kind').textContent = { message: 'Text', fixed: 'Fester Text', mono: 'Mono-Element', unused: 'Ungenutzte Texte' }[step.kind] + `, ${step.id}`
  const textBox = $('text')
  textBox.replaceChildren(...(step.text === null ? [step.what ? `${step.what} (${stepName(step.id, 'mono')})` : ''] : withPlaceholders(step.text)))
  $('marks').replaceChildren(...step.marks.map(mark => h('span', { class: 'badge', text: MARK_LABELS[mark] })))
  const isText = step.kind === 'message' || step.kind === 'fixed'
  $('rendered-label').parentElement.hidden = !isText
  $('actions-text').hidden = !isText
  $('answer').hidden = false
  $('unused-box').hidden = step.kind !== 'unused'
  $('comment-box').hidden = step.kind === 'unused'
  $('pictures').hidden = step.kind === 'unused'
  $('where').hidden = step.kind === 'unused'
  $('sightings').hidden = step.kind === 'unused'
  // The replacement field is open only while a draft is (a save or a move closes it).
  if (state.mode !== 'replace') {
    $('replace-box').hidden = true
    replacement.value = ''
    showIssues([], [])
  }
  if (changedStep || document.activeElement !== comment) comment.value = storedComment(step)
  if (step.kind === 'unused') {
    $('unused-count').textContent = `${step.keys.length} Texte, die kein Code benutzt`
    $('unused-list').replaceChildren(...step.keys.map(({ key, text }) => h('li', {}, h('code', { text: key }), ` ${text}`)))
  }
  else {
    renderSightings(step)
    if (changedStep || !document.getElementById('whole')) renderPicture(step)
  }
  renderAnswer(step)
}

// ---- start ----
function buildBar() {
  for (const [name, label] of FILTERS) {
    const button = h('button', { type: 'button', text: label, dataset: { filter: name }, onclick: () => {
      if (state.filters.has(name)) state.filters.delete(name)
      else state.filters.add(name)
      relist()
      state.shownId = null
      render()
    } })
    ui.filterButtons[name] = button
    $('filters').append(button)
  }
  for (const [section, label] of SECTIONS) {
    const button = h('button', { type: 'button', text: label, dataset: { section }, onclick: () => {
      goTo(state.list.find(step => step.section === section)?.id)
      if (!state.list.some(step => step.section === section)) notice(`Kein Schritt in „${label}“ unter diesen Filtern`)
    } })
    ui.sectionButtons[section] = button
    $('sections').append(button)
  }
  $('rules-button').addEventListener('click', () => toggleRules())
}

function renderRules() {
  const { rules, retired } = state.data
  $('rules').replaceChildren(
    h('h3', { text: 'Regeln' }),
    h('pre', { id: 'rules-tone', text: rules.tone }),
    h('h4', { text: 'Regeln für Entwickler' }),
    h('pre', { id: 'rules-developers', text: rules.developers }),
    h('h4', { text: 'Abgelöste Wörter' }),
    h('pre', { id: 'rules-retired', text: Object.entries(retired).map(([word, successor]) => `${word} → ${successor}`).join('\n') }),
  )
}

async function load() {
  const response = await fetch('/api/state')
  if (!response.ok) {
    notice(`Der Stand ließ sich nicht laden: ${(await response.json().catch(() => ({}))).error ?? response.status}`)
    return
  }
  state.data = await response.json()
  state.steps = state.data.steps
  state.answers = state.data.answers
  state.baseline = state.data.baseline
  buildBar()
  renderRules()
  const hints = [
    ...state.data.answerProblems.map((/** @type {string} */ problem) => `Antwortdatei: ${problem}`),
    ...(state.data.answerProblems.length > 0 ? ['Speichern ist aus, bis die Antwortdatei in Ordnung ist: den Eintrag in der Datei reparieren, dann die Seite neu laden'] : []),
    ...state.data.problems,
  ]
  if (hints.length > 0) {
    $('problems').hidden = false
    $('problems').querySelector('summary').textContent = `Hinweise (${hints.length})`
    $('problems').querySelector('ul').replaceChildren(...hints.map(hint => h('li', { text: hint })))
  }
  // Resume at the first open step of the whole list; with none open, the last step.
  const { firstOpen } = progressOf(state.steps, state.answers)
  const start = firstOpen === -1 ? state.steps.length - 1 : firstOpen
  state.currentId = state.steps[start]?.id ?? null
  relist()
  render()
  if (firstOpen === -1) notice('Alles beantwortet', true)
}

load().catch(error => notice(`Der Stand ließ sich nicht laden: ${error}`))
