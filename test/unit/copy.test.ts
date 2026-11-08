import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'

// Copy rules (06-copy § Rules for developers): the app is „Compies“ in every text, Compibert is never
// named, and the calendar is about the Date, not the file (no „.ics“ outside the legal texts and the
// calendar sheet's „Apple & andere (.ics)“, where the Member picks between Google, Outlook and the file, #81).
const offlinePage = readFileSync(resolve(import.meta.dirname, '../../public/offline.html'), 'utf8')
const changelog = readFileSync(resolve(import.meta.dirname, '../../CHANGELOG.md'), 'utf8')
const unreleased = changelog.split(/^## /m).find(section => section.startsWith('[Unreleased]')) ?? ''

type Entry = { key: string, value: string }

function collect(node: unknown, path: string[] = []): Entry[] {
  if (typeof node === 'string') return [{ key: path.join('.'), value: node }]
  if (node && typeof node === 'object') {
    return Object.entries(node).flatMap(([k, v]) => collect(v, [...path, k]))
  }
  return []
}

const entries = collect(de)
const isLegal = (key: string) => key.startsWith('legal.')

describe('copy rules', () => {
  it('never names Compibert in the locale file or the offline page', () => {
    const hits = entries.filter(e => /compibert/i.test(e.value)).map(e => e.key)
    expect(hits).toEqual([])
    expect(offlinePage).not.toMatch(/compibert/i)
  })

  it('writes the app name as „Compies“, not „COMPIES“, in the locale file, the offline page and the Unreleased lines', () => {
    const hits = entries.filter(e => e.value.includes('COMPIES')).map(e => e.key)
    expect(hits).toEqual([])
    expect(offlinePage).not.toContain('COMPIES')
    expect(unreleased).not.toContain('COMPIES')
  })

  it('keeps „.ics“ out of UI copy, except the legal texts and the calendar sheet’s file button', () => {
    const calendarFile = ['mvp.calendar.file', 'mvp.calendar.fileAll']
    const hits = entries.filter(e => !isLegal(e.key) && !calendarFile.includes(e.key) && e.value.includes('.ics')).map(e => e.key)
    expect(hits).toEqual([])
  })

  it('calls the middle vote option Meh everywhere, never „Wenn nötig“', () => {
    const hits = entries.filter(e => /wenn nötig/i.test(e.value)).map(e => e.key)
    expect(hits).toEqual([])
  })

  it('names no design cookie while the app is light only', () => {
    const hits = entries.filter(e => /nuxt-color-mode|design-cookie/i.test(e.value)).map(e => e.key)
    expect(hits).toEqual([])
  })

  it('ships the offline page light only, whatever the system uses', () => {
    expect(offlinePage).not.toMatch(/prefers-color-scheme:\s*dark/)
  })

  // The contact address (#221): the only email address in the copy is the operator's contact address on
  // christried.me. The vue-i18n escape `{'@'}` is normalised first; addresses are found by pattern.
  it('names compies@christried.me as the only email address in the legal texts, in the Impressum and in § 1 of the Datenschutzerklärung', () => {
    const address = 'compies@christried.me'
    const normalise = (text: string) => text.replace(/\{'@'\}/g, '@')
    const addressesIn = (text: string) => [...new Set(normalise(text).match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g) ?? [])]
    const legalText = entries.filter(e => isLegal(e.key)).map(e => e.value).join('\n')
    const valueOf = (key: string) => entries.find(e => e.key === key)?.value ?? ''

    expect(addressesIn(legalText)).toEqual([address])
    expect(addressesIn(entries.map(e => e.value).join('\n'))).toEqual([address])
    expect(normalise(valueOf('legal.impressum.contact.text'))).toContain(address)
    expect(normalise(valueOf('legal.datenschutz.controller.text'))).toContain(address)
  })
})

