import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Smoke test against the production build: run `pnpm test:build` (builds first).
const PUBLIC = resolve(import.meta.dirname, '../../.output/public')
const read = (file: string) => readFileSync(resolve(PUBLIC, file), 'utf8')

describe('PWA build', () => {
  it('emits the web manifest with the app icons', () => {
    const manifest = JSON.parse(read('manifest.webmanifest'))

    expect(manifest).toMatchObject({ name: 'Compies', display: 'standalone', start_url: '/', lang: 'de' })
    const icons = manifest.icons.map((icon: { src: string, purpose: string }) => `${icon.src} ${icon.purpose}`)
    expect(icons).toEqual(expect.arrayContaining(['/icons/icon-192.png any', '/icons/icon-512.png any', '/icons/icon-maskable-512.png maskable']))
    for (const icon of manifest.icons) expect(existsSync(resolve(PUBLIC, `.${icon.src}`))).toBe(true)
  })

  it('names the production build Compies and keeps the staging icons out of its manifest (#178)', () => {
    const manifest = JSON.parse(read('manifest.webmanifest'))

    expect(manifest).toMatchObject({ name: 'Compies', short_name: 'Compies' })
    const srcs: string[] = manifest.icons.map((icon: { src: string }) => icon.src)
    expect(srcs.filter(src => src.startsWith('/icons/staging/'))).toEqual([])
  })

  it('emits a service worker that precaches the offline page and falls back to it', () => {
    const sw = read('sw.js')

    expect(sw).toMatch(/url:\s*"offline\.html"/)
    expect(sw).toContain('/offline.html')
    expect(existsSync(resolve(PUBLIC, 'offline.html'))).toBe(true)
  })

  it('never caches API responses or the build manifest, and sends no push', () => {
    const sw = read('sw.js')

    expect(sw).not.toMatch(/\/api/)
    expect(sw).not.toMatch(/_nuxt\/builds/)
    expect(sw).not.toMatch(/CacheFirst|StaleWhileRevalidate|NetworkFirst/)
    expect(sw).not.toMatch(/addEventListener\(\s*["']push["']/)
  })
})
