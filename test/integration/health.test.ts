import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestApp } from './app'
import { createTestDb } from './harness'

describe('GET /api/health', () => {
  let testDb: Awaited<ReturnType<typeof createTestDb>>

  beforeAll(async () => {
    testDb = await createTestDb()
  })

  afterAll(async () => {
    await testDb.client.close()
  })

  it('reports ok when the migrated database answers', async () => {
    const request = createTestApp(testDb.db)

    const response = await request('/api/health')

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok' })
  })

  it('reports 503 when the database does not answer', async () => {
    // Booting a second PGlite with the migrations can pass the 5 s default when the whole suite runs in parallel.
    const unreachable = await createTestDb()
    await unreachable.client.close()
    const request = createTestApp(unreachable.db)

    const response = await request('/api/health')

    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ status: 'error' })
  }, 30_000)
})
