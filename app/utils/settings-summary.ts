import { hasWheel, type EventSettings, type PointsPreset, type PointsTable, type SelectionMode } from '~~/shared/settings'

// The words for an Event's settings (#144): the sentence of the Fertig screen („4 Teams à 2, Glücksrad
// (verdeckt), 6 Spiele.“) and the key/value list under it (Format, Spiele, Punkte, Modus, Vetos, Pool, Termin).
// Pure, with vue-i18n's `t` passed in. The Fertig screen and the Event page (#148) show both.

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

const MODE_NAME: Record<SelectionMode, string> = {
  lucky_wheel: 'setup.mode.wheel.name',
  admin_pick: 'setup.mode.admin.name',
  pick_ban: 'setup.mode.pickBan.name',
  losers_pick: 'setup.mode.loserPick.name',
  losers_advantage: 'setup.mode.loserAdv.name',
}

const PRESET_NAME: Record<PointsPreset, string> = {
  linear: 'setup.points.linear.name',
  winner_takes_all: 'setup.points.wta.name',
  custom: 'setup.points.custom.name',
}

/** „4 Teams à 2“. */
export function teamsText(settings: Pick<EventSettings, 'teamCount' | 'teamSize'>, t: Translate): string {
  return t('stepper.summary.teams', { n: settings.teamCount, s: settings.teamSize })
}

/** „Glücksrad (verdeckt)“, „Host-Wahl“. */
export function modeText(settings: Pick<EventSettings, 'selectionMode' | 'hiddenWheel'>, t: Translate): string {
  const mode = t(MODE_NAME[settings.selectionMode])
  return hasWheel(settings.selectionMode) && settings.hiddenWheel ? t('stepper.summary.hidden', { mode }) : mode
}

/** „Linear 3 / 2 / 1 / 0“: the preset with the values it really has. */
export function pointsText(table: PointsTable, t: Translate): string {
  return t('stepper.summary.pointsValue', { preset: t(PRESET_NAME[table.preset]), values: table.values.join(' / ') })
}

/** „4 Teams à 2, Glücksrad (verdeckt), 6 Spiele.“ */
export function settingsSentence(settings: EventSettings, t: Translate): string {
  return t('stepper.summary.sentence', {
    teams: teamsText(settings, t),
    mode: modeText(settings, t),
    games: t('stepper.summary.games', { n: settings.gameCount }, settings.gameCount),
  })
}

export interface SummaryRow { key: string, label: string, value: string }

/** The key/value list: Format, Spiele, Punkte, Modus, Vetos with the Lucky Wheel, then Pool and Termin when the caller has them. */
export function summaryRows(
  settings: EventSettings,
  t: Translate,
  extra: { pools?: { main: number, tiebreaker: number }, dates?: string } = {},
): SummaryRow[] {
  const rows: SummaryRow[] = [
    { key: 'format', label: t('stepper.summary.format'), value: teamsText(settings, t) },
    { key: 'games', label: t('stepper.summary.gamesLabel'), value: String(settings.gameCount) },
    { key: 'points', label: t('stepper.summary.points'), value: pointsText(settings.pointsTable, t) },
    { key: 'mode', label: t('stepper.summary.mode'), value: modeText(settings, t) },
  ]
  // Only the Lucky Wheel has vetoes (#145).
  if (hasWheel(settings.selectionMode)) {
    rows.push({ key: 'vetoes', label: t('stepper.summary.vetoes'), value: t('stepper.summary.vetoValue', { n: settings.vetoAllowance }) })
  }
  if (extra.pools) rows.push({ key: 'pool', label: t('stepper.summary.pool'), value: t('stepper.summary.poolValue', extra.pools, extra.pools.main) })
  if (extra.dates) rows.push({ key: 'dates', label: t('stepper.summary.dates'), value: extra.dates })
  return rows
}
