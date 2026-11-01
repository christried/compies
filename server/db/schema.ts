import { sql } from 'drizzle-orm'
import { boolean, check, doublePrecision, index, integer, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { ACTIVITY_TYPES, type ActivityParams, type ActivityType } from '../../shared/activity'
import { PHASES } from '../../shared/event'
import { ZONES } from '../../shared/board'
import { SUITABILITIES } from '../../shared/game'
import { COIN_SIDES, DRAW_KINDS, DRAW_OUTCOMES, DRAW_SOURCES } from '../../shared/rounds'
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
// instants only, never a game's name (ActivityParams checks it). The feed reads one Event's entries by time, so that is the index. Entries go with their Event.
export const activity = pgTable('activity', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  type: activityType('type').$type<ActivityType>().notNull(),
  actorId: uuid('actor_id').references(() => users.id),
  params: jsonb('params').$type<ActivityParams[ActivityType]>().default({}).notNull(),
  at: timestamp('at', { withTimezone: true }).defaultNow().notNull(),
}, table => [index('activity_event_id_at_idx').on(table.eventId, table.at)])

// The game round of Glücksrad (0.7, spec #218 § Schema, #228): Rounds, their draws, Vetoes, Bonus Vetoes, coin tosses and
// the Countdown. One migration (0017) adds all six tables, though #228 uses only the first two: the later tickets (#229
// spin, #231 Vetoes, #233 Bonus Vetoes, #235 coin, #236 Countdown) then need no schema change. The tables are new, so the
// code that serves during the switch-over (ADR 0007) neither reads nor writes them. Every instant a rule compares with
// "now" is written from `useClock(event).now()`, never the database's `now()`: Nuxt stamps each instant and tests move
// the clock past it (ADR 0013, amended 2026-10-31).

export const drawSource = pgEnum('draw_source', DRAW_SOURCES)
export const drawKind = pgEnum('draw_kind', DRAW_KINDS)
export const drawOutcome = pgEnum('draw_outcome', DRAW_OUTCOMES)
export const coinSide = pgEnum('coin_side', COIN_SIDES)

// One of the games an Event plays (GLOSSARY: Round). It begins with a spin or with the Host setting a game and keeps going
// through vetoed draws until no Veto stops its game. `gameId` and `setAt` are null while it is being drawn and set
// together; `setAt` is when the game was set (the end of the Veto window for a draw that had one). `putBackAt` is the Host's
// put-back: a soft removal, because Vetoes spent in a put-back Round stay spent and the history stays. 0.8 adds the
// result to this table. Only one Round per Event can be in its draw at a time (the partial unique index).
export const rounds = pgTable('rounds', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  gameId: uuid('game_id').references(() => games.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  setAt: timestamp('set_at', { withTimezone: true }),
  putBackAt: timestamp('put_back_at', { withTimezone: true }),
}, table => [
  check('rounds_set_game_check', sql`(${table.setAt} IS NULL) = (${table.gameId} IS NULL)`),
  check('rounds_put_back_after_set_check', sql`${table.putBackAt} IS NULL OR ${table.setAt} IS NOT NULL`),
  uniqueIndex('rounds_one_drawn_per_event_idx').on(table.eventId).where(sql`${table.setAt} IS NULL AND ${table.putBackAt} IS NULL`),
  // The Event read lists an Event's Rounds in start order; the image route and the feed look a Round up by its game.
  index('rounds_event_id_started_at_idx').on(table.eventId, table.startedAt),
  index('rounds_game_id_idx').on(table.gameId),
])

