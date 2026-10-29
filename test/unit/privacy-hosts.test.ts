import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import de from '~~/i18n/locales/de.json'

// Every third party the app talks to is named in the Datenschutzerklärung: YouTube and Cloudflare R2 shipped
// in 1.3 before the text named them (#179). A new host fails here until its provider is in PROVIDERS and in
// `legal.datenschutz`; that text is the user's to approve before it merges.
const PROVIDERS: Record<string, string> = {
  'youtube.com': 'YouTube',
  'youtube-nocookie.com': 'YouTube',
  'youtu.be': 'YouTube',
  'ytimg.com': 'YouTube',
  'google.com': 'Google',
  'live.com': 'Microsoft',
  'cloudflarestorage.com': 'Cloudflare',
}

const root = resolve(import.meta.dirname, '../..')

function sourceFiles(): string[] {
  return ['app', 'server', 'shared'].flatMap(dir => readdirSync(join(root, dir), { recursive: true, encoding: 'utf8' })
    .filter(file => /\.(ts|vue)$/.test(file))
    .map(file => join(root, dir, file)))
}

// A host is written after `https://`, or after an interpolation (`${account}.r2.cloudflarestorage.com`).
// Comment lines don't count: they name hosts the app never contacts.
function hostsIn(text: string): string[] {
  const code = text.split('\n').filter(line => !/^\s*(\/\/|\*|\/\*)/.test(line)).join('\n')
  return [
    ...code.matchAll(/https?:\/\/((?:[a-z0-9-]+\.)+[a-z]{2,})/gi),
    ...code.matchAll(/\}\.((?:[a-z0-9-]+\.)+(?:com|net|org|tv|be|io|dev|me|app|de|eu))\b/gi),
  ].map(match => match[1]!.toLowerCase())
}

const siteOf = (host: string) => host.split('.').slice(-2).join('.')
const privacyText = JSON.stringify(de.legal.datenschutz)
const sites = [...new Set(sourceFiles().flatMap(file => hostsIn(readFileSync(file, 'utf8')).map(siteOf)))].sort()

describe('third parties in the privacy page', () => {
  it('finds the hosts it checks', () => {
    expect(sites).toContain('youtube-nocookie.com')
    expect(sites).toContain('cloudflarestorage.com')
  })

  it('knows the provider of every host the app contacts', () => {
    expect(sites.filter(site => !(site in PROVIDERS))).toEqual([])
  })

  it.each(sites.filter(site => site in PROVIDERS))('names the provider of %s in the Datenschutzerklärung', (site) => {
    expect(privacyText).toContain(PROVIDERS[site])
  })
})
