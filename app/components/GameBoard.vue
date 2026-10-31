<script setup lang="ts">
import { Armchair, Eye, Hand, Hourglass, Lock, Users } from '@lucide/vue'
import type { MoveTarget } from '~/components/MoveToMenuList.vue'
import { errorCopyKey } from '~/utils/api-error'
import { placeFromKey, placeKey, teamName } from '~/utils/board'
import { eventDataKey } from '~/utils/event-data'
import { glide, pop } from '~/utils/motion'
import { countSeats, moveRejection, placeOf, type Place } from '~~/shared/board'
import type { BoardTeam, MemberView } from '~~/shared/event'
import type { EventSettings } from '~~/shared/settings'

// The Game board (#160, GLOSSARY: Game board, 02-components § GameBoard, 11-event-seite § GameBoard): the teams, the Bench
// and the Stands, and where everybody sits. A Player moves themselves, the Host anyone: by dragging (pointer events,
// a long press on touch), or from the keyboard through the MoveToMenu. An own move shows at once and glides home with
// a toast when the server refuses it; somebody else's move arrives through the room (`member.moved`) and glides in.
// Four phases: `setup` (an Event without settings has no teams), `poll` (no Session has a Date: Players cannot take a
// team yet), `open` (Team choice is open) and `running` (the first Session has started, #164: teams and names are locked
// for Players, Bench and Stands stay free, the Host moves anyone). Avatars are keyed by user id, so the refetch that follows a move keeps the
// glide going. The room comes from the Event page: one socket per page.
const props = withDefaults(defineProps<{
  slug: string
  members: MemberView[]
  teams: BoardTeam[]
  settings: EventSettings | null
  teamChoiceOpen: boolean
  /** The first Session has started (#164). */
  started?: boolean
  /** Whether the board says why it is locked once a Session has started. The page leaves it out between Sessions, where its own notice says it (#166). */
  lockedNotice?: boolean
  /** Whether the board says teams are uneven. The page says no while a Session runs and once every Session is over; without it the board says so until the first Session starts (#166). */
  unevenNotice?: boolean
  viewerId: string
  isHost: boolean
  room: Pick<ReturnType<typeof useEventRoom>, 'on'>
  /** Whether somebody is online in the room (#162); undefined while presence is not known (no dots then). */
  online?: (userId: string) => boolean | undefined
}>(), { started: false, lockedNotice: true, unevenNotice: undefined, online: undefined })

const { t } = useI18n()
const root = useTemplateRef<HTMLElement>('root')
const slug = toRef(() => props.slug)

const phase = computed<'setup' | 'poll' | 'open' | 'running'>(() => (props.settings === null ? 'setup' : props.started ? 'running' : props.teamChoiceOpen ? 'open' : 'poll'))

// Where everybody is drawn: the server's place, under the moves other people made (from the room, until the refetch
// agrees) and the moves this viewer is making (until the server has answered).
// A team's name as it is shown: its Team name, else its colour's name (teamName).
const nameOfTeam = (position: number) => teamName(props.teams.find(team => team.position === position) ?? position, t)
const nameOf = (userId: string) => props.members.find(member => member.id === userId)?.name ?? ''
const moves = useBoardMoves(slug, () => refreshNuxtData(eventDataKey(props.slug)), { nameOf, teamNameOf: nameOfTeam })
const heard = ref<Record<string, Place>>({})

const people = computed(() => props.members.map(member => ({
  ...member,
  place: moves.pending.value[member.id] ?? heard.value[member.id] ?? placeOf(member),
})))
const seats = computed(() => countSeats(people.value.map(person => person.place)))
const currentPlace = (userId: string): Place => people.value.find(person => person.id === userId)?.place ?? { zone: 'bench' }
const inPlace = (place: Place) => people.value.filter(person => placeKey(person.place) === placeKey(place))
const whereText = (place: Place) => (place.zone === 'team' ? nameOfTeam(place.team) : t(place.zone === 'bench' ? 'board.bench' : 'board.stands'))

