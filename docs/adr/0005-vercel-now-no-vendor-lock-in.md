# Vercel for the MVP, without Vercel-only APIs

The MVP deploys Nuxt to Vercel as planned. Whether to move Nuxt onto Cloudflare (Nitro `cloudflare` preset, same-origin websockets to the Durable Objects) is deferred to T6 (realtime foundation), when we know what cross-origin room tokens actually cost. To keep that move cheap, the MVP uses no Vercel-only runtime APIs (no Vercel KV, Edge Config or `@vercel/*` runtime imports) and only a database driver that also runs on Workers.

For the same reason the database driver is `drizzle-orm/neon-serverless` with a `Pool` created per request: it supports interactive transactions (which `neon-http` does not) and is documented to run on both Vercel functions and Cloudflare Workers. End-to-end on Workers is unverified until T6.
