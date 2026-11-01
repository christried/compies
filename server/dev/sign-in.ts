import { makeSignature } from 'better-auth/crypto'
import { defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3'
import { users } from '../db/schema'
import { createAuth } from '../utils/auth'
import { useDb } from '../utils/db'
import { apiNotFound } from '../utils/errors'
import { CURRENT_RELEASE } from '../utils/release'

// Signs in without Discord or Twitch on `pnpm dev`, so the user and agents can open Host and Member
// pages locally and take screenshots (retro 1.3). Only the dev server registers this route
// (nuxt.config.ts); test/build/dev-sign-in.test.ts checks the production build has none.
// `?as=host|member|admin` picks the User, `?to=/path` where to land, `?news=unseen` leaves „Was ist neu“ unseen.
const PEOPLE = {
  host: { name: 'Dev Host', canHost: true, isAdmin: false },
  member: { name: 'Dev Member', canHost: false, isAdmin: false },
  admin: { name: 'Dev Admin', canHost: true, isAdmin: true },
} as const

type Person = keyof typeof PEOPLE

// Every Discord and Twitch account has a picture, so the dev Users have one too: pages and browser checks then draw
// the picture, not the initial (the 1.4 walk-through found a drag only the picture broke, #207).
const PICTURE = '/icons/icon-192.png'

// Only a path inside the app, so the link can't send anyone elsewhere.
const landing = (to: unknown) => typeof to === 'string' && /^\/(?!\/)/.test(to) ? to : '/'

export default defineEventHandler(async (event) => {
  if (process.env.NODE_ENV === 'production') throw apiNotFound()
  const query = getQuery(event)
  const as: Person = typeof query.as === 'string' && query.as in PEOPLE ? query.as as Person : 'host'
  const person = PEOPLE[as]

  // The same three Users every time; the permissions are set here, since no allowlist knows them. Every sign-in marks
  // the current Release seen, so a Release never opens the pop-up on the dev server (review 0.5.1 T2); `?news=unseen`
  // stores null, for the one check that wants the pop-up.
  const newsSeen = query.news === 'unseen' ? null : CURRENT_RELEASE
  const db = useDb(event)
  const [user] = await db.insert(users)
    .values({ ...person, displayName: person.name, image: PICTURE, email: `${as}@dev.compies.invalid`, emailVerified: true, newsSeen })
    .onConflictDoUpdate({ target: users.email, set: { canHost: person.canHost, isAdmin: person.isAdmin, image: PICTURE, newsSeen } })
    .returning({ id: users.id })

  // A Better Auth login session, with the cookie signed the way Better Auth signs it.
  const auth = await createAuth(db).$context
  const session = await auth.internalAdapter.createSession(user!.id)
  const { name, attributes } = auth.authCookies.sessionToken
  setCookie(event, name, `${session.token}.${await makeSignature(session.token, auth.secret)}`, {
    path: attributes.path ?? '/',
    httpOnly: attributes.httpOnly ?? true,
    secure: attributes.secure ?? false,
    sameSite: 'lax',
    maxAge: attributes.maxAge,
    encode: value => value,
  })
  return sendRedirect(event, landing(query.to))
})
