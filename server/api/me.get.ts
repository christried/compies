import { defineEventHandler } from 'h3'
import { correctAppearanceCookie } from '../utils/appearance-cookie'
import { getUser } from '../utils/user'
import type { MeView } from '../../shared/auth'

// The signed-in User for the route guard and the header, or null when signed out. For a signed-in User it also corrects
// the device's Appearance cookie (#403); the auth middleware passes that header on to the browser on a server-side load.
export default defineEventHandler(async (event): Promise<MeView> => {
  const user = await getUser(event)
  if (user) await correctAppearanceCookie(event, user.appearance)
  return { user }
})
