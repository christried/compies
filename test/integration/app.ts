import { readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { isEventHandler, lazyEventHandler, type EventHandler, type H3EventContext, type RouterMethod } from 'h3'
import type { Db } from '../../server/utils/db'
import { createTestServer, type Route } from './harness'

/** What a test calls: a path and the init of a `Request`, answered like the real server would. */
export type TestRequest = (path: string, init?: RequestInit) => Promise<Response>

export interface MountedRoute {
  /** Relative to server/api, with `/` separators: `e/[slug]/rounds/[id].delete.ts`. */
  file: string
  /** The route in the form Nitro gives it: `/api/e/:slug/rounds/:id`. */
  route: string
  /** `null`: every method, as for a file without a method suffix. */
  method: RouterMethod | null
  /** `['slug', 'id']`; the name `all` for `**:all`; none for a bare `**`. */
  params: string[]
  load(): Promise<EventHandler>
}

const apiRoot = fileURLToPath(new URL('../../server/api', import.meta.url))

const methods = ['connect', 'delete', 'get', 'head', 'options', 'patch', 'post', 'put', 'trace'] as const
const suffix = new RegExp(`(\\.(?<method>${methods.join('|')}))?(\\.(?<env>dev|prod|prerender))?$`)

/**
 * The route a file under server/api serves, by the rule of Nitro 2.13.5 (`scanServerRoutes` in nitropack's
 * core/index.mjs), so a new file is served without an edit here (#418). `[...]` and `[...all]` are catch-alls;
 * a file without a method suffix answers every method.
 */
export function routeOfFile(file: string): { route: string, method: RouterMethod | null } {
  const withoutExtension = file
    .replace(/\.[A-Za-z]+$/, '')
    .replace(/\(([^(/\\]+)\)[/\\]/g, '')
    .replace(/\[\.{3}]/g, '**')
    .replace(/\[\.{3}(\w+)]/g, '**:$1')
    .replace(/\[([^/\]]+)]/g, ':$1')
  let route = `/api/${withoutExtension}`
  const found = suffix.exec(route)
  if (found?.groups?.env) throw new Error(`server/api/${file}: the .${found.groups.env} suffix is not supported by the test app`)
  if (found?.index) route = route.slice(0, found.index)
  route = route.replace(/\/index$/, '') || '/'
  return { route, method: (found?.groups?.method as RouterMethod | undefined) ?? null }
}

/** The event handler a route file exports; a file that has none fails here, naming the file, not at its first request. */
export function handlerOf(file: string, module: { default?: unknown }): EventHandler {
  const exported = module.default
  if (typeof exported !== 'function' || !isEventHandler(exported)) {
    throw new Error(`server/api/${file} has no default export that is an event handler`)
  }
  return exported as EventHandler
}

const ignored = /\.(d\.(cts|mts|ts)|(spec|test)\.[^/]+|stories\.[^/]+)$|\.stories\./

let scanned: MountedRoute[] | undefined

/** Every route file under server/api, sorted by file. Scanned once; the handlers load when first asked for. */
export function mountedRoutes(): MountedRoute[] {
  scanned ??= scan()
  return scanned
}

function scan(): MountedRoute[] {
  const files = readdirSync(apiRoot, { recursive: true, encoding: 'utf8' })
    .map(file => file.replaceAll('\\', '/'))
    .filter(file => /\.(js|mjs|cjs|ts|mts|cts|tsx|jsx)$/.test(file) && !ignored.test(file) && statSync(`${apiRoot}/${file}`).isFile())
    .sort()
  const seen = new Map<string, string>()
  return files.map((file) => {
    const { route, method } = routeOfFile(file)
    const key = `${method ?? 'ALL'} ${route}`
    const other = seen.get(key)
    if (other) throw new Error(`server/api/${file} and server/api/${other} both serve ${key}`)
    seen.set(key, file)
    const params = [...route.matchAll(/:(\w+)|\*\*:(\w+)/g)].map(match => (match[1] ?? match[2])!)
    return {
      file,
      route,
      method,
      params,
      async load() {
        // The absolute path, outside Vite's static import analysis, which cannot follow a path with folders in a variable.
        // The module runner still resolves it, so `vi.mock` in a test file applies to the handler.
        return handlerOf(file, await import(/* @vite-ignore */ `${apiRoot}/${file}`) as { default?: unknown })
      },
    }
  })
}

/**
 * Serves every handler under server/api the way Nitro would, with `db` in place of the per-request Neon Pool.
 * `context` is what the caller passes (`imageStore`, `roomNotifier`, `clock`, `shareAssets`) and nothing more.
 * `extra` serves a route outside the tree, such as the dev sign-in, which a Nuxt module registers.
 * The handlers load on their first request: a test that touches three routes does not import the share image's resvg.
 */
export function createTestApp(db: Db, context: Partial<H3EventContext> = {}, extra: Record<Route, EventHandler> = {}): TestRequest {
  const routes: Record<Route, EventHandler> = { ...extra }
  for (const { route, method, load } of mountedRoutes()) {
    routes[`${method ? method.toUpperCase() as Uppercase<RouterMethod> : 'ALL'} ${route}` as Route] = lazyEventHandler(load)
  }
  return createTestServer(db, routes, context)
}

/** The signature the local `send` helpers of the integration tests share. */
export type Send = (method: string, path: string, cookie: string | undefined, body?: unknown) => Promise<Response>

/** `request` is assigned in `beforeAll`, so the helper reads it when called. */
export function sendVia(request: () => TestRequest): Send {
  return (method, path, cookie, body) => request()(path, {
    method,
    headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

/** The status and the machine-readable code (`statusMessage`) of an error response. */
export async function errorOf(response: Response): Promise<{ status: number, code: string }> {
  const body = await response.json() as { statusMessage: string }
  return { status: response.status, code: body.statusMessage }
}
