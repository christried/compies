// The game-day guard of the production Worker deploy (#157, spec #153 § Deploys). Deploying the Worker drops every open
// socket, so the workflow runs this first: it asks the app whether a Session is dated today and exits 1 if so (or if it
// cannot find out: when in doubt, the deploy waits).
//
// The call is signed like a publish to a room (shared/room-auth.ts `signRoomCall`): HMAC-SHA256 in hex over
// `timestamp.body`, here with an empty body. Plain Node, no imports from ../../shared, so the workflow needs nothing
// installed beyond Node itself.

import { createHmac } from 'node:crypto'

const url = process.env.DEPLOY_CHECK_URL || 'https://compies.christried.me/api/internal/deploy-check'
const secret = process.env.ROOM_INTERNAL_SECRET

/** The reason the deploy must wait, or null when it may go ahead. */
async function blockedBecause() {
  if (!secret) return 'ROOM_INTERNAL_SECRET is not set, so the game-day check cannot be signed.'

  const timestamp = String(Date.now())
  const signature = createHmac('sha256', secret).update(`${timestamp}.`).digest('hex')

  let response
  try {
    response = await fetch(url, {
      headers: { 'x-room-timestamp': timestamp, 'x-room-signature': signature },
      signal: AbortSignal.timeout(15_000),
    })
  }
  catch (error) {
    return `the game-day check at ${url} could not be reached (${error instanceof Error ? error.message : error}).`
  }
  if (!response.ok) return `the game-day check answered ${response.status}. Is ROOM_INTERNAL_SECRET_PRODUCTION the key Vercel's production has?`

  const answer = await response.json().catch(() => null)
  if (!answer || typeof answer.ok !== 'boolean') return 'the game-day check answered something unexpected.'
  return answer.ok ? null : (answer.reason ?? 'the app says this is no time to deploy.')
}

const reason = await blockedBecause()
if (reason) {
  console.error(`Deploy blocked: ${reason}`)
  process.exitCode = 1
}
else {
  console.log('Game-day check passed: no Session is dated today.')
}
