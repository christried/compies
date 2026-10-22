import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import health from '../../server/api/health.get'
import { createTestDb, createTestServer } from './harness'

describe('GET /api/health', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>

  beforeAll(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  it('reports ok when the migrated database answers', async () => {
    const request = createTestServer(testDb.db, { 'GET /api/health': health })

    const response = await request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('reports 503 when the database does not answer', async () => {
    const unreachable = await createTestDb()
    await unreachable.client.close()
    const request = createTestServer(unreachable.db, { 'GET /api/health': health })

    const response = await request('/api/health')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'error' })
  })
})
