import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { modeText, pointsText, settingsSentence, summaryRows, type Translate } from '../../app/utils/settings-summary'
import { defaultSettings, type EventSettings } from '../../shared/settings'

// The sentence and the key/value list that the Fertig screen (#144) and later the Event page (#148) show.

/** vue-i18n's `t` for the cases the summary needs: named values and „einzahl | mehrzahl“. */
const t: Translate = (key, named = {}, plural) => {
  const message = key.split('.').reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], de)
  if (typeof message !== 'string') throw new Error(`No copy for ${key}`)
  const forms = message.split(' | ')
  const form = forms.length > 1 ? forms[plural === 1 ? 0 : 1]! : message
  return form.replace(/\{(\w+)\}/g, (_, name: string) => String(named[name] ?? (name === 'n' ? plural : '')))
}

function settings(overrides: Partial<EventSettings> = {}): EventSettings {
  return { ...defaultSettings(), ...overrides }
}

describe('settingsSentence', () => {
  it('names the teams, the Selection mode and the Game count', () => {
    expect(settingsSentence(settings({ teamCount: 4, teamSize: 2, gameCount: 6 }), t)).toBe('4 Teams à 2, Host-Wahl, 6 Spiele.')
  })

  it('says „1 Spiel“ for one Game', () => {
    expect(settingsSentence(settings({ gameCount: 1 }), t)).toBe('2 Teams à 3, Host-Wahl, 1 Spiel.')
  })

  it('names the Glücksrad, and says when it is hidden', () => {
    expect(settingsSentence(settings({ selectionMode: 'lucky_wheel', vetoAllowance: 3 }), t)).toBe('2 Teams à 3, Glücksrad, 10 Spiele.')
    expect(settingsSentence(settings({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 }), t)).toBe('2 Teams à 3, Glücksrad (verdeckt), 10 Spiele.')
  })

  it('says when the Pool preview is off (#225)', () => {
    expect(settingsSentence(settings({ poolPreview: false }), t)).toBe('2 Teams à 3, Host-Wahl, Spiele erst beim Setzen, 10 Spiele.')
    expect(settingsSentence(settings({ selectionMode: 'lucky_wheel', vetoAllowance: 3, poolPreview: false }), t)).toBe('2 Teams à 3, Glücksrad, Spiele erst am Rad, 10 Spiele.')
  })
})

describe('pointsText', () => {
  it('shows the preset with the real values', () => {
    expect(pointsText({ preset: 'linear', values: [3, 2, 1, 0] }, t)).toBe('Linear 3 / 2 / 1 / 0')
    expect(pointsText({ preset: 'winner_takes_all', values: [3, 0, 0, 0] }, t)).toBe('Winner takes all 3 / 0 / 0 / 0')
    expect(pointsText({ preset: 'custom', values: [5, 3, 3, 0] }, t)).toBe('Eigene Tabelle 5 / 3 / 3 / 0')
  })
})

describe('modeText (#225)', () => {
  const wheel = { selectionMode: 'lucky_wheel' as const, hiddenWheel: false, poolPreview: true }

  it('names the mode while the pools are previewed', () => {
    expect(modeText(wheel, t)).toBe('Glücksrad')
    expect(modeText({ selectionMode: 'admin_pick', hiddenWheel: false, poolPreview: true }, t)).toBe('Host-Wahl')
  })

  it('says a Hidden wheel is hidden, whatever the Pool preview says', () => {
    expect(modeText({ ...wheel, hiddenWheel: true, poolPreview: false }, t)).toBe('Glücksrad (verdeckt)')
  })

  it('says when the games come up with the Pool preview off', () => {
    expect(modeText({ ...wheel, poolPreview: false }, t)).toBe('Glücksrad, Spiele erst am Rad')
    expect(modeText({ selectionMode: 'admin_pick', hiddenWheel: false, poolPreview: false }, t)).toBe('Host-Wahl, Spiele erst beim Setzen')
  })
})

describe('summaryRows', () => {
  it('lists Format, Spiele, Auswahl and Punkte for Host pick', () => {
    const rows = summaryRows(settings({ teamCount: 4, teamSize: 2, gameCount: 6, pointsTable: { preset: 'linear', values: [3, 2, 1, 0] } }), t)

    expect(rows).toEqual([
      { key: 'format', label: 'Format', value: '4 Teams à 2', settings: ['format', 'teamCount', 'teamSize'] },
      { key: 'games', label: 'Spiele', value: '6 Spiele', settings: ['gameCount'] },
      { key: 'mode', label: 'Auswahl', value: 'Host-Wahl', settings: ['selectionMode', 'hiddenWheel', 'poolPreview'] },
      { key: 'points', label: 'Punkte', value: 'Linear 3 / 2 / 1 / 0', settings: ['pointsTable'] },
    ])
  })

  it('adds the Veto allowance after the Auswahl with the Glücksrad, and only then (#145)', () => {
    const wheel = summaryRows(settings({ selectionMode: 'lucky_wheel', vetoAllowance: 2 }), t)
    expect(wheel.map(row => row.key)).toEqual(['format', 'games', 'mode', 'vetoes', 'points'])
    expect(wheel[3]).toEqual({ key: 'vetoes', label: 'Vetos', value: '2 pro Partei', settings: ['vetoAllowance'] })

    const admin = summaryRows(settings({ selectionMode: 'admin_pick', vetoAllowance: null }), t)
    expect(admin.map(row => row.key)).toEqual(['format', 'games', 'mode', 'points'])
  })

  it('tells in the Auswahl row when the Pool preview is off or the wheel is hidden', () => {
    const modeOf = (overrides: Partial<EventSettings>) => summaryRows(settings(overrides), t).find(row => row.key === 'mode')?.value
    expect(modeOf({ selectionMode: 'lucky_wheel', vetoAllowance: 3, poolPreview: false })).toBe('Glücksrad, Spiele erst am Rad')
    expect(modeOf({ poolPreview: false })).toBe('Host-Wahl, Spiele erst beim Setzen')
    expect(modeOf({ selectionMode: 'lucky_wheel', vetoAllowance: 3, hiddenWheel: true, poolPreview: false })).toBe('Glücksrad (verdeckt)')
  })

  it('says „1 Spiel“ for one Game', () => {
    expect(summaryRows(settings({ gameCount: 1 }), t)[1]).toMatchObject({ key: 'games', value: '1 Spiel' })
  })

  it('says „1 Spiel“ for a pool of one game', () => {
    const rows = summaryRows(settings(), t, { pools: { main: 1, tiebreaker: 0 } })

    expect(rows.at(-1)).toEqual({ key: 'pool', label: 'Pool', value: '1 Spiel, Tiebreaker 0', settings: [] })
  })

  it('adds the Game pool and the Date, which show no setting, when it is given them', () => {
    const rows = summaryRows(settings(), t, { pools: { main: 9, tiebreaker: 3 }, dates: 'Umfrage, 4 Vorschläge' })

    expect(rows.slice(-2)).toEqual([
      { key: 'pool', label: 'Pool', value: '9 Spiele, Tiebreaker 3', settings: [] },
      { key: 'dates', label: 'Termin', value: 'Umfrage, 4 Vorschläge', settings: [] },
    ])
  })
})
