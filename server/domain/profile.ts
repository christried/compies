import { DISPLAY_NAME_MAX } from '../../shared/auth'

/** The Display name to store: trimmed, 1–32 characters (emoji count as one). Null when invalid. */
export function parseDisplayName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const name = raw.trim()
  const length = [...name].length
  return length >= 1 && length <= DISPLAY_NAME_MAX ? name : null
}
