const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Whether the value is a uuid as the database generates them; text that is none never reaches a query. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value)
}
