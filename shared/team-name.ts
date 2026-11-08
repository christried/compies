// The name a team is shown with (#161, GLOSSARY: Team name): its own Team name when it has one, else the Team colour's name („Team Rot“).
// One rule for the app (`teamName` in app/utils/board.ts, with vue-i18n's t) and for the Share image's model on the server (which has no
// vue-i18n and carries the copy it needs); share-image.test.ts holds the two equal (#329, review 0.9 S5). The Worker does not import this file.

/** The two strings the fallback needs, from wherever the caller gets its copy. */
export interface TeamNameCopy {
  /** „Team {color}“ with the colour's name filled in. */
  defaultName: (color: string) => string
  /** The name of the Team colour at a position, 1..8. */
  colorName: (position: number) => string
}

/** The team's own name when it has content, else the colour's name. A name of spaces only counts as none; one with content is kept as given. */
export function teamDisplayName(own: string | null | undefined, position: number, copy: TeamNameCopy): string {
  if (own !== null && own !== undefined && own.trim() !== '') return own
  return copy.defaultName(copy.colorName(position))
}