// A Round's draws: a spin or a set; vetoed ones stay in their Round. `source` says where the game came from (a library game
// never returns to a pool). The instants: `committedAt` (the server drew or the Host set it), `spinStartAt` (a spin only: the
// wheel starts a short lead after the commit), `stopAt` (the wheel's stop; for a set draw the commit itself; the clip starts
// here) and `vetoEndsAt` (the end of the Veto window, null when no window opens). A draw settles at the first read or write
// after its last instant: `outcome` and `settledAt` are null until then. A spin keeps what #229 needs to replay it
// identically on reload: the games of the slices in order, the placeholder labels shuffled for that spin (null on a visible
// wheel), the result index and the offset within the slice (a fraction from 0 up to 1).
export const draws = pgTable('draws', {
  id: uuid('id').defaultRandom().primaryKey(),
  roundId: uuid('round_id').notNull().references(() => rounds.id, { onDelete: 'cascade' }),
  gameId: uuid('game_id').notNull().references(() => games.id),
  source: drawSource('source').notNull(),
  kind: drawKind('kind').notNull(),
  committedAt: timestamp('committed_at', { withTimezone: true }).notNull(),
  spinStartAt: timestamp('spin_start_at', { withTimezone: true }),
  stopAt: timestamp('stop_at', { withTimezone: true }).notNull(),
  vetoEndsAt: timestamp('veto_ends_at', { withTimezone: true }),
  outcome: drawOutcome('outcome'),
  settledAt: timestamp('settled_at', { withTimezone: true }),
  sliceGameIds: uuid('slice_game_ids').array(),
  sliceLabels: text('slice_labels').array(),
  resultIndex: integer('result_index'),
  resultOffset: doublePrecision('result_offset'),
}, table => [
  check('draws_settled_check', sql`(${table.outcome} IS NULL) = (${table.settledAt} IS NULL)`),
  check('draws_instants_check', sql`${table.stopAt} >= ${table.committedAt} AND (${table.spinStartAt} IS NULL OR (${table.spinStartAt} >= ${table.committedAt} AND ${table.stopAt} >= ${table.spinStartAt})) AND (${table.vetoEndsAt} IS NULL OR ${table.vetoEndsAt} >= ${table.stopAt})`),
  // A spin has its slices and its result, a set has none of them; the result slice is the drawn game.
  check('draws_spin_check', sql`CASE WHEN ${table.kind} = 'spin' THEN ${table.spinStartAt} IS NOT NULL AND ${table.sliceGameIds} IS NOT NULL AND ${table.resultIndex} IS NOT NULL AND ${table.resultOffset} IS NOT NULL ELSE ${table.spinStartAt} IS NULL AND ${table.sliceGameIds} IS NULL AND ${table.sliceLabels} IS NULL AND ${table.resultIndex} IS NULL AND ${table.resultOffset} IS NULL END`),
  check('draws_result_check', sql`${table.kind} <> 'spin' OR (${table.resultIndex} >= 0 AND ${table.resultIndex} < cardinality(${table.sliceGameIds}) AND ${table.sliceGameIds}[${table.resultIndex} + 1] = ${table.gameId} AND (${table.sliceLabels} IS NULL OR cardinality(${table.sliceLabels}) = cardinality(${table.sliceGameIds})) AND ${table.resultOffset} >= 0 AND ${table.resultOffset} < 1)`),
  index('draws_round_id_idx').on(table.roundId),
])

// A Party's Veto on a draw (GLOSSARY: Veto): the Party is a team number, `userId` is the Player who cast it. A Party casts at
// most one per draw, which the primary key enforces in the database. Vetoes cast on a draw are used up when it settles as
// vetoed; the allowance spent is counted from these rows.
export const vetoes = pgTable('vetoes', {
  drawId: uuid('draw_id').notNull().references(() => draws.id, { onDelete: 'cascade' }),
  team: integer('team').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id),
  castAt: timestamp('cast_at', { withTimezone: true }).notNull(),
}, table => [
  primaryKey({ columns: [table.drawId, table.team] }),
  check('vetoes_team_check', sql`${table.team} >= 1`),
])

// A Veto the Host granted a Party on top of the Veto allowance (GLOSSARY: Bonus Veto), at most 9 per Party over the Event
// (checked in code under the Event lock). Nobody takes one away, so there is no undo and no update.
export const bonusVetoes = pgTable('bonus_vetoes', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  team: integer('team').notNull(),
  grantedBy: uuid('granted_by').notNull().references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull(),
}, table => [
  check('bonus_vetoes_team_check', sql`${table.team} >= 1`),
  index('bonus_vetoes_event_id_team_idx').on(table.eventId, table.team),
])

// A toss of the Coin flip (GLOSSARY: Coin flip): the server picks `side`; the toss runs from `startedAt` and lands at
// `landsAt`. The side reaches clients with the toss, but the UI and the feed show it only at the landing.
export const coinTosses = pgTable('coin_tosses', {
  id: uuid('id').defaultRandom().primaryKey(),
  eventId: uuid('event_id').notNull().references(() => events.id, { onDelete: 'cascade' }),
  side: coinSide('side').notNull(),
  tossedBy: uuid('tossed_by').notNull().references(() => users.id),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  landsAt: timestamp('lands_at', { withTimezone: true }).notNull(),
}, table => [
  check('coin_tosses_lands_after_start_check', sql`${table.landsAt} >= ${table.startedAt}`),
  index('coin_tosses_event_id_started_at_idx').on(table.eventId, table.startedAt),
])

// The Countdown (GLOSSARY: Countdown): one per Event, during a running Session; ending the Session deletes it. `durationMs`
// is what the Host set (5 s to 99:59). `remainingMs` is the time left, and `startedAt` is set while it runs: it then ends at
// `startedAt + remainingMs`; paused (no `startedAt`) it stands at `remainingMs`, and a reset sets `remainingMs` back to the
// duration.
export const countdowns = pgTable('countdowns', {
  eventId: uuid('event_id').primaryKey().references(() => events.id, { onDelete: 'cascade' }),
  durationMs: integer('duration_ms').notNull(),
  remainingMs: integer('remaining_ms').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
}, table => [
  check('countdowns_duration_check', sql`${table.durationMs} BETWEEN 5000 AND 5999000`),
  check('countdowns_remaining_check', sql`${table.remainingMs} BETWEEN 0 AND ${table.durationMs}`),
])
