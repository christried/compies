// Loads notesPlainText from shared/notes-doc.ts for the Tag review's script (#730), so the export turns a note document into text with the app's own function and no copy of it.
// Node strips the types of a .ts file itself (^24.15.0), but shared/ imports its neighbours without an extension (`./record`), which native ESM does not resolve:
// this hook retries such a relative import with `.ts`. It touches nothing in shared/.
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

/** @returns {Promise<(doc: any) => string>} */
export async function loadNotesPlainText() {
  const module = await import(new URL('../../../shared/notes-doc.ts', import.meta.url).href)
  return module.notesPlainText
}
