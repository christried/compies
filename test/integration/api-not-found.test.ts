import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import health from '../../server/api/health.get'
import unknownApi from '../../server/api/[...]'
import { createTestDb, createTestServer } from './harness'
import { signIn, stubAuthEnv } from './sign-in'

const member = { provider: 'discord', id: '2', name: 'Gast', email: 'member@example.com', image: undefined } as const

describe('unknown /api/** requests (review Spec F2)', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>
  let request: ReturnType<typeof createTestServer>

  beforeAll(async () => {
    testDb = await createTestDb()
    request = createTestServer(testDb.db, {
      'GET /api/health': health,
      'GET /api/**': unknownApi,
      'POST /api/**': unknownApi,
    })
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  beforeEach(() => {
    stubAuthEnv()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function expectJsonNotFound(response: Response) {
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toContain('application/json')
    expect(await response.json()).toMatchObject({ statusMessage: 'Not Found' })
  }

  it('answers a GET for a missing API resource with a JSON 404 when signed out', async () => {
    await expectJsonNotFound(await request('/api/does-not-exist'))
  })

  it('answers a GET for a missing API resource with the same JSON 404 when signed in', async () => {
    const { cookie } = await signIn(testDb.db, member)

    await expectJsonNotFound(await request('/api/does-not-exist', { headers: { cookie } }))
  })

  it('answers a POST to a deeper unknown API path with a JSON 404', async () => {
    await expectJsonNotFound(await request('/api/nope/deeper', { method: 'POST' }))
  })

  it('keeps answering the real routes', async () => {
    const response = await request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })
})
