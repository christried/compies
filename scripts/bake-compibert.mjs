// Bakes the two static Compibert poses the Share image renders (#311, spec #308 § Compibert's rig): the full body "dance" and the head
// "idle", as self-contained SVG without CSS vars, filters, classes or ids (Satori and `<img>` safe). #313 reads them on the server with
// `useStorage('assets:server').getItem('compibert/compibert-dance.svg')`.
//
//   node scripts/bake-compibert.mjs            writes server/assets/compibert/compibert-dance.svg and compibert-head-idle.svg
//   node scripts/bake-compibert.mjs --check    bakes in memory, exits 1 if a committed file differs (run it after changing the rig)
//   node scripts/bake-compibert.mjs --pose-t=0.7   dance frame at another time, written next to the outputs' folder given by --out=DIR
//
// No browser: Node runs the rig engine (`app/utils/compibert-rig.ts`, erasable TS only) against happy-dom and steps GSAP by hand, as
// docs/design_handoff_compies/reference/docs/compibert-handoff.md § Static assets describes. Seeded random, so the bytes are stable.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { Window } from 'happy-dom'

const ROOT = resolve(import.meta.dirname, '..')
const OUT = resolve(ROOT, 'server/assets/compibert')
const args = process.argv.slice(2)
const flag = name => args.find(arg => arg.startsWith(`--${name}=`))?.slice(name.length + 3)

// Seconds after `setState` at which each frame is taken. Dance: the loop starts at 0.3 s, so 0.7 s is 0.4 s into the first beat, when the arms
// have settled (left up at about -150, right low at about -40), torso and head lean opposite ways, the right leg is lifted and the root is
// near the top of its hop; 0.55 s still has the arms on their way and 1.05 s is the second beat's peak (compared by eye, #311). Head idle:
// the 0.25 s rest tween is over, lids open, smile.
const POSE_T = { 'dance': Number(flag('pose-t') ?? 0.7), 'head-idle': 0.5 }
const STEP = 1 / 120

// mulberry32, so the breath durations and the like are the same on every run.
function seeded(seed) {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const window = new Window({ url: 'http://localhost/', width: 800, height: 600 })
for (const key of ['window', 'document', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement', 'SVGElement', 'Element', 'Node']) {
  globalThis[key] = key === 'window' ? window : window[key]
}
Math.random = seeded(311)

// GSAP checks for `window` while loading, hence the dynamic imports after the globals.
const { gsap } = await import('gsap')
const { mountRig, rigMarkup } = await import('../app/utils/compibert-rig.ts')
gsap.config({ nullTargetWarn: false })
gsap.defaults({ overwrite: 'auto' })
gsap.ticker.remove(gsap.updateRoot)

const read = file => readFileSync(resolve(ROOT, 'app/assets/compibert', file), 'utf8')

/** Mounts the rig on a fresh host, runs it to `seconds` after setState, and returns the `<svg>`. */
function pose(variant, state, seconds) {
  const host = document.createElement('div')
  document.body.append(host)
  host.innerHTML = rigMarkup(read(`compibert-${variant}.svg`), variant, 'cbbake_')
  const start = gsap.globalTimeline.time()
  const rig = mountRig(gsap, host, { variant, reduced: false })
  rig.stopAmbient()
  rig.setState(state, false)
  for (let t = STEP; t <= seconds + 1e-9; t += STEP) gsap.updateRoot(start + t)
  rig.destroy()
  return host.querySelector('svg')
}

const round = text => text.replace(/-?\d+\.\d{4,}/g, number => String(Math.round(Number(number) * 1000) / 1000))

/** `var(--cb-x, #hex)` to `#hex`; Satori and `<img>` have no CSS vars. */
const unvar = text => text.replace(/var\(--[\w-]+,\s*([^)]+)\)/g, '$1')

/** The CSS declarations of a style attribute, parsed in a way that does not trip over the commas in `rgb(…)`. */
function declarations(style) {
  return (style ?? '').split(';').map(part => part.trim()).filter(Boolean).map((part) => {
    const colon = part.indexOf(':')
    return [part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim()]
  })
}

const isHidden = (element) => {
  const decl = Object.fromEntries(declarations(element.getAttribute('style')))
  return Number(element.getAttribute('opacity') ?? decl.opacity ?? 1) === 0 || decl.display === 'none' || decl.visibility === 'hidden'
}

const IDENTITY = /^matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)$/

