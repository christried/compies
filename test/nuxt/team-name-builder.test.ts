import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { readBody } from 'h3'
import { afterEach, describe, expect, it } from 'vitest'
import GameBoard from '~/components/GameBoard.vue'
import type { Place } from '~~/shared/board'
import type { BoardTeam, MemberView } from '~~/shared/event'
import { defaultSettings, type EventSettings } from '~~/shared/settings'
import { kitty } from './auth'
import { LARSI, SANNE, clickButton, dialog, shownToasts } from './event-page'

// Team names on the Game board (#161, 02-components § TeamNameBuilder, App Lobby 09 „Teamwahl offen + Teamwort“): the
// Player's own field in their team's header area, the composed name, its live region, and the Host's reset.
const settings: EventSettings = { ...defaultSettings(), teamCount: 2, teamSize: 3 }
const team = (n: number): Place => ({ zone: 'team', team: n })

function member(id: string, name: string, place: Place, teamWord: string | null = null, isHost = false): MemberView {
  return { id, name, image: null, isHost, zone: place.zone, team: place.zone === 'team' ? place.team : null, teamWord }
}

const teamsNamed = (first: string | null, second: string | null = null): BoardTeam[] => [
  { position: 1, name: first, frozen: false },
  { position: 2, name: second, frozen: false },
]

const noRoom = { on: () => () => undefined }
let testNumber = 0

interface Options {
  members: MemberView[]
  teams?: BoardTeam[]
  viewerId?: string
  isHost?: boolean
}

/** A board for one test, with endpoints that record the Team words and the resets posted. */
async function mountBoard(options: Options) {
  testNumber += 1
  const slug = `names-${testNumber}`
  const words: unknown[] = []
  const resets: number[] = []
  registerEndpoint(`/api/e/${slug}/team-word`, {
    method: 'POST',
    handler: async (event) => {
      const { word } = await readBody(event) as { word: string }
      words.push(word)
      return { team: 1, word: word === '' ? null : word }
    },
  })
  for (const position of [1, 2]) {
    registerEndpoint(`/api/e/${slug}/teams/${position}/reset-name`, {
      method: 'POST',
      handler: () => {
        resets.push(position)
        return { team: position }
      },
    })
  }
  const page = await mountSuspended(GameBoard, {
    props: {
      slug,
      members: options.members,
      teams: options.teams ?? teamsNamed(null),
      settings,
      teamChoiceOpen: true,
      viewerId: options.viewerId ?? kitty.id,
      isHost: options.isHost ?? false,
      room: noRoom,
    },
  })
  return { page, words, resets }
}

type Board = Awaited<ReturnType<typeof mountBoard>>['page']

const settle = () => new Promise(resolve => setTimeout(resolve))
const zone = (page: Board, label: string) => page.get(`[role="group"][aria-label^="${label}"]`)
const field = (page: Board, label: string) => zone(page, label).find<HTMLInputElement>('input')
const type = async (input: { setValue: (value: string) => Promise<void> }, value: string) => input.setValue(value)

