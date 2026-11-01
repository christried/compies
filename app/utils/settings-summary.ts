import { hasWheel, type EventSettings, type PointsPreset, type PointsTable, type SelectionMode } from '~~/shared/settings'

// The words for an Event's settings (#144): the sentence of the Fertig screen („4 Teams à 2, Glücksrad
// (verdeckt), 6 Spiele.“) and the key/value list under it (Format, Spiele, Auswahl, Vetos, Punkte, Pool, Termin).
// Pure, with vue-i18n's `t` passed in. „Fertig“ shows both; „So wird gespielt“ (#148) shows the list, from the same rows (#225).

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

/**
 * „Glücksrad (verdeckt)“, „Glücksrad, Spiele erst am Rad“, „Host-Wahl, Spiele erst beim Setzen“, „Host-Wahl“ (#225).
 * A Hidden wheel is told apart from a Pool preview that is off: the pools are always unseen under it.
 */
export function modeText(settings: Pick<EventSettings, 'selectionMode' | 'hiddenWheel' | 'poolPreview'>, t: Translate): string {
  const mode = t(MODE_NAME[settings.selectionMode])
  if (hasWheel(settings.selectionMode) && settings.hiddenWheel) return t('stepper.summary.hidden', { mode })
  if (settings.poolPreview) return mode
  return t(hasWheel(settings.selectionMode) ? 'stepper.summary.previewOffWheel' : 'stepper.summary.previewOffPick', { mode })
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

/** One line of the summary. `settings` are the settings it shows: „So wird gespielt“ locks a row once the Event runs when any of them is fixed then (lockedWhenRunning). */
export interface SummaryRow { key: string, label: string, value: string, settings: readonly (keyof EventSettings)[] }

/**
 * The key/value list that „So wird gespielt“ and the stepper's „Fertig“ both show (#225): Format, Spiele, Auswahl, Vetos
 * with the Lucky Wheel, Punkte, then Pool and Termin when the caller has them (Fertig only).
 */
export function summaryRows(
  settings: EventSettings,
  t: Translate,
  extra: { pools?: { main: number, tiebreaker: number }, dates?: string } = {},
): SummaryRow[] {
  const rows: SummaryRow[] = [
    { key: 'format', label: t('stepper.summary.format'), value: teamsText(settings, t), settings: ['format', 'teamCount', 'teamSize'] },
    { key: 'games', label: t('stepper.summary.gamesLabel'), value: t('stepper.summary.games', { n: settings.gameCount }, settings.gameCount), settings: ['gameCount'] },
    { key: 'mode', label: t('stepper.summary.mode'), value: modeText(settings, t), settings: ['selectionMode', 'hiddenWheel', 'poolPreview'] },
  ]
  // Only the Lucky Wheel has vetoes (#145).
  if (hasWheel(settings.selectionMode)) {
    rows.push({ key: 'vetoes', label: t('stepper.summary.vetoes'), value: t('stepper.summary.vetoValue', { n: settings.vetoAllowance }), settings: ['vetoAllowance'] })
  }
  rows.push({ key: 'points', label: t('stepper.summary.points'), value: pointsText(settings.pointsTable, t), settings: ['pointsTable'] })
  if (extra.pools) rows.push({ key: 'pool', label: t('stepper.summary.pool'), value: t('stepper.summary.poolValue', extra.pools, extra.pools.main), settings: [] })
  if (extra.dates) rows.push({ key: 'dates', label: t('stepper.summary.dates'), value: extra.dates, settings: [] })
  return rows
}