/** The live SVG as plain static markup. */
function serialise(svg, viewBox) {
  const ids = new Map()
  // Clip paths are collected while walking and emitted into one <defs> at the end, so only the ones a visible element still uses stay.
  const clips = new Map()
  const idOf = (original) => {
    if (!ids.has(original)) ids.set(original, `c${ids.size}`)
    return ids.get(original)
  }

  function write(element, inClip) {
    const tag = element.tagName.toLowerCase()
    if (tag === 'filter' || tag === 'title' || tag === 'desc' || tag === 'defs') return ''
    if (!inClip && isHidden(element)) return ''
    const attrs = []
    for (const { name, value } of element.attributes) {
      const lower = name.toLowerCase()
      if (['id', 'class', 'style', 'filter', 'preserveaspectratio', 'xmlns'].includes(lower) || lower.startsWith('data-')) continue
      if (lower === 'width' && tag === 'svg') continue
      if (lower === 'height' && tag === 'svg') continue
      if (lower === 'transform' && IDENTITY.test(value.trim())) continue
      if (lower === 'clip-path') {
        const original = /url\(#([^)]+)\)/.exec(value)?.[1]
        attrs.push(`clip-path="url(#${idOf(original)})"`)
        continue
      }
      attrs.push(`${name}="${round(unvar(value))}"`)
    }
    const style = declarations(element.getAttribute('style'))
      .filter(([name, value]) => !['transform', 'transform-origin', 'filter', 'will-change', 'translate', 'rotate', 'scale'].includes(name) && !(name === 'opacity' && Number(value) === 1))
      .map(([name, value]) => `${name}:${round(unvar(value))}`)
    if (style.length > 0) attrs.push(`style="${style.join(';')}"`)
    const children = [...element.children].map(child => write(child, inClip || tag === 'clippath')).join('')
    // A group that ended up empty (every child hidden) draws nothing.
    if (tag === 'g' && children === '') return ''
    // A group with no attribute of its own (its transform was the identity) is only a wrapper.
    if (tag === 'g' && attrs.length === 0) return children
    const markup = `<${element.tagName}${attrs.length > 0 ? ' ' : ''}${attrs.join(' ')}>${children}</${element.tagName}>`
    if (tag === 'clippath') {
      clips.set(element.getAttribute('id'), markup)
      return ''
    }
    return markup
  }

  const body = [...svg.children].map(child => write(child, false)).join('')
  const defs = [...clips].filter(([original]) => ids.has(original)).map(([original, markup]) => markup.replace('<clipPath', `<clipPath id="${ids.get(original)}"`)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${defs ? `<defs>${defs}</defs>` : ''}${body}</svg>
`
}

const outputs = {
  'compibert-dance.svg': serialise(pose('full', 'dance', POSE_T.dance), '0 36 404 344'),
  'compibert-head-idle.svg': serialise(pose('head', 'idle', POSE_T['head-idle']), '212 40 192 192'),
}
await window.happyDOM.close()

if (args.includes('--check')) {
  const stale = Object.entries(outputs).filter(([file, text]) => {
    try {
      return readFileSync(resolve(OUT, file), 'utf8') !== text
    }
    catch {
      return true
    }
  }).map(([file]) => file)
  if (stale.length > 0) {
    console.error(`Out of date: ${stale.join(', ')}. Run node scripts/bake-compibert.mjs and commit the result.`)
    process.exit(1)
  }
  console.log('Both baked Compibert SVGs match the rig.')
}
else {
  const dir = flag('out') ? resolve(flag('out')) : OUT
  mkdirSync(dir, { recursive: true })
  for (const [file, text] of Object.entries(outputs)) {
    writeFileSync(resolve(dir, file), text)
    console.log(`${file}: ${Buffer.byteLength(text)} bytes`)
  }
}
process.exit(0)
