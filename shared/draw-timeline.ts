// STUB (#414): the Draw's timeline, written red-first. Replaced by the real module in the next commit.
import type { Instant } from './instant'

export interface DrawInstants { spinStartAt: Date | null, stopAt: Date, vetoEndsAt: Date | null }
export interface NewDraw { kind: 'spin' | 'set', commitAt: Instant, windowOpens: boolean }

const todo = (): never => { throw new Error('not implemented') }

export function drawInstants(_draw: NewDraw): DrawInstants { return todo() }
export function drawGameKnown(_args: { isHost: boolean, draw: { stopAt: Instant }, now: Instant }): boolean { return todo() }
export function windowOpen(_draw: { stopAt: Instant, vetoEndsAt: Instant | null }, _now: Instant): boolean { return todo() }
export function windowEnded(_draw: { vetoEndsAt: Instant | null }, _now: Instant): boolean { return todo() }
export function vetoesSealed(_draw: { vetoEndsAt: Instant | null }, _now: Instant): boolean { return todo() }
export function settleAt(_draw: { stopAt: Instant, vetoEndsAt: Instant | null }): Date { return todo() }
/** @public */
export function isDue(_draw: { stopAt: Instant, vetoEndsAt: Instant | null, outcome: string | null }, _now: Instant): boolean { return todo() }
export function windowFraction(_draw: { stopAt: Instant, vetoEndsAt: Instant | null }, _now: Instant): number { return todo() }
export function clipWindow(_draw: { stopAt: Instant }, _game: { clipLength: number }): { startAt: number, endsAt: number } { return todo() }
export function clipRunning(_clip: { startAt: Instant, endsAt: Instant }, _now: Instant): boolean { return todo() }
