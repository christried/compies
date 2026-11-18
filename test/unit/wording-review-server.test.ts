import type { Server } from 'node:http'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { answerMono, answersFileName, answerText, answerUnused, emptyAnswers, serializeAnswers } from '../../scripts/wording/answers.mjs'
import { flattenMessages } from '../../scripts/wording/messages.mjs'
import { RETIRED } from '../../scripts/wording/retired-words.mjs'
import { isNewSince, progressOf, stepsOf } from '../../scripts/wording/review-model.mjs'
import { chooseAnswersFile, createReviewServer } from '../../scripts/wording/review-server.mjs'

// What the operator's review page asks of its server (#631, spec #620 § The review page): the state it shows, the answer it saves,
// the files it serves and the requests it refuses. Over real HTTP on port 0, in a temp folder per test with a small recording, a tiny
// locale and invented copy; prior art test/unit/answers-file.test.ts. The page itself is checked by using it (the ticket's evidence).
const locale = {
  common: { save: 'Speichern' },
  home: { title: 'Deine Events', hello: 'Hallo {name}' },
  vote: { count: '{n} Stimme | {n} Stimmen' },
  wheel: { old: 'Altes Rad' },
  legal: { impressum: { title: 'Impressum' } },
}
const messages = flattenMessages(locale)

function seeing(seq: number, picture = `pictures/${seq}.jpg`) {
  return {
    seq,
    state: 'home',
    account: 'host' as const,
    width: 1440,
    box: { x: 10, y: 10, width: 100, height: 20 },
    picture,
    rendered: 'x',
    via: 'text' as const,
    marks: [] as ('mono' | 'sr-only')[],
  }
}
const recording = {
  version: 1 as const,
  recordedAt: '2026-11-20T10:00:00.000Z',
  commit: 'abc1234',
  // Walk order: common.save (twice), then home.hello, a mono element, then the fixed text.
  messages: [
    { key: 'common.save', sightings: [seeing(1), seeing(3)] },
    { key: 'home.hello', sightings: [seeing(2)] },
  ],
  monoElements: [{ component: 'app/components/Clock.vue', what: 'Uhr', sightings: [{ ...seeing(4), marks: ['mono' as const] }] }],
  fixed: [{ id: 'offline.title', text: 'Du bist offline', file: 'public/offline.html', line: 5, sightings: [] }],
  locations: {},
}
const unused = { groups: [{ group: 'wheel', keys: [{ key: 'wheel.old', text: 'Altes Rad' }] }] }

let root: string
let recordingDir: string
let answersPath: string
let localePath: string
let rulesPath: string
const servers: Server[] = []

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'compies-wording-review-'))
  recordingDir = join(root, 'wording')
  mkdirSync(join(recordingDir, 'pictures'), { recursive: true })
  writeFileSync(join(recordingDir, 'recording.json'), JSON.stringify(recording))
  writeFileSync(join(recordingDir, 'unused.json'), JSON.stringify(unused))
  writeFileSync(join(recordingDir, 'pictures', '1.jpg'), 'jpeg one')
  writeFileSync(join(recordingDir, 'pictures', '3.jpg'), 'jpeg three')
  localePath = join(root, 'de.json')
  writeFileSync(localePath, JSON.stringify(locale))
  rulesPath = join(root, '06-copy.md')
  writeFileSync(rulesPath, '# Copy\n\nTone: friendly, clear. Du-form.\n\n## Voice\n\nSomething else.\n\n## Rules for developers\n\n- Use t() for every text.\n- No middot.\n\n## Other\n\nNot this.\n')
  mkdirSync(join(root, 'reviews'))
  answersPath = join(root, 'reviews', 'wording_2026-11-20.json')
})

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise(done => server.close(done))))
  rmSync(root, { recursive: true, force: true })
})

