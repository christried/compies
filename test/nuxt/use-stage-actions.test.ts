import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { createError, readBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'
import { useStageActions } from '~/composables/useStageActions'

// The Host's and the Players' changes on the stage (#257, B3): each one posts to its path, and a refused one shows the
// shared error copy. The page holds no request string; these paths are the server's. Each test gets its own slug:
// registerEndpoint keeps the first handler for a path.

let testNumber = 0

/** The endpoints of the twelve changes for one slug, what they received, and whether they refuse. */
function serve() {
  testNumber += 1
  const slug = `stage-actions-${testNumber}`
  const server = { calls: [] as string[], bodies: [] as unknown[], refuse: false }
  const endpoints: [string, 'POST' | 'DELETE' | 'PUT'][] = [
    ['rounds/round-1/result', 'PUT'],
    ['draws/draw-1/veto', 'POST'],
    ['clip/skip', 'POST'],
    ['rounds/round-1', 'DELETE'],
    ['rounds/spin', 'POST'],
    ['coin', 'POST'],
    ['ceremony', 'POST'],
    ['countdown/pause', 'POST'],
    ['sessions/end', 'POST'],
    ['sessions/session-1/reopen', 'POST'],
    ['sessions/session-1', 'DELETE'],
    ['finish', 'POST'],
  ]
  for (const [path, method] of endpoints) {
    registerEndpoint(`/api/e/${slug}/${path}`, {
      method,
      handler: async (event) => {
        if (method === 'PUT' || path === 'finish') server.bodies.push(await readBody(event))
        server.calls.push(`${method} ${path}`)
        if (server.refuse) throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
        return {}
      },
    })
  }
  return { slug, server }
}

function shownToasts() {
  return useState<{ text: string, tone: string }[]>('toasts').value
}

/** The composable for one test, mounted in a component; `refresh` is a spy the page's refetch stands for. */
async function setUp() {
  const { slug, server } = serve()
  const refresh = vi.fn()
  let actions: ReturnType<typeof useStageActions> | undefined
  await mountSuspended(defineComponent({
    setup() {
      actions = useStageActions(slug, refresh)
      return () => h('div')
    },
  }))
  return { server, refresh, actions: () => actions! }
}

beforeEach(() => {
  useState('toasts').value = []
})

describe('useStageActions', () => {
  it.each([
    ['castVeto', (actions: ReturnType<typeof useStageActions>) => actions.castVeto('draw-1'), 'POST draws/draw-1/veto'],
    ['skipClip', (actions: ReturnType<typeof useStageActions>) => actions.skipClip(), 'POST clip/skip'],
    ['putBackRound', (actions: ReturnType<typeof useStageActions>) => actions.putBackRound('round-1'), 'DELETE rounds/round-1'],
    ['spin', (actions: ReturnType<typeof useStageActions>) => actions.spin(), 'POST rounds/spin'],
    ['toss', (actions: ReturnType<typeof useStageActions>) => actions.toss(), 'POST coin'],
    ['startCeremony', (actions: ReturnType<typeof useStageActions>) => actions.startCeremony(), 'POST ceremony'],
    ['countdown', (actions: ReturnType<typeof useStageActions>) => actions.countdown('pause'), 'POST countdown/pause'],
    ['endSession', (actions: ReturnType<typeof useStageActions>) => actions.endSession(), 'POST sessions/end'],
    ['reopenSession', (actions: ReturnType<typeof useStageActions>) => actions.reopenSession('session-1'), 'POST sessions/session-1/reopen'],
    ['enterResult', (actions: ReturnType<typeof useStageActions>) => actions.enterResult('round-1', [{ team: 1, place: 1, score: null }]), 'PUT rounds/round-1/result'],
    ['removeSession', (actions: ReturnType<typeof useStageActions>) => actions.removeSession('session-1'), 'DELETE sessions/session-1'],
  ])('%s posts its request, resolves true and refetches the Event', async (_name, call, sent) => {
    const { server, refresh, actions } = await setUp()

    await expect(call(actions())).resolves.toBe(true)

    expect(server.calls).toEqual([sent])
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(shownToasts()).toEqual([])
  })

  it('sends the Places of a Result as the body (#273)', async () => {
    const { server, actions } = await setUp()
    const places = [{ team: 2, place: 1, score: '16' }, { team: 1, place: 2, score: null }]

    await expect(actions().enterResult('round-1', places)).resolves.toBe(true)

    expect(server.bodies).toEqual([{ places }])
  })

  it('sends the outcome and the winners the Host saw as the body of the finish (#277)', async () => {
    const { server, refresh, actions } = await setUp()

    await expect(actions().finish({ outcome: 'winner', winners: [2] })).resolves.toBe(true)

    expect(server.calls).toEqual(['POST finish'])
    expect(server.bodies).toEqual([{ outcome: 'winner', winners: [2] }])
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('resolves false, shows the error copy and still refetches the Event when the server refuses', async () => {
    const { server, refresh, actions } = await setUp()
    server.refuse = true

    await expect(actions().spin()).resolves.toBe(false)

    expect(shownToasts()).toEqual([expect.objectContaining({ tone: 'error', text: 'Langsam, langsam. Versuch es in ein paar Sekunden.' })])
    expect(refresh).toHaveBeenCalledTimes(1)
  })
})
