import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createError, defineEventHandler, getRouterParam, setHeader } from 'h3'
import { CUE_IDS } from '../../app/utils/sound-cues'

// Serves the candidate files and the manifest of the listening page (app/dev/listening-page.vue) from `sound-candidates/` at the repo
// root (#534). Only the dev server registers this route (carriesListeningPage in stage.ts, read by nuxt.config.ts): no candidate file
// lives under `public/`, so a production or staging deployment never has one. `**` is the router param `_`; the path must be the manifest
// or `<cue id>/<name>.<wav|ogg|mp3>`, nothing else, so no `..` and no other folder can be asked for.
const PATH = /^(manifest\.json|([a-z-]+)\/[\w.-]+\.(wav|ogg|mp3))$/
const TYPES: Record<string, string> = { json: 'application/json', wav: 'audio/wav', ogg: 'audio/ogg', mp3: 'audio/mpeg' }

export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, '_') ?? ''
  const match = PATH.exec(path)
  if (!match || (match[2] !== undefined && !(CUE_IDS as readonly string[]).includes(match[2]))) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  let bytes: Buffer
  try {
    bytes = await readFile(resolve(process.cwd(), 'sound-candidates', path))
  }
  catch {
    throw createError({ statusCode: 404, statusMessage: 'Not Found' })
  }
  setHeader(event, 'Content-Type', TYPES[path.slice(path.lastIndexOf('.') + 1)]!)
  // A file the agent adds is heard on reload.
  setHeader(event, 'Cache-Control', 'no-store')
  return bytes
})