async function start(overrides: Partial<{ recordingDir: string, answersPath: string }> = {}) {
  const server: Server = await createReviewServer({ recordingDir, answersPath, localePath, rulesPath, ...overrides })
  await new Promise<void>(listening => server.listen(0, '127.0.0.1', listening))
  servers.push(server)
  const port = (server.address() as { port: number }).port
  const base = `http://127.0.0.1:${port}`
  return {
    server,
    port,
    base,
    state: async () => (await fetch(`${base}/api/state`)).json(),
    post: (body: unknown) => fetch(`${base}/api/answer`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
  }
}

const onDisk = () => readFileSync(answersPath, 'utf8')
const swept = (text: string, patch: Record<string, unknown> = {}) => ({ text, answer: null, replacement: null, comment: '', alternatives: [], ...patch })
const expectedFile = (build: (file: ReturnType<typeof emptyAnswers>) => ReturnType<typeof emptyAnswers>) => serializeAnswers(build(emptyAnswers('2026-11-20')))

describe('GET /api/state', () => {
  it('carries the steps of the model, the rules, the retired words and the recording', async () => {
    const { state } = await start()
    const got = await state()
    const expected = stepsOf({ messages, recording, unused })
    expect(got.steps).toEqual(expected.steps)
    expect(got.problems).toEqual(expected.problems)
    expect(got.rules.tone).toBe('Tone: friendly, clear. Du-form.')
    expect(got.rules.developers).toContain('Use t() for every text.')
    expect(got.rules.developers).not.toContain('Something else.')
    expect(got.rules.developers).not.toContain('Not this.')
    expect(got.retired).toEqual(RETIRED)
    expect(got.hasUnused).toBe(true)
    expect(got.recording).toEqual({ recordedAt: recording.recordedAt, commit: recording.commit })
    expect(got.answers).toEqual(emptyAnswers('2026-11-20'))
    expect(got.answersName).toBe('wording_2026-11-20.json')
  })

  it('is not stored by the browser', async () => {
    const { base } = await start()
    expect((await fetch(`${base}/api/state`)).headers.get('cache-control')).toBe('no-store')
  })

  it('has no unused steps when unused.json is missing', async () => {
    rmSync(join(recordingDir, 'unused.json'))
    const { state } = await start()
    const got = await state()
    expect(got.hasUnused).toBe(false)
    expect(got.steps.some((step: { kind: string }) => step.kind === 'unused')).toBe(false)
  })
})

describe('starting', () => {
  it('rejects without a recording and says how to make one', async () => {
    rmSync(join(recordingDir, 'recording.json'))
    const failure = await createReviewServer({ recordingDir, answersPath, localePath, rulesPath }).catch((error: Error) => error)
    expect(failure).toBeInstanceOf(Error)
    expect((failure as Error).message).toContain('walk.mjs')
    expect((failure as Error).message).toContain('serve.mjs start')
  })

  it('rejects a recording that fails its check, with at most ten of the problems', async () => {
    writeFileSync(join(recordingDir, 'recording.json'), JSON.stringify({ ...recording, version: 2, messages: 'nope', fixed: 'nope' }))
    const failure = await createReviewServer({ recordingDir, answersPath, localePath, rulesPath }).catch((error: Error) => error)
    expect((failure as Error).message).toContain('version: muss 1 sein')
    expect((failure as Error).message).toContain('messages: keine Liste')
  })

  it('rejects a broken answers file and leaves it as it is', async () => {
    writeFileSync(answersPath, '{ not json')
    const failure = await createReviewServer({ recordingDir, answersPath, localePath, rulesPath }).catch((error: Error) => error)
    expect((failure as Error).message).toContain('Kein gültiges JSON')
    expect(onDisk()).toBe('{ not json')
  })
})

describe('POST /api/answer', () => {
  it('writes „passt“ with the message of de.json, not the body\'s text', async () => {
    const { post } = await start()
    const response = await post({ id: 'common.save', answer: 'passt', text: 'Gefälscht' })
    expect(response.status).toBe(200)
    const expected = expectedFile(file => answerText(file, 'common.save', { text: 'Speichern', answer: 'passt' }))
    expect(onDisk()).toBe(expected)
    expect((await response.json()).answers.texts['common.save']).toEqual(swept('Speichern', { answer: 'passt' }))
  })

  it('creates docs/reviews when the folder is missing', async () => {
    const answers = join(root, 'new', 'deeper', 'wording_2026-11-20.json')
    const { post } = await start({ answersPath: answers })
    expect((await post({ id: 'common.save', answer: 'passt' })).status).toBe(200)
    expect(existsSync(answers)).toBe(true)
  })

  it('stores a valid replacement', async () => {
    const { post } = await start()
    const response = await post({ id: 'home.hello', answer: 'ersetzt', replacement: 'Moin {name}' })
    expect(response.status).toBe(200)
    expect(onDisk()).toBe(expectedFile(file => answerText(file, 'home.hello', { text: 'Hallo {name}', answer: 'ersetzt', replacement: 'Moin {name}' })))
  })

  it('refuses a replacement that drops a placeholder, says why and writes nothing', async () => {
    const { post } = await start()
    const response = await post({ id: 'home.hello', answer: 'ersetzt', replacement: 'Moin' })
    expect(response.status).toBe(422)
    const body = await response.json()
    expect(body.refusals).toEqual([{ code: 'placeholder-dropped', reason: '{name} fehlt' }])
    expect(existsSync(answersPath)).toBe(false)
  })

  it('leaves the bytes of an existing file alone when it refuses', async () => {
    const { post } = await start()
    await post({ id: 'common.save', answer: 'passt' })
    const before = onDisk()
    expect((await post({ id: 'home.hello', answer: 'ersetzt', replacement: 'Moin' })).status).toBe(422)
    expect(onDisk()).toBe(before)
  })

  it('saves a replacement with a straight quote and hands back the warning', async () => {
    const { post } = await start()
    const response = await post({ id: 'home.title', answer: 'ersetzt', replacement: 'Deine "Events"' })
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.warnings.map((warning: { code: string }) => warning.code)).toContain('straight-quote')
    expect(onDisk()).toBe(expectedFile(file => answerText(file, 'home.title', { text: 'Deine Events', answer: 'ersetzt', replacement: 'Deine "Events"' })))
  })

  it('takes a replacement equal to the message for „passt“', async () => {
    const { post } = await start()
    await post({ id: 'home.title', answer: 'ersetzt', replacement: 'Deine Events' })
    expect(onDisk()).toBe(expectedFile(file => answerText(file, 'home.title', { text: 'Deine Events', answer: 'passt' })))
  })

  it('drops the replacement when „Alternativen bitte“ follows „ersetzt“', async () => {
    const { post } = await start()
    await post({ id: 'home.hello', answer: 'ersetzt', replacement: 'Moin {name}' })
    await post({ id: 'home.hello', answer: 'alternativen' })
    expect(onDisk()).toBe(expectedFile(file => answerText(file, 'home.hello', { text: 'Hallo {name}', answer: 'alternativen' })))
  })

  it('leaves the step open after a comment alone, and a later „passt“ keeps the comment', async () => {
    const { post, state } = await start()
    await post({ id: 'common.save', comment: 'Schrift zu klein' })
    let got = await state()
    expect(got.answers.texts['common.save']).toEqual(swept('Speichern', { comment: 'Schrift zu klein' }))
    expect(progressOf(got.steps, got.answers).done).toBe(0)
    await post({ id: 'common.save', answer: 'passt' })
    got = await state()
    expect(got.answers.texts['common.save']).toEqual(swept('Speichern', { answer: 'passt', comment: 'Schrift zu klein' }))
    expect(progressOf(got.steps, got.answers).done).toBe(1)
  })

  it('answers a fixed text under its own section', async () => {
    const { post } = await start()
    await post({ id: 'fixed:offline.title', answer: 'passt' })
    const file = emptyAnswers('2026-11-20')
    expect(onDisk()).toBe(serializeAnswers(answerText(file, 'fixed:offline.title', { text: 'Du bist offline', answer: 'passt' })))
  })

  it('makes a mono step answered by an empty comment („gesehen“)', async () => {
    const { post, state } = await start()
    expect((await post({ id: 'mono:app/components/Clock.vue', comment: '' })).status).toBe(200)
    expect(onDisk()).toBe(expectedFile(file => answerMono(file, 'app/components/Clock.vue', '')))
    const got = await state()
    expect(progressOf(got.steps, got.answers).done).toBe(1)
  })

  it('stores „löschen“ of an unused step under its group', async () => {
    const { post } = await start()
    expect((await post({ id: 'unused:wheel', answer: 'loeschen' })).status).toBe(200)
    expect(onDisk()).toBe(expectedFile(file => answerUnused(file, 'wheel', 'loeschen')))
  })

  it('refuses a comment on an unused step', async () => {
    const { post } = await start()
    expect((await post({ id: 'unused:wheel', comment: 'hm' })).status).toBe(400)
    expect(existsSync(answersPath)).toBe(false)
  })

  it('answers 404 to an id no step has, and writes nothing', async () => {
    const { post } = await start()
    expect((await post({ id: 'nope.nothing', answer: 'passt' })).status).toBe(404)
    expect(existsSync(answersPath)).toBe(false)
  })

  it('answers 400 to a body of the wrong shape', async () => {
    const { post } = await start()
    expect((await post({ id: 'common.save', answer: 'vielleicht' })).status).toBe(400)
    expect((await post({ id: 'common.save', answer: 'ersetzt' })).status).toBe(400)
    expect((await post({ id: 'common.save' })).status).toBe(400)
    expect((await post({ answer: 'passt' })).status).toBe(400)
    expect((await post({ id: 'mono:app/components/Clock.vue', answer: 'passt' })).status).toBe(400)
    expect(existsSync(answersPath)).toBe(false)
  })

  it('stamps a new answer with the message of today and keeps the text of an old one on a comment', async () => {
    const { post } = await start()
    writeFileSync(answersPath, expectedFile(file => answerText(file, 'common.save', { text: 'Sichern', answer: 'passt' })))
    await post({ id: 'common.save', comment: 'hm' })
    expect(JSON.parse(onDisk()).texts['common.save'].text).toBe('Sichern')
    await post({ id: 'common.save', answer: 'passt' })
    expect(JSON.parse(onDisk()).texts['common.save'].text).toBe('Speichern')
  })

  it('refuses with 409 while the file on disk has an entry it cannot read, names it and writes nothing (#631)', async () => {
    const broken = JSON.parse(expectedFile(file => answerText(file, 'common.save', { text: 'Speichern', answer: 'passt' })))
    broken.texts['home.hello'] = { text: 'Hallo {name}', answer: 'vielleicht', replacement: null, comment: 'meine Notiz', alternatives: [] }
    writeFileSync(answersPath, `${JSON.stringify(broken, null, 2)}\n`)
    const before = onDisk()
    const { post, state } = await start()
    const response = await post({ id: 'home.hello', answer: 'passt' })
    expect(response.status).toBe(409)
    expect((await response.json()).problems).toEqual([expect.stringContaining('texts.home.hello')])
    // The entry the reader cannot parse is still in the file, with its comment.
    expect(onDisk()).toBe(before)
    expect((await state()).answerProblems).toEqual([expect.stringContaining('texts.home.hello')])
  })

  it('saves again once the entry problem is fixed by hand', async () => {
    writeFileSync(answersPath, `${JSON.stringify({ ...JSON.parse(expectedFile(file => file)), texts: { 'home.hello': { text: 5 } } })}\n`)
    const { post } = await start()
    expect((await post({ id: 'common.save', answer: 'passt' })).status).toBe(409)
    writeFileSync(answersPath, expectedFile(file => file))
    expect((await post({ id: 'common.save', answer: 'passt' })).status).toBe(200)
  })

  it('keeps a key no step has', async () => {
    writeFileSync(answersPath, expectedFile(file => answerText(file, 'gone.key', { text: 'Weg', answer: 'passt' })))
    const { post } = await start()
    await post({ id: 'common.save', answer: 'passt' })
    expect(JSON.parse(onDisk()).texts['gone.key']).toEqual(swept('Weg', { answer: 'passt' }))
  })

  it('never writes anything a picture shows', async () => {
    const { post } = await start()
    await post({ id: 'common.save', answer: 'passt' })
    await post({ id: 'mono:app/components/Clock.vue', comment: '' })
    expect(onDisk()).not.toMatch(/rendered|account|host|pictures/)
  })
})

