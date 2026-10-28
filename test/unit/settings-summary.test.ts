import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'
import { pointsText, settingsSentence, summaryRows, type Translate } from '../../app/utils/settings-summary'
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
    expect(settingsSentence(settings({ teamCount: 4, teamSize: 2, gameCount: 6 }), t)).toBe('4 Teams à 2, Admin-Wahl, 6 Spiele.')
  })

  it('says „1 Spiel“ for one Game', () => {
    expect(settingsSentence(settings({ gameCount: 1 }), t)).toBe('2 Teams à 3, Admin-Wahl, 1 Spiel.')
  })

  it('names the Lucky Wheel, and says when it is hidden', () => {
    expect(settingsSentence(settings({ selectionMode: 'lucky_wheel', vetoAllowance: 3 }), t)).toBe('2 Teams à 3, Lucky Wheel, 10 Spiele.')
    expect(settingsSentence(settings({ selectionMode: 'lucky_wheel', hiddenWheel: true, vetoAllowance: 3 }), t)).toBe('2 Teams à 3, Lucky Wheel (verdeckt), 10 Spiele.')
  })
})

describe('pointsText', () => {
  it('shows the preset with the real values', () => {
    expect(pointsText({ preset: 'linear', values: [3, 2, 1, 0] }, t)).toBe('Linear 3 / 2 / 1 / 0')
    expect(pointsText({ preset: 'winner_takes_all', values: [3, 0, 0, 0] }, t)).toBe('Winner takes all 3 / 0 / 0 / 0')
    expect(pointsText({ preset: 'custom', values: [5, 3, 3, 0] }, t)).toBe('Eigene Tabelle 5 / 3 / 3 / 0')
  })
})

describe('summaryRows', () => {
  it('lists Format, Spiele, Punkte and Modus', () => {
    const rows = summaryRows(settings({ teamCount: 4, teamSize: 2, gameCount: 6, pointsTable: { preset: 'linear', values: [3, 2, 1, 0] } }), t)

    expect(rows).toEqual([
      { key: 'format', label: 'Format', value: '4 Teams à 2' },
      { key: 'games', label: 'Spiele', value: '6' },
      { key: 'points', label: 'Punkte', value: 'Linear 3 / 2 / 1 / 0' },
      { key: 'mode', label: 'Modus', value: 'Admin-Wahl' },
    ])
  })

  it('adds the Veto allowance after the mode with the Lucky Wheel, and only then (#145)', () => {
    const wheel = summaryRows(settings({ selectionMode: 'lucky_wheel', vetoAllowance: 2 }), t)
    expect(wheel.map(row => row.key)).toEqual(['format', 'games', 'points', 'mode', 'vetoes'])
    expect(wheel[4]).toEqual({ key: 'vetoes', label: 'Vetos', value: '2 pro Partei' })

    const admin = summaryRows(settings({ selectionMode: 'admin_pick', vetoAllowance: null }), t)
    expect(admin.map(row => row.key)).toEqual(['format', 'games', 'points', 'mode'])
  })

  it('adds the Game pool and the Date when it is given them', () => {
    const rows = summaryRows(settings(), t, { pools: { main: 9, tiebreaker: 3 }, dates: 'Umfrage, 4 Vorschläge' })

    expect(rows.slice(-2)).toEqual([
      { key: 'pool', label: 'Pool', value: '9 Spiele, Tiebreaker 3' },
      { key: 'dates', label: 'Termin', value: 'Umfrage, 4 Vorschläge' },
    ])
  })
})
