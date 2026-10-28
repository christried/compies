# Nuxt stays on Vercel, realtime runs in a separate PartyServer Worker

For the realtime foundation (release 1.4), Nuxt stays on Vercel and the realtime rooms run in one separate Cloudflare Worker with PartyServer: one Durable Object room per Event, a staging and a production Worker. The browser connects cross-origin with a short-lived room token that Nuxt signs; the room never touches Postgres and writes through a signed internal Nuxt endpoint, so the schema and the database secret stay in one place. Moving Nuxt to Cloudflare would not save the second deploy (Nitro's built-in Durable Object is one shared object, not one per room), and its custom domains need `christried.me` on Cloudflare DNS, which we are not moving. ADR 0005's promise holds: a spike built and booted this app with Nitro's `cloudflare_module` preset, so the move stays open. Facts and sources: `docs/research/realtime-hosting.md`.

## Consequences

- Game images on R2 are served through a cached Nuxt route, not a public bucket on our own domain, since that also needs Cloudflare DNS.
- Deploying the Worker drops every open socket, so release 1.4 has to settle when the Worker may be deployed.
