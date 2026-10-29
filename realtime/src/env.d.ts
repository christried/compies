// The bindings of the Worker (wrangler.jsonc, secrets) as PartyServer and `cloudflare:workers` see them.
declare namespace Cloudflare {
  interface GlobalProps {
    /** Types `exports.default.fetch` in the tests. */
    mainModule: typeof import('./index')
  }
  interface Env {
    EventRoom: DurableObjectNamespace<import('./room').EventRoom>
    /** Comma-separated origins that may open a socket: the app's origin, plus localhost in dev. */
    ALLOWED_ORIGINS: string
    /** `eu` on the deployed Workers; unset in dev and tests, where workerd has no jurisdictions. */
    JURISDICTION?: DurableObjectJurisdiction
    ROOM_TOKEN_SECRET: string
    ROOM_INTERNAL_SECRET: string
    ROOM_TOKEN_SECRET_PREVIOUS?: string
    ROOM_INTERNAL_SECRET_PREVIOUS?: string
  }
}