// What the room says about other people's moves is true at once; the refetch it triggers brings the same and drops it.
// A message the refetch never confirms (a move that was undone meanwhile) is dropped after a while.
const HEARD_MS = 5000
const heardTimers = new Map<string, ReturnType<typeof setTimeout>>()
function hear(userId: string, to: Place) {
  heard.value = { ...heard.value, [userId]: to }
  clearTimeout(heardTimers.get(userId))
  heardTimers.set(userId, setTimeout(() => forget(userId, to), HEARD_MS))
}
function forget(userId: string, to?: Place) {
  const current = heard.value[userId]
  if (current && (!to || placeKey(current) === placeKey(to))) heard.value = Object.fromEntries(Object.entries(heard.value).filter(([key]) => key !== userId))
}
watch(() => props.members, (members) => {
  for (const member of members) {
    const heardPlace = heard.value[member.id]
    if (heardPlace && placeKey(heardPlace) === placeKey(placeOf(member))) forget(member.id)
  }
})
const stopHearing = props.room.on('member.moved', message => hear(message.userId, message.to))
onBeforeUnmount(() => {
  stopHearing()
  for (const timer of heardTimers.values()) clearTimeout(timer)
})

/** Why the viewer cannot put this Member there (`moveRejection`, the server's rule), or null. */
function rejectionFor(userId: string, to: Place) {
  return moveRejection({
    actorId: props.viewerId,
    actorIsHost: props.isHost,
    userId,
    from: currentPlace(userId),
    to,
    settings: props.settings,
    teamChoiceOpen: props.teamChoiceOpen,
    started: props.started,
    seats: seats.value,
  })
}

// The slots of a team read „Zu“ (poll) or „Gesperrt“ (running) while the viewer cannot move into a team; the Host always can (#160, #164).
const lockReason = computed(() => {
  if (props.isHost) return null
  if (phase.value === 'poll') return t(errorCopyKey('team_choice_closed'))
  return phase.value === 'running' ? t(errorCopyKey('teams_locked')) : null
})

/** Whether the viewer sits in a team (the running notice tells them their seat is fixed). */
const inTeam = computed(() => currentPlace(props.viewerId).zone === 'team')
const runningNotice = computed(() => (props.isHost ? 'board.notice.runningHost' : inTeam.value ? 'board.notice.runningPlayer' : 'board.notice.running'))

const live = ref('')
const announce = (text: string) => void (live.value = text)
const freeIn = (team: number) => Math.max((props.settings?.teamSize ?? 0) - (seats.value[team] ?? 0), 0)

function personEl(userId: string): HTMLElement | null {
  return root.value?.querySelector<HTMLElement>(`[data-user-id="${userId}"]`) ?? null
}

/** Moves somebody, from a drop or from the menu: drawn at once, announced when the server took it. */
async function requestMove(userId: string, to: Place) {
  if (rejectionFor(userId, to)) return
  const taken = moves.move(userId, to)
  await nextTick()
  const element = personEl(userId)
  if (element) pop(element)
  if (await taken) announce(t(to.zone === 'team' ? 'board.movedTeam' : to.zone === 'bench' ? 'board.movedBench' : 'board.movedStands', { name: nameOf(userId), team: to.zone === 'team' ? nameOfTeam(to.team) : '' }))
}

const drag = useBoardDrag({
  canDrag: userId => props.isHost || userId === props.viewerId,
  zoneAt(x, y) {
    for (const zone of root.value?.querySelectorAll<HTMLElement>('[data-drop-zone]') ?? []) {
      const rect = zone.getBoundingClientRect()
      if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return zone.dataset.dropZone ?? null
    }
    return null
  },
  accepts(userId, key) {
    const to = placeFromKey(key)
    return to !== null && rejectionFor(userId, to) === null
  },
  drop(userId, key) {
    const to = placeFromKey(key)
    if (to) void requestMove(userId, to)
  },
  async release(userId) {
    // Let go anywhere else: the person was lifted off their place and glides back to it.
    announce(t('board.cancelled'))
    const element = personEl(userId)
    if (!element) return
    const from = element.getBoundingClientRect()
    await nextTick()
    glide(element, from, element.getBoundingClientRect(), 'bounce')
  },
})

watch(drag.overZone, (key) => {
  const place = placeFromKey(key ?? undefined)
  if (place?.zone === 'team') announce(t('board.zoneAria', { name: nameOfTeam(place.team), n: freeIn(place.team), size: props.settings?.teamSize ?? 0 }))
  else if (place) announce(whereText(place))
})

