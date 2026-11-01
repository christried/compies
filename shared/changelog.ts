// The Changelog (CHANGELOG.md, Keep a Changelog, German for Users). One pure parser turns the file into
// Releases for the Neuigkeiten page and for the guard test. It throws on any line it does not know, so a
// broken file fails the test instead of the page. Text comes out as inline nodes (text, bold, code, link)
// in the shape of the Neuigkeiten design (09): the page renders them, the parser never emits HTML.

export const CHANGE_GROUPS = ['Neu', 'Geändert', 'Behoben', 'Entfernt', 'Sicherheit'] as const
export type ChangeGroupName = typeof CHANGE_GROUPS[number]
export type ChangeGroupType = 'neu' | 'geaendert' | 'behoben' | 'entfernt' | 'sicherheit'

const GROUP_TYPES: Record<ChangeGroupName, ChangeGroupType> = {
  Neu: 'neu',
  Geändert: 'geaendert',
  Behoben: 'behoben',
  Entfernt: 'entfernt',
  Sicherheit: 'sicherheit',
}

export type Inline
  = { type: 'text', text: string }
    | { type: 'bold', text: string }
    | { type: 'code', text: string }
    | { type: 'link', text: string, href: string }

export type ChangeItem = { inline: Inline[], children: Inline[][] }
export type ChangeGroup = { type: ChangeGroupType, name: ChangeGroupName, items: ChangeItem[] }
export type Release = { version: string, date: string, name: string, intro: Inline[] | null, groups: ChangeGroup[] }
export type Changelog = { unreleased: ChangeGroup[], releases: Release[] }

const RELEASE_HEADING = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2}) – (.+)$/
const GROUP_HEADING = /^### (.+)$/
const ITEM = /^- (.+)$/
const CHILD = /^ {2}- (.+)$/
const INLINE = /\*\*(.+?)\*\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g

type Line = { n: number, text: string }

function fail(line: Line, why: string): never {
  throw new Error(`CHANGELOG.md line ${line.n}: ${why}: ${line.text}`)
}

function isGroupName(name: string): name is ChangeGroupName {
  return (CHANGE_GROUPS as readonly string[]).includes(name)
}

/** Splits a line of text into inline nodes. Links must be http(s), so the page never gets a `javascript:` href. */
function inline(line: Line, text: string): Inline[] {
  const nodes: Inline[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push({ type: 'text', text: text.slice(last, match.index) })
    if (match[1] !== undefined) nodes.push({ type: 'bold', text: match[1] })
    else if (match[2] !== undefined) nodes.push({ type: 'code', text: match[2] })
    else {
      if (!/^https?:\/\//.test(match[4]!)) fail(line, 'link must be http(s)')
      nodes.push({ type: 'link', text: match[3]!, href: match[4]! })
    }
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push({ type: 'text', text: text.slice(last) })
  return nodes
}

function parseSection(lines: Line[], allowIntro: boolean): { intro: Inline[] | null, groups: ChangeGroup[] } {
  const intro: Line[] = []
  const groups: ChangeGroup[] = []
  let group: ChangeGroup | null = null
  let item: ChangeItem | null = null

  for (const line of lines) {
    if (line.text === '') continue

    const heading = GROUP_HEADING.exec(line.text)
    if (heading) {
      const name = heading[1]!
      if (!isGroupName(name)) fail(line, 'unknown group')
      const previous = groups.at(-1)
      if (previous && CHANGE_GROUPS.indexOf(name) <= CHANGE_GROUPS.indexOf(previous.name)) {
        fail(line, 'group out of order')
      }
      group = { type: GROUP_TYPES[name], name, items: [] }
      groups.push(group)
      item = null
      continue
    }

    const bullet = ITEM.exec(line.text)
    if (bullet) {
      if (!group) fail(line, 'item outside a group')
      item = { inline: inline(line, bullet[1]!), children: [] }
      group.items.push(item)
      continue
    }

    const child = CHILD.exec(line.text)
    if (child) {
      if (!item) fail(line, 'nested item without a parent')
      item.children.push(inline(line, child[1]!))
      continue
    }

    if (!group && allowIntro) {
      intro.push({ ...line, text: line.text.trim() })
      continue
    }
    fail(line, 'unexpected line')
  }

  // The intro is one paragraph: its lines join into one run of inline nodes.
  const introText = intro.map(l => l.text).join(' ')
  return { intro: introText ? inline(intro[0]!, introText) : null, groups }
}

/** Whether a value is an `x.y.z` version, the form of every Release heading. */
export function isVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value)
}

/** Orders two `x.y.z` versions by their numbers (1.10.0 is after 1.9.0): negative, zero or positive like a sort comparator. */
export function compareVersions(a: string, b: string): number {
  const [x, y] = [a, b].map(version => version.split('.').map(Number))
  return (x![0]! - y![0]!) || (x![1]! - y![1]!) || (x![2]! - y![2]!)
}

/**
 * The Releases the „Was ist neu“ pop-up shows (#184), newest first, from `releases` newest first and the newest
 * version the User has seen. Nothing seen yet (or a version that is no Release) shows only the newest, so a
 * User who joins long after the first Release is not buried in old news.
 */
export function unseenReleases(releases: Release[], seen: string | null): Release[] {
  if (seen === null || !releases.some(r => r.version === seen)) return releases.slice(0, 1)
  return releases.filter(r => compareVersions(r.version, seen) > 0)
}

/**
 * The version a User has seen once they mark `version` seen (#184, #242): the higher of the two, so it never goes down. A
 * stored version above `newest` counts as unknown and is replaced: old code can store one while a deploy runs its
 * migrations (`1.4.0` after the renumbering to 0.x), and no Release would ever come after it.
 */
export function seenAfter(stored: string | null, version: string, newest: string): string {
  if (stored === null || compareVersions(stored, newest) > 0) return version
  return compareVersions(version, stored) > 0 ? version : stored
}

export function parseChangelog(source: string): Changelog {
  const lines = source.split('\n').map((text, i): Line => ({ n: i + 1, text: text.trimEnd() }))
  if (lines[0]?.text !== '# Changelog') throw new Error('CHANGELOG.md must start with „# Changelog“')

  const sections: { heading: Line, body: Line[] }[] = []
  for (const line of lines.slice(1)) {
    if (line.text.startsWith('## ')) sections.push({ heading: line, body: [] })
    else if (sections.length) sections.at(-1)!.body.push(line)
    else if (line.text !== '') fail(line, 'text before the first section')
  }

  const [unreleased, ...releases] = sections
  if (unreleased?.heading.text !== '## [Unreleased]') {
    throw new Error('CHANGELOG.md: [Unreleased] must be the first section')
  }

  return {
    unreleased: parseSection(unreleased.body, false).groups,
    releases: releases.map(({ heading, body }) => {
      const match = RELEASE_HEADING.exec(heading.text)
      if (!match) fail(heading, 'release heading must be ## [x.y.z] - YYYY-MM-DD – Name')
      const { intro, groups } = parseSection(body, true)
      return { version: match[1]!, date: match[2]!, name: match[3]!, intro, groups }
    }),
  }
}
