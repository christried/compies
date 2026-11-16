// The one source of the state lists (#629, spec #620): `dark.mjs` (the Dunkel-Check) and `scripts/wording/walk.mjs` (the wording walk) both
// read the states through this module, and it is the only place that knows the files. `dark.mjs` documents the State shape. The data the
// states need on the dev database (`makeData`) and the wait that makes a reading steady (`settle`) live here for the same reason.
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { api, createEvent, createGame, eventView, ok } from './kit.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const GAME_NAME_MAX = 60

/** The viewport heights of the two widths every state is read at. */
export const HEIGHTS = { 390: 844, 1440: 900 }

/**
 * Every state of every `dark-states-*.mjs` file, sorted by file name, and the `cleanup` each file exports (the runner calls them in its
 * `finally`). `extra` is the prefix of more files the caller wants (the walk's `walk-states-`, #630); the dark check passes none, so
 * it never loads them.
 * @param {{ extra?: string }} [options]
 */
export async function loadStates({ extra } = {}) {
  const prefixes = ['dark-states-', ...(extra ? [extra] : [])]
  const states = []
  const cleanups = []
  for (const prefix of prefixes) {
    for (const file of readdirSync(HERE).filter(name => name.startsWith(prefix) && name.endsWith('.mjs')).sort()) {
      const loaded = await import(pathToFileURL(join(HERE, file)).href)
      states.push(...loaded.STATES)
      if (loaded.cleanup) cleanups.push(loaded.cleanup)
    }
  }
  return { states, cleanups }
}

/**
 * The games and the Event every state may need, as the Dev Host: reused when the dev database has them. The Event is found by `name` or made
 * (the dark check keeps its `R011 Dunkel-Check`, the walk makes `W<run>` and deletes it). `prefix` is what the Events the states make are named
 * with (`<name> `, with the space) and what the state files purge by. The games are library data, `R011 Dunkel-Check Spiel …` whatever `name` is.
 */
export async function makeData(host, { name = 'R011 Dunkel-Check' } = {}) {
  const games = (await ok(api(host, 'GET', '/api/games'), 'GET /api/games')).games
  const gameNamed = async (gameName, fields = {}) => games.find(game => game.name === gameName) ?? await createGame(host, { name: gameName, playersMin: 1, playersMax: 8, ...fields })
  const game = await gameNamed('R011 Dunkel-Check Spiel')
  const longGame = await gameNamed(`R011${'W'.repeat(GAME_NAME_MAX - 4)}`)
  const home = await ok(api(host, 'GET', '/api/e'), 'GET /api/e')
  const known = home.events.find(event => event.name === name)
  const slug = known?.slug ?? (await createEvent(host, { name, pool: [game.id, longGame.id] })).slug
  const { inviteUrl } = await eventView(host, slug)
  return { slug, invitePath: new URL(inviteUrl, 'http://x').pathname, game, longGame, prefix: `${name} ` }
}

/**
 * Waits for fonts and for every animation with a finite run to end, at most 3 s. Before that the page is scrolled through
 * once: what lands when it comes into view (the stamp on Neuigkeiten) starts then, not in the middle of the reading,
 * where it would show in one reading and not in the other.
 */
export const settle = tab => tab.evaluate(`(async () => {
  await document.fonts.ready
  for (let y = 0; y < document.documentElement.scrollHeight; y += Math.max(200, innerHeight / 2)) {
    scrollTo(0, y)
    await new Promise(resolve => setTimeout(resolve, 30))
  }
  scrollTo(0, 0)
  await new Promise(resolve => setTimeout(resolve, 700))
  const end = Date.now() + 3000
  while (Date.now() < end && document.getAnimations().some(a => a.playState === 'running' && Number.isFinite(a.effect?.getComputedTiming().iterations ?? 1))) await new Promise(resolve => setTimeout(resolve, 100))
})()`)