// A change of anyone's place glides their avatar from the old slot to the new one (Flip). The pre-flush watcher sees the
// old layout, the post-flush one the new; the avatars are found by user id because each zone draws its own element.
const layout = computed(() => people.value.map(person => `${person.id}:${placeKey(person.place)}`).join('|'))
let before = new Map<string, DOMRect>()
const measure = () => new Map([...(root.value?.querySelectorAll<HTMLElement>('[data-user-id]') ?? [])].map(element => [element.dataset.userId ?? '', element.getBoundingClientRect()]))
watch(layout, () => void (before = measure()), { flush: 'pre' })
watch(layout, () => {
  for (const element of root.value?.querySelectorAll<HTMLElement>('[data-user-id]') ?? []) {
    const id = element.dataset.userId ?? ''
    const from = before.get(id)
    if (from) glide(element, from, element.getBoundingClientRect(), moves.bounced.has(id) ? 'bounce' : 'glide')
    moves.bounced.delete(id)
  }
  before = new Map()
}, { flush: 'post' })

// Everything a person on the board is bound to, the same in every zone: what it shows, and the pointer, click and menu handlers.
function personBindings(person: (typeof people.value)[number]) {
  const held = drag.dragging.value?.userId === person.id ? drag.dragging.value : null
  return {
    userId: person.id,
    name: person.name,
    image: person.image,
    isHost: person.isHost,
    you: person.id === props.viewerId,
    team: person.place.zone === 'team' ? person.place.team : null,
    where: whereText(person.place),
    lifted: held !== null,
    online: props.online?.(person.id),
    menuOpen: menu.value?.userId === person.id,
    draggable: props.isHost || person.id === props.viewerId,
    style: held ? { transform: `translate(${held.dx}px, ${held.dy}px)` } : undefined,
    onPointerdown: (event: PointerEvent) => drag.start(event, person.id),
    onClick: (event: MouseEvent) => openMenu(event, person.id),
    onContextmenu: (event: Event) => event.preventDefault(),
  }
}

// The MoveToMenu.
const menu = ref<{ userId: string, anchor: HTMLElement } | null>(null)

function openMenu(event: MouseEvent, userId: string) {
  if (drag.wasDragged()) return
  menu.value = { userId, anchor: event.currentTarget as HTMLElement }
}

function targetFor(place: Place, label: string, extra: Partial<MoveTarget>): MoveTarget {
  const rejection = menu.value ? rejectionFor(menu.value.userId, place) : null
  return { key: placeKey(place), label, reason: rejection ? t(errorCopyKey(rejection)) : null, ...extra }
}

const targets = computed((): MoveTarget[] => [
  ...props.teams.map(team => targetFor({ zone: 'team', team: team.position }, t('board.moveToTeam', { team: teamName(team, t) }), { team: team.position })),
  targetFor({ zone: 'bench' }, t('board.moveToBench'), { icon: Armchair }),
  targetFor({ zone: 'stands' }, t('board.moveToStands'), { icon: Eye }),
])

function pick(key: string) {
  const userId = menu.value?.userId
  const to = placeFromKey(key)
  menu.value = null
  if (userId && to) void requestMove(userId, to)
}

// The viewer's own Team word, and the names of the Players who gave one in a team, for the TeamNameBuilder (#161).
const myWord = computed(() => props.members.find(member => member.id === props.viewerId)?.teamWord ?? null)
const authorsIn = (team: number) => inPlace({ zone: 'team', team }).filter(person => person.teamWord !== null).map(person => person.name)

// The notice about uneven teams: the smallest team against the biggest. The Host's says the next start waits for it, also
// between two Sessions, where the next start is blocked again (#166); a Player's says the team looks for somebody, only
// while Team choice is open (11-event-seite § NoticeBanner).
const uneven = computed(() => {
  if (!(props.unevenNotice ?? !props.started) || props.settings === null || props.teams.length < 2) return null
  if (!props.isHost && phase.value !== 'open') return null
  const counts = props.teams.map(team => ({ team: team.position, count: seats.value[team.position] ?? 0 }))
  const small = counts.reduce((least, next) => (next.count < least.count ? next : least))
  const big = Math.max(...counts.map(entry => entry.count))
  return small.count === big ? null : { team: nameOfTeam(small.team), small: small.count, big }
})

/** What the board says about itself under its title (11-event-seite § GameBoard): who is there, or how full the teams are. */
const meta = computed(() => {
  const size = props.settings?.teamSize ?? 0
  const teamsText = t('stepper.summary.teams', { n: props.teams.length, s: size })
  switch (phase.value) {
    case 'setup': return t('board.meta.setup', { n: props.members.length })
    case 'poll': return t('board.meta.poll', { teams: teamsText })
    case 'open': return t('board.meta.open', { taken: Object.values(seats.value).reduce((sum, n) => sum + n, 0), places: props.teams.length * size })
    default: return t('board.meta.running', { teams: teamsText })
  }
})
</script>

