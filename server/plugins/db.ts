import type { H3Event } from 'h3'

async function endPool(event: H3Event) {
  const pool = event.context.dbPool
  event.context.dbPool = undefined
  await pool?.end()
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', event => endPool(event))
  nitroApp.hooks.hook('error', async (_error, { event }) => {
    if (event) await endPool(event)
  })
})
