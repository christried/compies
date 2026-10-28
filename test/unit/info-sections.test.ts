import { describe, expect, it } from 'vitest'
import { INFO_SECTIONS, INFO_TOPICS } from '../../app/utils/info-sections'
import de from '~~/i18n/locales/de.json'

// InfoSheet shows what the table lists, so a typo in de.json must fail here instead of silently dropping a section (D6).

function textAt(path: string): unknown {
  return path.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown> | undefined)?.[key], de)
}

describe('INFO_SECTIONS', () => {
  it.each(INFO_TOPICS)('has the heading and every paragraph of „%s“ in de.json', (topic) => {
    expect(INFO_SECTIONS[topic].length).toBeGreaterThan(0)
    for (const { section, parts } of INFO_SECTIONS[topic]) {
      expect(textAt(`setup.info.sections.${section}`), `heading of ${section}`).toEqual(expect.any(String))
      for (const part of parts) {
        expect(textAt(`setup.info.${topic}.${part}`), `${topic}.${part}`).toEqual(expect.any(String))
      }
    }
  })
})
