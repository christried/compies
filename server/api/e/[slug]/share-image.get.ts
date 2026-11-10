import { createError, defineEventHandler, getQuery, getRouterParam, setHeader } from 'h3'
import de from '../../../../i18n/locales/de.json'
import { beforeFinish } from '../../../../shared/phase'
import { parseShareFormat, shareImageModel } from '../../../../shared/share-image'
import { useClock } from '../../../utils/clock'
import { useDb } from '../../../utils/db'
import { apiError } from '../../../utils/errors'
import { loadEvent } from '../../../utils/event-access'
import { useShareAssets } from '../../../utils/share-assets'
import { shareImageSource } from '../../../utils/share-image'
import { renderShareImage } from '../../../utils/share-render'
import { requireUser } from '../../../utils/user'

// The Share image of a finished Event (#313, spec #308): a PNG of the Winner, the Standings and the played games, `?format=wide|square`.
// Members only, and refused exactly as the Event read refuses (ADR 0006): a non-Member and an unknown slug get the same 404, a former
// Member of a deleted Event the 410. Every Member may have it, a Member on the Stands too; no Host check. Before the Finish it answers
// `wrong_phase`; the format is checked after that, so a non-Member never learns whether it was valid.
// The picture is made on every request from the Event read's own section builders and stores nothing: no file, no cache of finished PNGs
// or SVGs, nothing in the room or the Activity feed. `Cache-Control: private`. It shows the Event's name, the Dates, the Standings, the
// played games and a count of Players, and no Player's name, picture, Vote or Note. The fonts, pictures and WebAssembly ship with the
// server, so nothing leaves it on the way.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const db = useDb(event)
  const eventRow = await loadEvent(db, getRouterParam(event, 'slug') ?? '', user.id)
  if (beforeFinish(eventRow.phase)) throw apiError('wrong_phase')
  const format = parseShareFormat(getQuery(event).format)
  if (format === null) throw apiError('invalid_value')

  const source = await shareImageSource(db, eventRow, { id: user.id, isHost: eventRow.hostId === user.id }, useClock(event).now())
  const model = shareImageModel(source, format, { share: de.share, team: de.team })
  // A finished Event always has Standings; this only guards an Event that was never set up.
  if (!model) throw createError({ statusCode: 404, statusMessage: 'No result to show' })
  const png = await renderShareImage(model, useShareAssets(event))

  setHeader(event, 'content-type', 'image/png')
  setHeader(event, 'cache-control', 'private')
  return png
})
