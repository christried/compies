import { boolean, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { PHASES } from '../../shared/session'

// MVP schema (#1). Every instant is timestamptz in UTC (ADR 0003); every id is a database-generated uuid.

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull()

// Better Auth's core user model, renamed to `users` (ADR 0004). `name` and `image` mirror the
// provider; `displayName` is ours and NULL until profile setup is done. `canHost` and `isAdmin`
// come from the env allowlist at every sign-in (ADR 0002).
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  displayName: text('display_name'),
  canHost: boolean('can_host').default(false).notNull(),
  isAdmin: boolean('is_admin').default(false).notNull(),
})

// Better Auth's login sessions, provider accounts and OAuth state, renamed so that a bare "session"
// always means a game Session (ADR 0004). Columns as `npx auth generate` emits them, but timestamptz.
export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, table => [index('auth_sessions_user_id_idx').on(table.userId)])

export const authAccounts = pgTable('auth_accounts', {
  id: uuid('id').defaultRandom().primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
  scope: text('scope'),
  password: text('password'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [index('auth_accounts_user_id_idx').on(table.userId)])

export const authVerifications = pgTable('auth_verifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [index('auth_verifications_identifier_idx').on(table.identifier)])

export const sessionPhase = pgEnum('session_phase', PHASES)
export const dateMode = pgEnum('date_mode', ['poll', 'direct'])

export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  inviteToken: text('invite_token').notNull().unique(),
  hostId: uuid('host_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  phase: sessionPhase('phase').notNull(),
  dateMode: dateMode('date_mode').notNull(),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  previousStartsAt: timestamp('previous_starts_at', { withTimezone: true }),
  icsSequence: integer('ics_sequence').default(0).notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

export const memberZone = pgEnum('member_zone', ['bench', 'stands', 'team'])

export const sessionMembers = pgTable('session_members', {
  sessionId: uuid('session_id').notNull().references(() => sessions.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  zone: memberZone('zone').default('bench').notNull(),
}, table => [primaryKey({ columns: [table.sessionId, table.userId] })])

export const pollSlots = pgTable('poll_slots', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, table => [unique().on(table.sessionId, table.startsAt)])

export const voteValue = pgEnum('vote_value', ['yes', 'maybe', 'no'])

export const pollVotes = pgTable('poll_votes', {
  slotId: uuid('slot_id').notNull().references(() => pollSlots.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  value: voteValue('value').notNull(),
  updatedAt: updatedAt(),
}, table => [primaryKey({ columns: [table.slotId, table.userId] })])
