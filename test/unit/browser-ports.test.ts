import { describe, expect, it } from 'vitest'
import { originOf, portsOf, profileOf, serversOf, slotOf } from '../../scripts/browser/ports.mjs'

// scripts/browser/ports.mjs is the one place that spells a port of the browser scripts (#567, spec #554). Slot 1 is the
// checks' and must stay what it was before slots existed; slot 2 is an implementer's, every port 100 higher.
const SLOT_1 = { app: 3000, realtime: 8787, prod: 3001, inspector: 9229, chrome: { host: 9311, member: 9312, admin: 9313 } }
const leaves = (ports: ReturnType<typeof portsOf>) => [ports.app, ports.realtime, ports.prod, ports.inspector, ports.chrome.host, ports.chrome.member, ports.chrome.admin]

describe('slotOf', () => {
  it('is slot 1 when COMPIES_SLOT is unset or empty', () => {
    expect(slotOf({})).toBe(1)
    expect(slotOf({ COMPIES_SLOT: '' })).toBe(1)
  })

  it('reads 1 and 2', () => {
    expect(slotOf({ COMPIES_SLOT: '1' })).toBe(1)
    expect(slotOf({ COMPIES_SLOT: '2' })).toBe(2)
  })

  it.each(['0', '3', 'abc', '2.5', ' 2'])('throws for %j, naming the variable and the value', (value) => {
    expect(() => slotOf({ COMPIES_SLOT: value })).toThrow(`COMPIES_SLOT must be 1 or 2, got "${value}"`)
  })
})

describe('portsOf', () => {
  it('slot 1 is exactly the ports the scripts had before slots', () => {
    expect(portsOf(1)).toEqual(SLOT_1)
  })

  it('slot 2 is every port of slot 1 plus 100', () => {
    expect(leaves(portsOf(2))).toEqual(leaves(portsOf(1)).map(port => port + 100))
    expect(portsOf(2)).toEqual({ app: 3100, realtime: 8887, prod: 3101, inspector: 9329, chrome: { host: 9411, member: 9412, admin: 9413 } })
  })

  it('has no collisions within a slot or between the slots', () => {
    const one = leaves(portsOf(1))
    const two = leaves(portsOf(2))
    expect(new Set(one).size).toBe(7)
    expect(new Set(two).size).toBe(7)
    expect(new Set([...one, ...two]).size).toBe(14)
  })
})

describe('originOf', () => {
  it('names the slot\'s localhost origin', () => {
    expect(originOf(1, 'app')).toBe('http://localhost:3000')
    expect(originOf(2, 'app')).toBe('http://localhost:3100')
    expect(originOf(2, 'prod')).toBe('http://localhost:3101')
    expect(originOf(2, 'realtime')).toBe('http://localhost:8887')
  })
})

describe('serversOf', () => {
  it('slot 1 is the server table the script had before slots, character for character', () => {
    expect(serversOf(1)).toEqual({
      dev: { port: 3000, log: 'dev.log', command: 'pnpm dev', notBuilding: true },
      realtime: { port: 8787, log: 'rt.log', command: 'pnpm --dir realtime dev --var "ALLOWED_ORIGINS:http://localhost:3000,http://localhost:3001"' },
      prod: { port: 3001, log: 'prod.log', command: null, args: ['--env-file=.env', '.output/server/index.mjs'], env: { PORT: '3001' }, needs: '.output/server/index.mjs' },
    })
    const { dev, realtime, prod } = serversOf(1)
    expect(dev).not.toHaveProperty('env')
    expect(realtime).not.toHaveProperty('env')
    for (const server of [dev, realtime, prod]) {
      expect(server.command ?? '').not.toContain('--port')
      expect(server.command ?? '').not.toContain('--inspector-port')
    }
  })

  it.each([1, 2] as const)('slot %i starts the Worker with the origins of that slot\'s app and production server', (slot) => {
    const command = serversOf(slot).realtime.command ?? ''
    const value = command.slice(command.indexOf('ALLOWED_ORIGINS:') + 'ALLOWED_ORIGINS:'.length).replace(/"$/, '')
    expect(value.split(',')).toEqual([originOf(slot, 'app'), originOf(slot, 'prod')])
    if (slot === 2) {
      expect(command).not.toContain(':3000')
      expect(command).not.toContain(':3001')
      expect(command).toContain('--port 8887')
      expect(command).toContain('--inspector-port 9329')
    }
  })

  it('slot 2 lets the app reach the slot\'s Worker and Better Auth trust the slot\'s origin', () => {
    const { dev, prod } = serversOf(2)
    expect(dev.env?.REALTIME_URL).toBe(originOf(2, 'realtime'))
    expect(prod.env?.REALTIME_URL).toBe(originOf(2, 'realtime'))
    expect(dev.command).toMatch(/ --port 3100$/)
    expect(prod.env?.PORT).toBe('3101')
    expect(dev.env?.BETTER_AUTH_URL).toBe('http://localhost:3100')
    expect(prod.env?.BETTER_AUTH_URL).toBe('http://localhost:3101')
  })

  it('slot 1 sets neither REALTIME_URL nor BETTER_AUTH_URL', () => {
    for (const server of Object.values(serversOf(1))) {
      expect(server.env ?? {}).not.toHaveProperty('REALTIME_URL')
      expect(server.env ?? {}).not.toHaveProperty('BETTER_AUTH_URL')
    }
  })
})

describe('profileOf', () => {
  it('keeps slot 1\'s Chrome profile folders and gives slot 2 its own', () => {
    expect(profileOf(1, 'host')).toBe('profile-host')
    expect(profileOf(2, 'host')).toBe('profile-host-slot2')
    const accounts = ['host', 'member', 'admin']
    const one = accounts.map(account => profileOf(1, account))
    const two = accounts.map(account => profileOf(2, account))
    expect(two.some(name => one.includes(name))).toBe(false)
    expect(new Set(two).size).toBe(3)
  })
})
