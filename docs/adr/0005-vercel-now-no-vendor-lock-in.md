# Vercel for the MVP, without Vercel-only APIs

Nuxt deploys to Vercel. To keep a move to Cloudflare cheap (ADR 0012 keeps it open), the app uses no Vercel-only runtime APIs (no Vercel KV, Edge Config or `@vercel/*` runtime imports) and only a database driver that also runs on Workers: `drizzle-orm/neon-serverless` with a `Pool` created per request, which supports interactive transactions (`neon-http` does not).

One exception: `waitUntil` from `@vercel/functions` may be imported, and only in `server/utils/after-response.ts`, so the room publish can run after the response. Nitro's Vercel preset does not pass `event.waitUntil` on to the platform, so a promise left running after the response could be frozen before it ends. Off Vercel the call does nothing and the promise runs in the process; moving hosts means replacing that one function. The lint rule stays, with an override that allows this one file.