// A number in the copy that can be 1 needs a singular form (#268): „1 Spiele auf dem Rad“ reached staging in 0.7 (#263).
// A placeholder followed by one of the plural nouns below makes a message counted, and a counted message carries its forms
// as „singular | plural“. vue-i18n picks the form by the named `count` or `n` (either wins over a plural argument), so the
// count before the noun is called `n`. A `{max}` is a limit constant, never 1. NEVER_ONE holds the counted messages whose
// count can't be 1, each with its reason.
const PLURAL_NOUNS = ['Bonus-Vetos', 'Leute', 'Minuten', 'Plätze', 'Plätzen', 'Punkte', 'Sekunden', 'Sessions', 'Spiele', 'Spielen', 'Stimmen', 'Stunden', 'Tage', 'Tagen', 'Teams', 'Termine', 'Terminen', 'Vetos', 'Vorschläge']
const NEVER_ONE: Record<string, string> = {
  'dock.startDialog.lock': 'teams is at least TEAM_COUNT_MIN (2)',
  'stepper.format.total': 'teams is at least TEAM_COUNT_MIN (2), so players is too',
  'stepper.points.head': 'n is the team count, at least TEAM_COUNT_MIN (2)',
  'stepper.summary.teams': 'n is the team count, at least TEAM_COUNT_MIN (2)',
  'board.meta.open': 'places is the team count times the team size, at least 2',
  'mvp.home.datesStanding': 'the Home card shows it only for an Event with several Sessions',
  'archive.meta': 'no caller yet: its two counts need two messages once the archive shows it',
  'share.image.people': 'the Share image says „1 Person“ (share.image.person) for one Player and this text from two (#313)',
}

describe('counted copy', () => {
  const counted = entries.filter(e => [...e.value.matchAll(/\{(\w+)\}\s+([\wÄÖÜäöüß-]+)/g)]
    .some(([, name, noun]) => name !== 'max' && PLURAL_NOUNS.includes(noun ?? '')))

  it('gives every counted message a singular form, unless its count is never 1', () => {
    const hits = counted.filter(e => !e.value.includes('|') && !(e.key in NEVER_ONE)).map(e => e.key)
    expect(hits).toEqual([])
  })

  it('keeps NEVER_ONE to counted messages without a singular form', () => {
    const stale = Object.keys(NEVER_ONE).filter(key => !counted.some(e => e.key === key && !e.value.includes('|')))
    expect(stale).toEqual([])
  })
})

// The words of GLOSSARY.md (#175). A UI word the glossary replaces goes into RETIRED with its successor
// (docs/agents/domain.md), so neither the copy nor the changelog falls back to it.
const RETIRED: Record<string, string> = {
  'Lucky Wheel': 'Glücksrad',
  'Admin-Wahl': 'Host-Wahl',
  'Passende Formate': 'Passt zu',
  'Tiebreaker': 'Unentschieden',
}

// The changelog lines that announce a removal name the removed feature by its old word, so they are the one place a retired word may stay: the
// lines of the issues that removed it, found by the link they end with (#279 took out the Tiebreaker pool, #280 its mention in the privacy text).
const REMOVAL_ISSUES: Record<string, string[]> = {
  Tiebreaker: ['279', '280'],
}

describe('glossary words in the copy', () => {
  const byKey = new Map(entries.map(e => [e.key, e.value]))

  it.each(Object.entries(RETIRED))('never shows „%s“ (now „%s“) in the copy or the Unreleased lines', (retired) => {
    const hits = entries.filter(e => e.value.includes(retired)).map(e => e.key)
    expect(hits).toEqual([])
    const removals = REMOVAL_ISSUES[retired] ?? []
    const lines = unreleased.split('\n').filter(line => line.includes(retired) && !removals.some(issue => line.endsWith(`/issues/${issue}))`)))
    expect(lines).toEqual([])
  })

  it('calls the whole Event an Event in the stepper, the name step and the Fertig screen, never a Session', () => {
    const keys = [
      'stepper.heading',
      'stepper.create',
      'stepper.done.title',
      'stepper.steps.name.title',
      'stepper.name.label',
      'setup.step',
      'error.nameRequired',
    ]
    for (const key of keys) expect(byKey.get(key), key).not.toMatch(/Session/)
  })

  it('finds the Unreleased section it checks', () => {
    expect(unreleased).not.toBe('')
  })
})
