import { createError, defineEventHandler, getRequestURL, toWebRequest } from 'h3'
import { useAuth } from '../../utils/auth'

// Only the Better Auth endpoints the app uses. The rest stay closed: get-session would return the
// email (ADR 0008), update-user would let a User overwrite the provider's name and image, and
// linking a second provider comes with T2b. `error` is where Better Auth sends OAuth state errors.
const ALLOWED = [/^\/sign-in\/social$/, /^\/callback\/(discord|twitch)$/, /^\/sign-out$/, /^\/error$/]

export default defineEventHandler((event) => {
  const path = getRequestURL(event).pathname.replace(/^\/api\/auth/, '')
  if (!ALLOWED.some(pattern => pattern.test(path))) throw createError({ statusCode: 404 })
  return useAuth(event).handler(toWebRequest(event))
})
