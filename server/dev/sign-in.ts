import { makeSignature } from 'better-auth/crypto'
import { sql } from 'drizzle-orm'
import { defineEventHandler, getQuery, sendRedirect, setCookie } from 'h3'
import { users } from '../db/schema'
import { isAppearance, type Appearance } from '../../shared/auth'
import { createAuth } from '../utils/auth'
import { useDb } from '../utils/db'
import { CURRENT_RELEASE } from '../utils/release'

// Signs in without Discord or Twitch, so the user and agents can open Host and Member pages and take screenshots
// (retro 1.3). Only the builds carriesDevSignIn names register this route (stage.ts, read by nuxt.config.ts; #247).
// The handler has no check of its own: the staging build carries it and runs with NODE_ENV=production.
// `?as=host|member|admin` picks the User, `?to=/path` where to land, `?news=unseen` leaves „Was ist neu“ unseen,
// `?appearance=dark|system|light` sets the Appearance, light when absent (#401), `?name=unset` stores no Display name,
// so Profile setup opens (#407).
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
  const query = getQuery(event)
  const as: Person = typeof query.as === 'string' && query.as in PEOPLE ? query.as as Person : 'host'
  const person = PEOPLE[as]

  // The same three Users every time; the permissions are set here, since no allowlist knows them. Every sign-in marks
  // the current Release seen, so a Release never opens the pop-up on the dev server (review 0.5.1 T2); `?news=unseen`
  // stores null, for the one check that wants the pop-up. The Appearance is reset on every sign-in like the news, so a
  // check starts from a known look: the one `?appearance=` names, else light (#401).
  const newsSeen = query.news === 'unseen' ? null : CURRENT_RELEASE
  const appearance: Appearance = isAppearance(query.appearance) ? query.appearance : 'light'
  // No route removes a Display name, so this is the one way to see Profile setup. Every other sign-in puts the dev name
  // back only where there is none: a dev User renamed on the Profil page keeps the name (#398).
  const nameUnset = query.name === 'unset'
  const db = useDb(event)
  const [user] = await db.insert(users)
    .values({ ...person, displayName: nameUnset ? null : person.name, image: PICTURE, email: `${as}@dev.compies.invalid`, emailVerified: true, newsSeen, appearance })
    .onConflictDoUpdate({ target: users.email, set: {
      canHost: person.canHost,
      isAdmin: person.isAdmin,
      image: PICTURE,
      newsSeen,
      appearance,
      displayName: nameUnset ? null : sql`coalesce(${users.displayName}, ${person.name})`,
    } })
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
