# Vercel for the MVP, without Vercel-only APIs

The MVP deploys Nuxt to Vercel as planned. Whether to move Nuxt onto Cloudflare (Nitro `cloudflare` preset, same-origin websockets to the Durable Objects) is deferred to T6 (realtime foundation), when we know what cross-origin room tokens actually cost. To keep that move cheap, the MVP uses no Vercel-only runtime APIs (no Vercel KV, Edge Config or `@vercel/*` runtime imports) and only a database driver that also runs on Workers.

For the same reason the database driver is `drizzle-orm/neon-serverless` with a `Pool` created per request: it supports interactive transactions (which `neon-http` does not) and is documented to run on both Vercel functions and Cloudflare Workers. End-to-end on Workers is unverified until T6.

Amendment (2026-10-31, #202): one exception. `waitUntil` from `@vercel/functions` may be imported, and only in `server/utils/after-response.ts`, so the room publish can run after the response. Nitro's Vercel preset does not pass `event.waitUntil` on to the platform, so a promise left running after the response could be frozen before it ends. Off Vercel the call does nothing and the promise runs in the process. Moving hosts means replacing that one function with the new host's waitUntil. The lint rule stays, with an override that allows this one file.