describe('Team names on the Game board', () => {
  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('shows the colour name in the team header until the team has a name', async () => {
    const { page } = await mountBoard({ members: [member(kitty.id, 'Kitty', team(1)), member(LARSI, 'Larsi', team(1))] })
    expect(zone(page, 'Team Rot').text()).toContain('Team Rot')
    expect(zone(page, 'Team Rot').text()).not.toContain('Wilde')
  })

  it('shows the composed name in the header, in the toasts and in the people\'s labels', async () => {
    const members = [member(kitty.id, 'Kitty', team(1), 'Wilde'), member(LARSI, 'Larsi', team(1), 'Gurken')]
    const { page } = await mountBoard({ members, teams: teamsNamed('Wilde Gurken') })
    expect(page.get('[role="group"][aria-label^="Wilde Gurken"]').text()).toContain('Wilde Gurken')
    expect(page.get('[data-user-id]').attributes('aria-label')).toContain('Wilde Gurken')
  })

  it('shows a Player\'s word as a small chip under their avatar', async () => {
    const members = [member(kitty.id, 'Kitty', team(1), 'Wilde'), member(LARSI, 'Larsi', team(1))]
    const { page } = await mountBoard({ members, teams: teamsNamed('Wilde') })
    expect(page.get(`[data-user-id="${kitty.id}"]`).text()).toContain('Wilde')
    expect(page.get(`[data-user-id="${LARSI}"]`).text()).not.toContain('Wilde')
  })

  it('gives a Player in a team an empty field labelled „Dein Wort“ with the counter', async () => {
    const { page } = await mountBoard({ members: [member(kitty.id, 'Kitty', team(1))] })
    const input = field(page, 'Team Rot')
    expect(zone(page, 'Team Rot').text()).toContain('Dein Wort für den Teamnamen')
    expect(input.element.value).toBe('')
    expect(zone(page, 'Team Rot').text()).toContain('0/12')
  })

  it('gives a Player no field in other teams, on the Bench or in the Stands', async () => {
    const members = [member(kitty.id, 'Kitty', team(2)), member(LARSI, 'Larsi', team(1))]
    const { page } = await mountBoard({ members })
    expect(zone(page, 'Team Rot').find('input').exists()).toBe(false)
    expect(zone(page, 'Team Orange').find('input').exists()).toBe(true)

    const onBench = await mountBoard({ members: [member(kitty.id, 'Kitty', { zone: 'bench' })] })
    expect(onBench.page.find('input').exists()).toBe(false)
  })

  it('gives the Host who is not in the team no field', async () => {
    const { page } = await mountBoard({ members: [member(SANNE, 'Sanne', { zone: 'bench' }, null, true), member(kitty.id, 'Kitty', team(1))], viewerId: SANNE, isHost: true })
    expect(page.find('input').exists()).toBe(false)
  })

  it('counts while editing and strips spaces at once with the hint', async () => {
    const { page } = await mountBoard({ members: [member(kitty.id, 'Kitty', team(1))] })
    const input = field(page, 'Team Rot')

    await type(input, 'Wilde Gurken')

    expect(input.element.value).toBe('WildeGurken')
    expect(zone(page, 'Team Rot').text()).toContain('11/12')
    expect(zone(page, 'Team Rot').text()).toContain('Nur ein Wort, ohne Leerzeichen.')
  })

  it('counts an emoji as one character and cuts at 12', async () => {
    const { page } = await mountBoard({ members: [member(kitty.id, 'Kitty', team(1))] })
    const input = field(page, 'Team Rot')

    await type(input, '👍🏽👍🏽')
    expect(zone(page, 'Team Rot').text()).toContain('2/12')

    await type(input, 'Gurkenfreunde')
    expect(input.element.value).toBe('Gurkenfreund')
  })

  it('posts the word on Enter', async () => {
    const { page, words } = await mountBoard({ members: [member(kitty.id, 'Kitty', team(1))] })
    const input = field(page, 'Team Rot')

    await type(input, 'Wilde')
    await input.trigger('keydown', { key: 'Enter' })
    await settle()

    expect(words).toEqual(['Wilde'])
  })

  it('posts the word on blur when it changed, and not when it did not', async () => {
    const { page, words } = await mountBoard({ members: [member(kitty.id, 'Kitty', team(1), 'Wilde')], teams: teamsNamed('Wilde') })
    const input = field(page, 'Wilde')
    expect(input.element.value).toBe('Wilde')

    await input.trigger('blur')
    await settle()
    expect(words).toEqual([])

    await type(input, 'Gurken')
    await input.trigger('blur')
    await settle()
    expect(words).toEqual(['Gurken'])
  })

  it('removes the word with an empty save', async () => {
    const { page, words } = await mountBoard({ members: [member(kitty.id, 'Kitty', team(1), 'Wilde')], teams: teamsNamed('Wilde') })
    const input = field(page, 'Wilde')

    await type(input, '')
    await input.trigger('keydown', { key: 'Enter' })
    await settle()

    expect(words).toEqual([''])
  })

  it('announces the composed name in a polite live region when it changes', async () => {
    const members = [member(kitty.id, 'Kitty', team(1)), member(LARSI, 'Larsi', team(1))]
    const { page } = await mountBoard({ members })
    const region = () => page.get('[data-drop-zone="team-1"] [role="status"][aria-live="polite"]')
    expect(region().text()).toBe('')

    await page.setProps({ teams: teamsNamed('Wilde Gurken'), members: [member(kitty.id, 'Kitty', team(1), 'Wilde'), member(LARSI, 'Larsi', team(1), 'Gurken')] })

    expect(region().text()).toContain('Wilde Gurken')
  })

  describe('the Host resets a Team name', () => {
    const named = [member(kitty.id, 'Kitty', team(1), 'Wilde'), member(LARSI, 'Larsi', team(1), 'Gurken'), member(SANNE, 'Sanne', { zone: 'bench' }, null, true)]

    it('offers the reset to the Host only, and only for a team with a name from words', async () => {
      const host = await mountBoard({ members: named, teams: teamsNamed('Wilde Gurken'), viewerId: SANNE, isHost: true })
      expect(zone(host.page, 'Wilde Gurken').text()).toContain('Name zurücksetzen')
      expect(zone(host.page, 'Team Orange').text()).not.toContain('Name zurücksetzen')

      const player = await mountBoard({ members: named, teams: teamsNamed('Wilde Gurken') })
      expect(player.page.text()).not.toContain('Name zurücksetzen')
    })

    it('asks first, then posts the reset and says so with the colour name', async () => {
      const { page, resets } = await mountBoard({ members: named, teams: teamsNamed('Wilde Gurken'), viewerId: SANNE, isHost: true })

      await clickButton(zone(page, 'Wilde Gurken').element, 'Name zurücksetzen')
      expect(resets).toEqual([])
      expect(dialog()?.textContent).toContain('Wilde Gurken')
      expect(dialog()?.textContent).toContain('Team Rot')

      await clickButton(dialog(), 'Zurücksetzen')
      await settle()

      expect(resets).toEqual([1])
      expect(shownToasts().map(toast => toast.text)).toContain('Name zurückgesetzt auf Team Rot.')
    })

    it('does nothing when the Host cancels', async () => {
      const { page, resets } = await mountBoard({ members: named, teams: teamsNamed('Wilde Gurken'), viewerId: SANNE, isHost: true })

      await clickButton(zone(page, 'Wilde Gurken').element, 'Name zurücksetzen')
      await clickButton(dialog(), 'Abbrechen')
      await settle()

      expect(resets).toEqual([])
    })
  })
})
