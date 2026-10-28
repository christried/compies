// Request bodies and stored JSON arrive as `unknown`. These two guards narrow them without a cast (D2).

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The value as a record; an empty one when it is none (absent, null, a string, an array). */
export function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}