describe('resume', () => {
  it('returns the stored answers from a second server over the same files, the first open step after the answered ones', async () => {
    const first = await start()
    const steps = (await first.state()).steps as { id: string }[]
    await first.post({ id: steps[0]!.id, answer: 'passt' })
    await first.post({ id: steps[1]!.id, answer: 'passt' })
    await new Promise(done => first.server.close(done))
    servers.pop()
    const second = await start()
    const got = await second.state()
    expect(got.answers.texts[steps[0]!.id]).toBeDefined()
    expect(progressOf(got.steps, got.answers)).toMatchObject({ done: 2, firstOpen: 2 })
  })
})

describe('the answers file', () => {
  it('is the newest wording_*.json that has an open step, else a new one for today', async () => {
    const names = ['wording_2026-01-01.json', 'wording_2026-02-01.json', 'review_0.10.md']
    const steps = stepsOf({ messages, recording, unused }).steps
    const open = emptyAnswers('2026-02-01')
    const done = steps.reduce((file, step) => (step.kind === 'message' || step.kind === 'fixed') ? answerText(file, step.id, { text: step.text ?? '', answer: 'passt' }) : step.kind === 'mono' ? answerMono(file, step.id.slice(5), '') : answerUnused(file, step.group, 'behalten'), emptyAnswers('2026-02-01'))
    expect(chooseAnswersFile([], steps, () => null)).toBe(answersFileName(new Date()))
    expect(chooseAnswersFile(names, steps, () => open)).toBe('wording_2026-02-01.json')
    expect(chooseAnswersFile(names, steps, () => done)).toBe(answersFileName(new Date()))
    expect(chooseAnswersFile(names, steps, () => null)).toBe('wording_2026-02-01.json')
  })

  it('is chosen by the server from the folder of its answers path when none is named', async () => {
    writeFileSync(join(root, 'reviews', 'wording_2026-02-01.json'), serializeAnswers(emptyAnswers('2026-02-01')))
    const server: Server = await createReviewServer({ recordingDir, answersPath: undefined, answersDir: join(root, 'reviews'), localePath, rulesPath } as Parameters<typeof createReviewServer>[0])
    servers.push(server)
    expect((server as Server & { info: { answersName: string } }).info.answersName).toBe('wording_2026-02-01.json')
  })

  it('has the older file beside it as the baseline, never the file being filled', async () => {
    writeFileSync(join(root, 'reviews', 'wording_2026-01-01.json'), expectedFile(file => answerText(file, 'common.save', { text: 'Speichern', answer: 'passt' })))
    const { state, post } = await start()
    let got = await state()
    expect(got.baselineName).toBe('wording_2026-01-01.json')
    expect(got.baseline.texts['common.save']).toBeDefined()
    await post({ id: 'common.save', answer: 'passt' })
    got = await state()
    expect(got.baselineName).toBe('wording_2026-01-01.json')
  })

  describe('a new sweep (--new, #620)', () => {
    const older = 'wording_2026-01-01.json'
    // An older sweep that still has open steps: without --new it would be resumed for good.
    const writeOlder = () => writeFileSync(join(root, 'reviews', older), expectedFile(file => answerText(file, 'common.save', { text: 'Speichern', answer: 'passt' })))
    const startNew = async (trackedAnswers: (dir: string) => string[] | null) => {
      const server: Server = await createReviewServer({ recordingDir, newSweep: true, answersDir: join(root, 'reviews'), localePath, rulesPath, trackedAnswers } as Parameters<typeof createReviewServer>[0])
      servers.push(server)
      await new Promise<void>(listening => server.listen(0, '127.0.0.1', listening))
      const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
      return { info: (server as Server & { info: { answersName: string, baselineName: string | null } }).info, state: async () => (await fetch(`${base}/api/state`)).json() }
    }

    it('fills today\'s file whatever an older open file holds, with the older file as the baseline', async () => {
      writeOlder()
      const { info, state } = await startNew(() => [older])
      expect(info.answersName).toBe(answersFileName(new Date()))
      expect(info.baselineName).toBe(older)
      const got = await state()
      const step = (got.steps as { id: string, kind: string, text: string }[]).find(candidate => candidate.id === 'common.save')!
      // The key the older sweep holds unchanged is not new; one it does not hold is.
      expect(isNewSince(step as Parameters<typeof isNewSince>[0], got.baseline)).toBe(false)
      expect(isNewSince(got.steps.find((candidate: { id: string }) => candidate.id === 'home.hello'), got.baseline)).toBe(true)
    })

    it('resumes today\'s file when it already exists', async () => {
      writeOlder()
      const today = join(root, 'reviews', answersFileName(new Date()))
      writeFileSync(today, expectedFile(file => answerText(file, 'home.hello', { text: 'Hallo {name}', answer: 'passt' })))
      const { info, state } = await startNew(() => [older, answersFileName(new Date())])
      expect(info.answersName).toBe(answersFileName(new Date()))
      expect((await state()).answers.texts['home.hello']).toBeDefined()
    })

    it('takes only the files git tracks as the baseline, so an uncommitted file is no earlier sweep', async () => {
      writeOlder()
      writeFileSync(join(root, 'reviews', 'wording_2026-03-01.json'), serializeAnswers(emptyAnswers('2026-03-01')))
      const { info } = await startNew(() => [older])
      expect(info.baselineName).toBe(older)
    })

    it('takes every file of the folder when git cannot say', async () => {
      writeOlder()
      writeFileSync(join(root, 'reviews', 'wording_2026-03-01.json'), serializeAnswers(emptyAnswers('2026-03-01')))
      const { info } = await startNew(() => null)
      expect(info.baselineName).toBe('wording_2026-03-01.json')
    })
  })

  it('has no baseline when there is no other file', async () => {
    const { state } = await start()
    const got = await state()
    expect(got.baseline).toBeNull()
    expect(got.baselineName).toBeNull()
  })
})

