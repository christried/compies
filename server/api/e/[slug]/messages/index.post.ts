import { defineEventHandler } from 'h3'
import type { AuthUser } from '../../../../../shared/auth'
import type { Message } from '../../../../../shared/chat'
import { apiError } from '../../../../utils/errors'
import { writeMessage } from '../../../../utils/chat'
import { changeEvent } from '../../../../utils/event-access'
import { createRateLimiter } from '../../../../utils/rate-limit'

// Write a Message (#758, spec #719 § A): any Member, the Host and a Member on the Stands included. A second instance of the Votes' limiter: 5 Messages
// in 10 seconds per User, across Events, in memory per server instance. `take` runs before the body is read (changeEvent's beforeBody), so every
// authenticated request counts, a retry and a request that is refused later (404, 410, `wrong_phase`, a bad body) included; a request refused with 429 adds no hit.
// The limiter reads the request's clock (`beforeBody`'s `now`), so a test moves it.
const messageLimiter = createRateLimiter({ limit: 5, windowMs: 10_000 })

function limitMessages(user: AuthUser, now: Date) {
  if (!messageLimiter.take(user.id, now)) throw apiError('rate_limited')
}

// The shared lock holds the Event still (a Finish cannot interleave) and Messages do not block each other. `broadcast: false`: nothing in the Event read
// changes, so no `event.changed` goes out, only the `chat.added` the write queues (ADR 0013). A finished Event answers `wrong_phase` by changeEvent's own rule.
export default defineEventHandler((event): Promise<Message> =>
  changeEvent(event, { lock: 'share', beforeBody: limitMessages, broadcast: false }, change => writeMessage(change)))
