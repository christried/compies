// Every port of the browser scripts, in one table, and the two slots they run in (#567, spec #554 § Browser checks).
// Slot 1 is the browser checks' and what the scripts always were; slot 2 is an implementer's measurement of a fix beside a running check:
// every port plus 100, with its own Chrome profiles. A slot is chosen with the environment variable COMPIES_SLOT (`1` or `2`, unset is 1),
// which `serve.mjs`, `chrome.mjs`, `kit.mjs` and `dark.mjs` read, and `serve.mjs start` also takes `--slot=`. No side effects, no dependency:
// `serve.mjs` runs at import, so the table cannot live in it.

/** @typedef {1 | 2} Slot */
/** @typedef {{ app: number, realtime: number, prod: number, inspector: number, chrome: { host: number, member: number, admin: number } }} Ports */
/** @typedef {{ port: number, log: string, command: string | null, args?: string[], env?: Record<string, string>, notBuilding?: true, needs?: string }} ServerSpec */

// Slot 1's `inspector` is documentation: slot 1 passes no inspector flag and wrangler probes upward from 9229 itself.
const SLOT_1 = { app: 3000, realtime: 8787, prod: 3001, inspector: 9229, chrome: { host: 9311, member: 9312, admin: 9313 } }
const SLOT_STEP = 100

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {Slot}
 */
export function slotOf(env = process.env) {
  const value = env.COMPIES_SLOT
  if (value === undefined || value === '') return 1
  if (value === '1') return 1
  if (value === '2') return 2
  throw new Error(`COMPIES_SLOT must be 1 or 2, got "${value}"`)
}

/**
 * @param {Slot} slot
 * @returns {Ports}
 */
export function portsOf(slot) {
  const shift = (slot - 1) * SLOT_STEP
  const { chrome } = SLOT_1
  return {
    app: SLOT_1.app + shift,
    realtime: SLOT_1.realtime + shift,
    prod: SLOT_1.prod + shift,
    inspector: SLOT_1.inspector + shift,
    chrome: { host: chrome.host + shift, member: chrome.member + shift, admin: chrome.admin + shift },
  }
}

/**
 * @param {Slot} slot
 * @param {'app' | 'realtime' | 'prod'} name
 */
export function originOf(slot, name) {
  return `http://localhost:${portsOf(slot)[name]}`
}

/**
 * The three servers `serve.mjs` can start. Slot 1 is what the script always ran; slot 2 passes its own port, tells the Worker the slot's app
 * origins and the app the slot's Worker address (`REALTIME_URL`) and its own origin (`BETTER_AUTH_URL`, which Better Auth trusts as the only origin).
 * @param {Slot} slot
 * @returns {{ dev: ServerSpec, realtime: ServerSpec, prod: ServerSpec }}
 */
export function serversOf(slot) {
  const ports = portsOf(slot)
  // The second origin lets a production build play the run (browser check c3, 10b). wrangler splits `--var` at the first colon only.
  const origins = `--var "ALLOWED_ORIGINS:${originOf(slot, 'app')},${originOf(slot, 'prod')}"`
  if (slot === 1) {
    return {
      dev: { port: ports.app, log: 'dev.log', command: 'pnpm dev', notBuilding: true },
      realtime: { port: ports.realtime, log: 'rt.log', command: `pnpm --dir realtime dev ${origins}` },
      prod: { port: ports.prod, log: 'prod.log', command: null, args: ['--env-file=.env', '.output/server/index.mjs'], env: { PORT: String(ports.prod) }, needs: '.output/server/index.mjs' },
    }
  }
  const realtime = originOf(slot, 'realtime')
  return {
    dev: { port: ports.app, log: 'dev.log', command: `pnpm dev --port ${ports.app}`, notBuilding: true, env: { REALTIME_URL: realtime, BETTER_AUTH_URL: originOf(slot, 'app') } },
    realtime: { port: ports.realtime, log: 'rt.log', command: `pnpm --dir realtime dev --port ${ports.realtime} --inspector-port ${ports.inspector} ${origins}` },
    prod: {
      port: ports.prod,
      log: 'prod.log',
      command: null,
      args: ['--env-file=.env', '.output/server/index.mjs'],
      env: { PORT: String(ports.prod), REALTIME_URL: realtime, BETTER_AUTH_URL: originOf(slot, 'prod') },
      needs: '.output/server/index.mjs',
    },
  }
}

/**
 * One Chrome profile serves one browser at a time and cookies ignore ports, so the slots keep separate profile folders.
 * @param {Slot} slot
 * @param {string} account
 */
export function profileOf(slot, account) {
  return slot === 1 ? `profile-${account}` : `profile-${account}-slot2`
}
