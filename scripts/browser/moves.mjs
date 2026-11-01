// The two-account check for the Game board (retro 1.4): the Dev Host at 1440 px and the Dev Member at 390 px on one
// Event, moves on one side, and every animation both sides draw. It is how #208 (a Flip on the wrong curve) and #207
// (the picture's own drag) would have shown before the walk-through.
// Usage: node scripts/browser/moves.mjs <slug>   (an Event of the Dev Host with settings and a Date: Team choice open)
import { launch, sleep } from './chrome.mjs'
import { animations, api, drag, joinEvent, open } from './kit.mjs'

const slug = process.argv[2]
if (!slug) throw new Error('Usage: node scripts/browser/moves.mjs <slug>')
const board = 'section[aria-labelledby="board-title"] [data-user-id]'

const host = await launch('host')
const member = await launch('member')
try {
  await open(host, `/e/${slug}`, 1440, 900, board)
  await open(member, '/', 390, 844)
  const me = async tab => (await api(tab, 'GET', '/api/me')).body.user.id
  const [hostId, memberId] = [await me(host), await me(member)]

  // The Dev Member joins through the Invite link if they aren't a Member yet, and starts on the Bench like the Host.
  await joinEvent(member, slug, host)
  await open(member, `/e/${slug}`, 390, 844, board)
  for (const [tab, userId] of [[host, hostId], [member, memberId]]) await api(tab, 'POST', `/api/e/${slug}/move`, { userId, to: { zone: 'bench' } })
  await sleep(3000)
  await animations(host)
  await animations(member)

  async function step(label, act) {
    const answer = await act()
    await sleep(2500)
    console.log(`\n${label}${answer?.status ? ` → ${answer.status}` : ''}`)
    for (const [tab, width] of [[host, 1440], [member, 390]]) {
      console.log(`  ${tab.account} (${width} px)`)
      for (const a of await animations(tab)) console.log(`    ${a.who.padEnd(17)} ${String(a.from).padEnd(28)} ${a.easing} ${a.duration}`)
    }
  }

  await step('Host: Bench → Stands (API)', () => api(host, 'POST', `/api/e/${slug}/move`, { userId: hostId, to: { zone: 'stands' } }))
  await step('Host: moves the Member to team 1 (API)', () => api(host, 'POST', `/api/e/${slug}/move`, { userId: memberId, to: { zone: 'team', team: 1 } }))
  await step('Member: drags themselves by the avatar picture to team 2 (long press)', () => drag(member, `[data-user-id="${memberId}"] img`, '[data-drop-zone="team-2"]', { touch: true }))
  await step('Host: drags themselves by the avatar picture to the Bench (mouse)', () => drag(host, `[data-user-id="${hostId}"] img`, '[data-drop-zone="bench"]'))

  const seats = (await api(host, 'GET', `/api/e/${slug}`)).body.members.map(m => `${m.name}: ${m.zone}${m.team ?? ''}`)
  console.log(`\nSeats now: ${seats.join(', ')}`)
  console.log(`Native drags started: host ${host.nativeDrags.length}, member ${member.nativeDrags.length}`)
  console.log(`Page errors: ${[...host.errors, ...member.errors].length}`, [...host.errors, ...member.errors].slice(0, 3))
}
finally {
  host.close()
  member.close()
}
