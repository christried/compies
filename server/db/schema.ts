import { boolean, integer, pgEnum, pgTable, primaryKey, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'

// MVP schema (#1). Every instant is timestamptz in UTC (ADR 0003); every id is a database-generated uuid.

const createdAt = () => timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull()

// Better Auth's core user model, renamed to `users` (ADR 0004). The auth_* tables follow with sign-in.
// `name` and `image` mirror the provider; `displayName` is ours and NULL until profile setup is done.
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

export const sessionPhase = pgEnum('session_phase', ['draft', 'poll', 'date_set', 'running', 'finished', 'archived'])
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
