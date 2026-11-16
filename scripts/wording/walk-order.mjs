// The order the wording walk meets the states in (#629, spec #620 § The walk): the order a User meets the app. Pure: states in, states out.
// Every state has to be named here, by its name or by its group, and `orderStates` throws on one it cannot place, so a state a later ticket
// adds (#630) cannot slip into the walk unplaced. A name rule wins over a group rule.

/** @typedef {{ name: string, group: string }} Placed */
/** @typedef {{ id: string, groups?: string[], names?: string[] }} Section */

/** @type {Section[]} */
export const SECTIONS = [
  { id: 'signed-out', groups: ['signed-out'] },
  { id: 'setup', names: ['einrichten', 'einrichten-fehler'] },
  { id: 'home', names: ['home-leer', 'home', 'home-menue', 'was-ist-neu'] },
  { id: 'library', groups: ['library'] },
  { id: 'stepper', groups: ['stepper'] },
  // 0.12's states were appended at the end of dark-states-event.mjs: the groups, not the file order, put them where the Event shows them.
  { id: 'event', groups: ['event-poll', 'event-board', 'event-live', 'event-finished'] },
  { id: 'profil', names: ['profil', 'profil-fehler', 'profil-gespeichert', 'baustelle-archiv', 'baustelle-admin', 'baustelle-allgemein', 'baustelle-event'] },
]

/**
 * The id of the section a state belongs to. Throws, naming the state, when there is none.
 * @param {Placed} state
 * @returns {string}
 */
export function sectionOf(state) {
  return placeOf(state).section.id
}

/**
 * Where a state sits: its section and the rank inside it (its place in the section's `names`, or its group's place in `groups`).
 * @param {Placed} state
 */
function placeOf(state) {
  const byName = SECTIONS.find(section => section.names?.includes(state.name))
  if (byName) return { section: byName, rank: byName.names?.indexOf(state.name) ?? 0 }
  const byGroup = SECTIONS.find(section => section.groups?.includes(state.group))
  if (byGroup) return { section: byGroup, rank: byGroup.groups?.indexOf(state.group) ?? 0 }
  throw new Error(`The wording walk has no section for the state ${state.name} (group ${state.group}): add it to SECTIONS in scripts/wording/walk-order.mjs`)
}

/**
 * The states in walk order: by section, inside it by the name's or the group's place in the table, and by file order inside that (the sort is stable).
 * @template {Placed} T
 * @param {T[]} states
 * @returns {T[]}
 */
export function orderStates(states) {
  const placed = states.map((state, index) => ({ state, index, ...placeOf(state) }))
  const sectionIndex = (/** @type {Section} */ section) => SECTIONS.indexOf(section)
  placed.sort((a, b) => sectionIndex(a.section) - sectionIndex(b.section) || a.rank - b.rank || a.index - b.index)
  return placed.map(entry => entry.state)
}
