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
})

// The words of GLOSSARY.md (#175). A UI word the glossary replaces goes into RETIRED with its successor
// (docs/agents/domain.md), so neither the copy nor the changelog falls back to it.
const RETIRED: Record<string, string> = {
  'Lucky Wheel': 'Glücksrad',
  'Admin-Wahl': 'Host-Wahl',
  'Passende Formate': 'Passt zu',
}

describe('glossary words in the copy', () => {
  const byKey = new Map(entries.map(e => [e.key, e.value]))

  it.each(Object.entries(RETIRED))('never shows „%s“ (now „%s“) in the copy or the Unreleased lines', (retired) => {
    const hits = entries.filter(e => e.value.includes(retired)).map(e => e.key)
    expect(hits).toEqual([])
    expect(unreleased).not.toContain(retired)
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
