import { waitUntil } from '@vercel/functions'

/**
 * Keeps the promise running after the response has gone out (#202). This is the one import of a Vercel-only API, the
 * exception ADR 0005 allows for it. Nitro's Vercel preset doesn't hand `event.waitUntil` to the platform, so the
 * function could be frozen before the promise ends; Vercel's `waitUntil` keeps it alive. Off Vercel it does nothing
 * and the promise runs in the process. A move off Vercel replaces this function with the host's waitUntil, e.g.
 * Nitro's `event.waitUntil` on Cloudflare; nothing else changes.
 */
export function afterResponse(promise: Promise<unknown>): void {
  waitUntil(promise)
}
