import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { ROOM_CALL_SIGNATURE_HEADER, ROOM_CALL_TIMESTAMP_HEADER, verifyRoomCall } from '../../shared/room-auth'

// The game-day guard script of the Worker deploy (#157): what the workflow sees is its exit code and what it prints.
// It runs as the workflow runs it, a Node process, against a local stand-in for the app's deploy-check endpoint.
const script = fileURLToPath(new URL('../../realtime/scripts/deploy-check.mjs', import.meta.url))

describe('realtime/scripts/deploy-check.mjs', () => {
  let server: Server | undefined

  afterEach(async () => {
    await new Promise(resolve => server ? server.close(resolve) : resolve(undefined))
    server = undefined
  })

  /** An app that answers `answer` to a call signed with `secret`, and 401 to anything else. */
  async function app(secret: string, answer: { ok: boolean, reason: string | null }) {
    server = createServer(async (request, response) => {
      const signed = request.method === 'GET' && request.url === '/api/internal/deploy-check' && await verifyRoomCall({
        body: '',
        timestamp: request.headers[ROOM_CALL_TIMESTAMP_HEADER] as string | undefined ?? null,
        signature: request.headers[ROOM_CALL_SIGNATURE_HEADER] as string | undefined ?? null,
        secrets: [secret],
        now: Date.now(),
      })
      response.writeHead(signed ? 200 : 401, { 'content-type': 'application/json' })
      response.end(JSON.stringify(signed ? answer : { statusMessage: 'Unauthorized' }))
    })
    await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve))
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/internal/deploy-check`
  }

  function run(env: Record<string, string>) {
    return new Promise<{ code: number | null, output: string }>((resolve) => {
      const child = spawn(process.execPath, [script], { env: { PATH: process.env.PATH, ...env } })
      let output = ''
      child.stdout.on('data', chunk => output += chunk)
      child.stderr.on('data', chunk => output += chunk)
      child.on('close', code => resolve({ code, output }))
    })
  }

  it('exits 0 when the app says a deploy may go ahead', async () => {
    const url = await app('internal-secret', { ok: true, reason: null })

    const result = await run({ DEPLOY_CHECK_URL: url, ROOM_INTERNAL_SECRET: 'internal-secret' })

    expect(result.code).toBe(0)
  })

  it('exits 1 and prints the reason on a game day', async () => {
    const url = await app('internal-secret', { ok: false, reason: 'Today is a game day: 1 Session is dated today.' })

    const result = await run({ DEPLOY_CHECK_URL: url, ROOM_INTERNAL_SECRET: 'internal-secret' })

    expect(result.code).toBe(1)
    expect(result.output).toContain('Today is a game day: 1 Session is dated today.')
  })

  it('exits 1 when the app refuses the signature', async () => {
    const url = await app('internal-secret', { ok: true, reason: null })

    const result = await run({ DEPLOY_CHECK_URL: url, ROOM_INTERNAL_SECRET: 'another-secret' })

    expect(result.code).toBe(1)
    expect(result.output).toContain('401')
  })

  it('exits 1 when the app cannot be reached', async () => {
    const url = await app('internal-secret', { ok: true, reason: null })
    await new Promise(resolve => server!.close(resolve))

    const result = await run({ DEPLOY_CHECK_URL: url, ROOM_INTERNAL_SECRET: 'internal-secret' })

    expect(result.code).toBe(1)
  })

  it('exits 1 when there is no secret to sign with', async () => {
    const result = await run({ ROOM_INTERNAL_SECRET: '' })

    expect(result.code).toBe(1)
    expect(result.output).toContain('ROOM_INTERNAL_SECRET')
  })
})
