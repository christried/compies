import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { ACTIVITY_TYPES, type ActivityParams, type ActivityType } from '../../shared/activity'
import { PHASES } from '../../shared/event'
import { ZONES } from '../../shared/board'
import { SUITABILITIES } from '../../shared/game'
import { FORMATS, POOLS, SELECTION_MODES, type PointsTable } from '../../shared/settings'

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
  // The newest Release the User has seen in „Was ist neu“ (#184); null for a User who has seen none.
  newsSeen: text('news_seen_version'),
})

// Better Auth's login sessions, provider accounts and OAuth state, renamed so that a bare "session"
// is free for the sittings of an Event (ADR 0004, ADR 0011). Columns as `npx auth generate` emits them, but timestamptz.
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

export const eventPhase = pgEnum('event_phase', PHASES)
export const eventFormat = pgEnum('event_format', FORMATS)
export const selectionMode = pgEnum('selection_mode', SELECTION_MODES)

export const events = pgTable('events', {
  id: uuid('id').defaultRandom().primaryKey(),
  slug: text('slug').notNull().unique(),
  inviteToken: text('invite_token').notNull().unique(),
  hostId: uuid('host_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  phase: eventPhase('phase').notNull(),
  // Event settings (#138, 1.3), set in the stepper. All null = not set up: only Events created before 1.3.
  // `hiddenWheel` and `vetoAllowance` belong to the Lucky Wheel; with another Selection mode they are false and null.
  format: eventFormat('format'),
  teamCount: integer('team_count'),
  teamSize: integer('team_size'),
  gameCount: integer('game_count'),
  pointsTable: jsonb('points_table').$type<PointsTable>(),
  selectionMode: selectionMode('selection_mode'),
  hiddenWheel: boolean('hidden_wheel'),
  // Pool preview (#225): null only for Events not set up and rows the code before 0.6 wrote (storedPoolPreview reads it as on unless the wheel is hidden).
  poolPreview: boolean('pool_preview'),
  vetoAllowance: integer('veto_allowance'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// A sitting of an Event on one Date (ADR 0011, #48). The Date lives here, not on the Event.
// `slotId` is the Slot the Date came from, if any: a Slot a Session refers to is no longer open.
// `previousStartsAt` is the Date the last Reopen or removal withdrew (for the notice); `icsSequence` is this
// Session's own calendar SEQUENCE. `removedAt` is set when the Host removed a Session that has, or had, a
// Date (#65): the row stays only for its notice and counts nowhere else. `startedAt` and `endedAt` (#164) are the
// Host's start and end: a Session with `startedAt` and no `endedAt` is the Running Session, at most one per Event.
export const sessions = pgTable('sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }),
  previousStartsAt: timestamp('previous_starts_at', { withTimezone: true }),
  slotId: uuid('slot_id').references(() => pollSlots.id, { onDelete: 'set null' }),
  icsSequence: integer('ics_sequence').default(0).notNull(),
  removedAt: timestamp('removed_at', { withTimezone: true }),
  startedAt: timestamp('started_at', { withTimezone: true }),
  endedAt: timestamp('ended_at', { withTimezone: true }),
}, table => [
  check('sessions_ended_after_started_check', sql`${table.endedAt} IS NULL OR ${table.startedAt} IS NOT NULL`),
  uniqueIndex('sessions_one_running_per_event_idx').on(table.eventId).where(sql`${table.startedAt} IS NOT NULL AND ${table.endedAt} IS NULL AND ${table.removedAt} IS NULL`),
])

// The teams of an Event from its first Session start on (#164): one row per team position, written once. `frozenName`
// is the Team name frozen at that start; null means the Team colour's name (also after the Host reset it). An Event
// that has not started has no rows, and its Team names are composed from the Team words.
export const eventTeams = pgTable('event_teams', {
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  frozenName: text('frozen_name'),
}, table => [
  primaryKey({ columns: [table.eventId, table.position] }),
  check('event_teams_position_check', sql`${table.position} >= 1`),
])

export const memberZone = pgEnum('member_zone', ZONES)

export const eventMembers = pgTable('event_members', {
  eventId: uuid('event_id').notNull().references(() => events.id),
  userId: uuid('user_id').notNull().references(() => users.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
  zone: memberZone('zone').default('bench').notNull(),
  /** The team position (1..team count) while the zone is `team`, else null (#160). */
  team: integer('team'),
  /** When the Member took this team seat; the latest one wins the race for a last place (#160). Null outside a team. */
  teamJoinedAt: timestamp('team_joined_at', { withTimezone: true }),
  /** The Member's contribution to their team's name: one word without whitespace, at most 12 characters (checked in code, not here: Postgres counts code points). Null outside a team (#161). */
  teamWord: text('team_word'),
}, table => [
  primaryKey({ columns: [table.eventId, table.userId] }),
  index('event_members_event_id_team_idx').on(table.eventId, table.team),
  check('event_members_team_zone_check', sql`(${table.zone} = 'team') = (${table.team} IS NOT NULL)`),
  check('event_members_team_joined_at_check', sql`(${table.team} IS NULL) = (${table.teamJoinedAt} IS NULL)`),
  check('event_members_team_word_team_check', sql`${table.teamWord} IS NULL OR ${table.team} IS NOT NULL`),
  check('event_members_team_word_form_check', sql`${table.teamWord} IS NULL OR ${table.teamWord} ~ '^\\S+$'`),
])

export const pollSlots = pgTable('poll_slots', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, table => [unique().on(table.eventId, table.startsAt)])

export const voteValue = pgEnum('vote_value', ['yes', 'maybe', 'no'])

export const pollVotes = pgTable('poll_votes', {
  slotId: uuid('slot_id').notNull().references(() => pollSlots.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  value: voteValue('value').notNull(),
  /** A short remark on the Vote, read by every Member (#102). */
  note: text('note'),
  updatedAt: updatedAt(),
}, table => [primaryKey({ columns: [table.slotId, table.userId] })])

// A game's Suitability (#171): an Event's Format stays teams or free-for-all; a game can suit more kinds of play.
export const gameSuitability = pgEnum('game_suitability', SUITABILITIES)

// The Game library (#141, brief §15): one global library that Hosts fill. Games are never deleted, so
// Events that used them keep working. `imageKey` names the image in the image store (#143); `youtubeId`
// is the clip's video id, played from `clipStart` for `clipLength` seconds.
export const games = pgTable('games', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  imageKey: text('image_key'),
  youtubeId: text('youtube_id'),
  clipStart: integer('clip_start').default(0).notNull(),
  clipLength: integer('clip_length').default(30).notNull(),
  playersMin: integer('players_min'),
  playersMax: integer('players_max'),
  /** What kind of play the game works for, any number of them (#171). Was `formats` until 0007. */
  suitabilities: gameSuitability('suitabilities').array().default(sql`'{}'`).notNull(),
  // Game notes (#223): plain text, at most GAME_NOTES_MAX characters; null = none.
  notes: text('notes'),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, table => [
  index('games_created_by_idx').on(table.createdBy),
  // Lookups by image key (#171, review S6).
  index('games_image_key_idx').on(table.imageKey),
])

export const poolKind = pgEnum('pool_kind', POOLS)

// The games of an Event's Game pool and Tiebreaker pool (#146). A game may sit in both pools.
export const eventPoolGames = pgTable('event_pool_games', {
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  gameId: uuid('game_id').notNull().references(() => games.id),
  pool: poolKind('pool').notNull(),
}, table => [
  primaryKey({ columns: [table.eventId, table.gameId, table.pool] }),
  // Lookups by game (#171, review S6).
  index('event_pool_games_game_id_idx').on(table.gameId),
])

export const activityType = pgEnum('activity_type', ACTIVITY_TYPES)

// The Activity feed (#159, GLOSSARY: Activity feed): what happened in an Event, written in the same transaction as the
// change it records (server/utils/activity.ts). `actorId` is null when the app did it. `params` holds ids, numbers and
// instants only, never a game. The feed reads one Event's entries by time, so that is the index. Entries go with their Event.
export const activity = pgTable('activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  type: activityType('type').$type<ActivityType>().notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  params: jsonb('params').$type<ActivityParams[ActivityType]>().default({}).notNull(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('activity_event_id_at_idx').on(table.eventId, table.at)])