<template>
  <!-- A plain block of the stage, no card around it (11-event-seite § GameBoard): its notices sit above the title like the other notices of the page. -->
  <section
    ref="root"
    class="@container flex flex-col gap-3 text-ink"
    aria-labelledby="board-title"
  >
    <NoticeBanner
      v-if="phase === 'running' && lockedNotice"
      tone="info"
      :icon="Lock"
    >
      {{ t(runningNotice) }}
    </NoticeBanner>
    <NoticeBanner
      v-if="uneven"
      tone="warning"
      :icon="Users"
      :host-only="isHost"
    >
      <b v-if="isHost">{{ t('board.notice.unevenTitle') }}</b>
      {{ t(isHost ? 'board.notice.uneven' : 'board.notice.unevenMember', uneven) }}
    </NoticeBanner>

    <div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <h2
        id="board-title"
        class="m-0 font-display text-[24px] leading-none font-normal md:text-[30px]"
      >
        {{ t('board.title') }}
      </h2>
      <span class="text-[13px] font-bold text-ink-2">{{ meta }}</span>
      <span
        v-if="phase === 'open'"
        class="ml-auto inline-flex items-center gap-1 text-[12px] font-bold text-ink-2 md:hidden"
      >
        <AppIcon
          :icon="Hand"
          :size="14"
        />
        {{ t('board.longPress') }}
      </span>
    </div>

    <NoticeBanner
      v-if="phase === 'setup'"
      tone="info"
      :icon="Hourglass"
    >
      {{ t('board.note.setup') }}
    </NoticeBanner>
    <NoticeBanner
      v-else-if="phase === 'poll'"
      tone="info"
      :icon="Lock"
    >
      {{ t('board.notice.poll') }}
    </NoticeBanner>

    <!-- Two columns on a phone; from a board 560 px wide as many as fit with at least 250 px each (4 at full width). -->
    <div
      v-if="teams.length > 0"
      class="grid grid-cols-2 gap-2 @min-[560px]:grid-cols-[repeat(auto-fit,minmax(250px,1fr))] @min-[560px]:gap-3"
    >
      <TeamZone
        v-for="team in teams"
        :key="team.position"
        :team="team.position"
        :name="teamName(team, t)"
        :size="settings?.teamSize ?? 0"
        :taken="inPlace({ zone: 'team', team: team.position }).length"
        :lock-reason="lockReason"
        :lock-label="phase === 'running' ? 'locked' : 'closed'"
        :frozen="team.frozen"
        :drop-target="drag.overZone.value === `team-${team.position}`"
        :mine="placeKey(currentPlace(viewerId)) === `team-${team.position}`"
      >
        <BoardPerson
          v-for="person in inPlace({ zone: 'team', team: team.position })"
          :key="person.id"
          v-bind="personBindings(person)"
        />
        <template #builder>
          <TeamNameBuilder
            :slug="slug"
            :team="team.position"
            :name="teamName(team, t)"
            :named="team.name !== null"
            :mine="placeKey(currentPlace(viewerId)) === `team-${team.position}`"
            :frozen="team.frozen"
            :my-word="myWord"
            :is-host="isHost"
            :authors="authorsIn(team.position)"
          />
        </template>
      </TeamZone>
    </div>

    <div class="grid grid-cols-1 gap-2 @min-[560px]:grid-cols-2 @min-[560px]:gap-3">
      <BenchZone
        v-for="zone in (['bench', 'stands'] as const)"
        :key="zone"
        :zone="zone"
        :count="inPlace({ zone }).length"
        :drop-target="drag.overZone.value === zone"
      >
        <BoardPerson
          v-for="person in inPlace({ zone })"
          :key="person.id"
          v-bind="personBindings(person)"
        />
      </BenchZone>
    </div>

    <div
      class="sr-only"
      role="status"
      aria-live="polite"
    >
      {{ live }}
    </div>

    <MoveToMenu
      :open="menu !== null"
      :name="menu ? nameOf(menu.userId) : ''"
      :targets="targets"
      :anchor="menu?.anchor ?? null"
      @close="menu = null"
      @pick="pick"
    />
  </section>
</template>
