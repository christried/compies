import { defineEventHandler, deleteCookie, readBody, setCookie } from 'h3'
import { asRecord } from '../../../shared/record'
import { MOTION_COOKIE, MOTION_REDUCED } from '../../../shared/motion'
import type { SavedMotion } from '../../../shared/auth'
import { ONE_YEAR, deviceCookieOptions } from '../../utils/device-cookie'
import { apiError } from '../../utils/errors'
import { requireUser } from '../../utils/user'

// This device's Reduced motion (#680, GLOSSARY: Reduced motion): it belongs to the device, not to the User, so there is nothing to store and
// no database is opened: the route sets the cookie, or removes it when the switch goes off. Only the server writes the cookie, so the page
// renders `data-motion="reduced"` in its first byte (and a cookie written by script lasts seven days in Safari). Not an Event change, so no room
// message (ADR 0013).
export default defineEventHandler(async (event): Promise<SavedMotion> => {
  await requireUser(event)
  const reduced = asRecord(await readBody(event)).reduced
  if (typeof reduced !== 'boolean') throw apiError('invalid_value')

  const options = await deviceCookieOptions(event)
  if (reduced) setCookie(event, MOTION_COOKIE, MOTION_REDUCED, { ...options, maxAge: ONE_YEAR })
  else deleteCookie(event, MOTION_COOKIE, options)
  return { reduced }
})
