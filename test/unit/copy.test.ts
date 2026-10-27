import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'

// Copy rules (06-copy § Rules for developers): the app is „Compies“ in every text, Compibert is never
// named, and the calendar is about the Date, not the file (no „.ics“ outside the legal texts and the
// calendar sheet's „Apple & andere (.ics)“, where the Member picks between Google, Outlook and the file, #81).
const offlinePage = readFileSync(resolve(import.meta.dirname, '../../public/offline.html'), 'utf8')

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

  it('writes the app name as „Compies“, not „COMPIES“, in the locale file and the offline page', () => {
    const hits = entries.filter(e => e.value.includes('COMPIES')).map(e => e.key)
    expect(hits).toEqual([])
    expect(offlinePage).not.toContain('COMPIES')
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
