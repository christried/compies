import { defineEventHandler } from 'h3'
import { pollSlots } from '../../../../db/schema'
import { parseEditedSlot } from '../../../../domain/event'
import { apiError } from '../../../../utils/errors'
import { changeSlots } from '../../../../utils/host-event'
import { eventSlots } from '../../../../utils/slots'
import type { SlotAdded } from '../../../../../shared/event'
import { asRecord } from '../../../../../shared/record'

// Add a Slot to a Date poll (#15, #1 § Domain rules). Host only, Phase `poll`. The Slot must be in the
// future, unique per minute and leave at most 16 Slots in the Event. The Event is locked for the
// whole write, so two adds cannot both pass the limit. Members see the Slot on their next read.
export default defineEventHandler((event): Promise<SlotAdded> => changeSlots(event, async ({ tx, eventRow, body }) => {
  const existing = await eventSlots(tx, eventRow.id)

  const parsed = parseEditedSlot(asRecord(body).startsAt, existing, new Date())
  if (!parsed.ok) throw apiError(parsed.error)

  const [slot] = await tx
    .insert(pollSlots)
    .values({ eventId: eventRow.id, startsAt: parsed.startsAt })
    .returning({ id: pollSlots.id, startsAt: pollSlots.startsAt })
  return { slotId: slot!.id, startsAt: slot!.startsAt.toISOString() }
}))
