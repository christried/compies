// The growth check behind the CHANGELOG.md file test (#566): after the 0.11.0 cut, git merged CHANGELOG.md into the 0.12
// integration branch without a conflict and left every 0.12 line under [0.11.0]. A released section never gains lines.
// A plain helper next to its tests, not in shared/: `knip --production` flags an export that only a test imports.
// It works on the raw text and not on parseChangelog, which throws on a line it does not know: origin/main holds an older
// file, and a later tightening of the parser must not turn this check red.

export type GrownRelease = {
  version: string
  // List items in this Release section of the current text, and in the same section of the other text.
  items: number
  itemsOnOther: number
  added: number
  message: string
}

const releaseHeading = /^## \[(\d+\.\d+\.\d+)\]/
const listItem = /^\s*[-*+]\s/

// Counts list items per Release version. The first section of a version wins; [Unreleased] and the text before the
// first `## ` belong to no Release.
function itemsPerRelease(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  let current: string | null = null
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      const version = releaseHeading.exec(line)?.[1] ?? null
      current = version !== null && !counts.has(version) ? version : null
      if (current !== null) counts.set(current, 0)
    }
    else if (current !== null && listItem.test(line)) {
      counts.set(current, counts.get(current)! + 1)
    }
  }
  return counts
}

// Known limit: a line removed and another added in the same section nets to zero and passes; only a net gain fails.
// A Release the other text lacks passes, so while a Release is on staging but not yet on main the check does not guard
// it: it guards a Release from the moment main has it, as the 0.11.0 incident happened.
export function findGrownReleases(current: string, other: string): GrownRelease[] {
  const onOther = itemsPerRelease(other)
  const grown: GrownRelease[] = []
  for (const [version, items] of itemsPerRelease(current)) {
    const itemsOnOther = onOther.get(version)
    if (itemsOnOther === undefined || items <= itemsOnOther) continue
    const added = items - itemsOnOther
    grown.push({
      version,
      items,
      itemsOnOther,
      added,
      message: `Release ${version} holds ${added} more list ${added === 1 ? 'item' : 'items'} than on origin/main (${items} against ${itemsOnOther}). A released section never gains lines: move the added lines under [Unreleased].`,
    })
  }
  return grown
}
