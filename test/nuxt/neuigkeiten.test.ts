import { mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import NeuigkeitenPage from '~/pages/neuigkeiten.vue'
import { signInAs } from './auth'

// A fixture changelog instead of the real CHANGELOG.md, so the assertions don't move with every Release.
const { fixture } = vi.hoisted(() => ({
  fixture: `# Changelog

## [Unreleased]

### Neu

- Spielbrett mit Teams.

## [1.2.0] - 2026-11-02 – Mehr Termine

Mehr Platz in der Terminumfrage.

### Neu

- Bis zu **16 Termine** pro Terminumfrage. ([#65](https://github.com/christried/compies/issues/65), [#66](https://github.com/christried/compies/issues/66))
  - Siehe \`MAX_SLOTS\`.

### Behoben

- Der Hinweis bleibt (siehe [Hilfe](https://example.com/hilfe)).

## [1.1.0] - 2026-10-24 – Feinschliff

### Geändert

- Ein „Nein“ ist jetzt rot.
`,
}))

vi.mock('~/utils/changelog', async (importOriginal) => {
  const { parseChangelog } = await import('~~/shared/changelog')
  return { ...await importOriginal<object>(), RELEASES: parseChangelog(fixture).releases }
})

describe('Neuigkeiten', () => {
  beforeEach(() => signInAs(null))

  it('shows every Release newest first, and never [Unreleased]', async () => {
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })

    expect(page.get('h1').text()).toBe('Neuigkeiten')
    expect(page.findAll('main section').map(s => s.attributes('id'))).toEqual(['1.2.0', '1.1.0'])
    expect(page.findAll('h2').map(h => h.text())).toEqual([
      expect.stringMatching(/Version 1\.2\.0.*Mehr Termine/),
      expect.stringMatching(/Version 1\.1\.0.*Feinschliff/),
    ])
    expect(page.text()).not.toContain('Spielbrett')
    expect(page.text()).not.toContain('Unreleased')
  })

  it('opens signed out, without sending the visitor to sign-in', async () => {
    await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })

    expect(useRoute().path).toBe('/neuigkeiten')
  })

  it('shows a Release with its German date, intro and groups', async () => {
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })
    const release = page.get('section[id="1.2.0"]')

    expect(release.get('time').attributes('datetime')).toBe('2026-11-02')
    expect(release.get('time').text()).toBe('2. Nov. 2026')
    expect(release.get('p').text()).toBe('Mehr Platz in der Terminumfrage.')
    expect(release.findAll('h3').map(h => h.text())).toEqual(['Neu', 'Behoben'])
  })

  it('renders bold, code, a nested item, links to a new tab and Issue chips without parentheses', async () => {
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })
    const item = page.get('section[id="1.2.0"] ul > li')

    expect(item.get('strong').text()).toBe('16 Termine')
    expect(item.get('ul li code').text()).toBe('MAX_SLOTS')
    expect(item.get('div').text()).toMatch(/^Bis zu 16 Termine pro Terminumfrage\. #65, #66\s*Siehe MAX_SLOTS\.$/)
    const issue = item.get('a[href="https://github.com/christried/compies/issues/65"]')
    expect(issue.attributes('aria-label')).toBe('Issue 65 auf GitHub, öffnet in neuem Tab')
    expect(issue.attributes('target')).toBe('_blank')
    expect(issue.attributes('rel')).toBe('noopener noreferrer')

    // Parentheses around ordinary text stay.
    const fixed = page.findAll('section[id="1.2.0"] ul > li').at(-1)!
    expect(fixed.text()).toBe('Der Hinweis bleibt (siehe Hilfe).')
    expect(fixed.get('a').attributes()).toMatchObject({ href: 'https://example.com/hilfe', target: '_blank', title: 'Öffnet in neuem Tab' })
  })

  it('marks only the newest Release „Neu“', async () => {
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })

    expect(page.get('section[id="1.2.0"] article').text()).toContain('Neu')
    expect(page.get('section[id="1.1.0"] article > div:nth-child(2)').text()).not.toContain('Neu')
  })

  it('copies the link to a Release and says so', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })

    await page.get('button[aria-label="Link zu Version 1.1.0 kopieren"]').trigger('click')

    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/neuigkeiten#1.1.0`)
    await vi.waitFor(() => expect(useToast().toasts.value.map(toast => toast.text)).toContain('Link kopiert'))
    vi.unstubAllGlobals()
  })

  it('jumps from the rail to a Release and marks it as the one in view', async () => {
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten', attachTo: document.body })
    const rail = page.findAll('nav[aria-label="Versionen"]').find(nav => nav.text().startsWith('Versionen'))!
    const [newest, older] = [rail.get('a[href="#1.2.0"]'), rail.get('a[href="#1.1.0"]')]
    expect(newest.attributes('aria-label')).toBe('Version 1.2.0, Mehr Termine, 2. Nov. 2026, neu')
    expect(older.attributes('aria-label')).toBe('Version 1.1.0, Feinschliff, 24. Okt. 2026')

    for (const [link, other, heading] of [[older, newest, 'v-1-1-0'], [newest, older, 'v-1-2-0']] as const) {
      await link.trigger('click')

      expect(link.attributes('aria-current')).toBe('true')
      expect(other.attributes('aria-current')).toBeUndefined()
      expect(document.activeElement?.id).toBe(heading)
      expect(window.location.hash).toBe(link.attributes('href'))
    }
    page.unmount()
  })

  it('ends with the legal links, Neuigkeiten marked as the current page, and the version label', async () => {
    const page = await mountSuspended(NeuigkeitenPage, { route: '/neuigkeiten' })
    const footer = page.get('footer')

    expect(footer.findAll('a').map(a => a.text())).toEqual(['Impressum', 'Datenschutz', 'Neuigkeiten', 'v1.2.0'])
    expect(footer.get('a[href="/neuigkeiten"][aria-current="page"]').text()).toBe('Neuigkeiten')
    expect(footer.get('a[aria-label="Version 1.2.0, zu den Neuigkeiten"]').text()).toBe('v1.2.0')
  })
})