describe('files', () => {
  it('serves the page, its script and its style', async () => {
    const { base } = await start()
    for (const [path, type] of [['/', 'text/html'], ['/page.mjs', 'text/javascript'], ['/page.css', 'text/css']] as const) {
      const response = await fetch(`${base}${path}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain(type)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
    expect(await (await fetch(`${base}/page.mjs`)).text()).toContain('compies-wording-review')
  })

  it('serves a listed picture and nothing else from the recording', async () => {
    const { base } = await start()
    const picture = await fetch(`${base}/pictures/1.jpg`)
    expect(picture.status).toBe(200)
    expect(picture.headers.get('content-type')).toBe('image/jpeg')
    expect(await picture.text()).toBe('jpeg one')
    for (const path of ['/pictures/..%2Frecording.json', '/pictures/..%5Crecording.json', '/pictures/x.png', '/pictures/99.jpg', '/pictures/', '/recording.json', '/unused.json']) {
      expect((await fetch(`${base}${path}`)).status, path).toBe(404)
    }
  })

  it('serves the six modules the page imports and no other script', async () => {
    const { base } = await start()
    for (const name of ['answers', 'review-model', 'check-replacement', 'messages', 'retired-words', 'review-keys']) {
      const response = await fetch(`${base}/modules/${name}.mjs`)
      expect(response.status, name).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/javascript')
    }
    expect((await fetch(`${base}/modules/walk.mjs`)).status).toBe(404)
    expect((await fetch(`${base}/modules/..%2Freview-server.mjs`)).status).toBe(404)
  })
})

describe('guards', () => {
  function withHost(port: number, host: string, path = '/api/state') {
    return new Promise<number>((done, fail) => {
      const req = request({ host: '127.0.0.1', port, path, headers: { host } }, (response) => {
        response.resume()
        done(response.statusCode ?? 0)
      })
      req.on('error', fail)
      req.end()
    })
  }

  it('refuses a Host header that is not the loopback address (DNS rebinding)', async () => {
    const { port } = await start()
    expect(await withHost(port, 'example.test')).toBe(403)
    expect(await withHost(port, `example.test:${port}`)).toBe(403)
    expect(await withHost(port, `127.0.0.1:${port}`)).toBe(200)
    expect(await withHost(port, `localhost:${port}`)).toBe(200)
  })

  it('refuses a POST that is not JSON', async () => {
    const { base } = await start()
    const response = await fetch(`${base}/api/answer`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ id: 'common.save', answer: 'passt' }) })
    expect(response.status).toBe(415)
    expect(existsSync(answersPath)).toBe(false)
  })

  it('refuses a body over 64 KB', async () => {
    const { post } = await start()
    expect((await post({ id: 'common.save', comment: 'x'.repeat(70_000) })).status).toBe(413)
    expect(existsSync(answersPath)).toBe(false)
  })
})
