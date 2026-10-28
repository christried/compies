import { defineEventHandler } from 'h3'
import { apiNotFound } from '../utils/errors'

// No method suffix, so every method. An unmatched /api/** request gets the JSON 404 of a missing
// API resource, never the page (review Spec F2). More specific routes, such as auth/[...all].ts, still win.
export default defineEventHandler(() => {
  throw apiNotFound()
})
