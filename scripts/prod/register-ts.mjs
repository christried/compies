// Lets plain Node load the TypeScript modules of server/ for the operator's scripts (#919), the hook of .claude/skills/christried-tag-review/notes-text.mjs.
// Node strips the types of a .ts file itself (^24.15.0), but server/ and shared/ import their neighbours without an extension (`./record`), which native ESM
// does not resolve: this hook retries such a relative import with `.ts`. It touches nothing in server/ or shared/.
import { registerHooks } from 'node:module'

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    }
    catch (error) {
      if (error?.code === 'ERR_MODULE_NOT_FOUND' && /^\.\.?\//.test(specifier) && !/\.\w+$/.test(specifier)) return nextResolve(`${specifier}.ts`, context)
      throw error
    }
  },
})
