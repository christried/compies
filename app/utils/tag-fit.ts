// How many of a game card's Tag chips show (#711, GLOSSARY: Tag). Pure: the widths are measured by `useTagFit`, the one reader of the DOM.

export type TagFitInput = {
  /** Each chip's width in px, in the chips' order (fractional: a chip's box includes its border). */
  widths: number[]
  /** The width of the line the chips flow in. 0 or less means there is no layout (the server, happy-dom): every chip shows. */
  rowWidth: number
  /** The space between two items on a line. */
  gap: number
  /** The width of the „+X“ button, taken at its widest label. */
  moreWidth: number
  /** How many lines the chips may fill: 2 on a card, 1 on a row. */
  rows: number
}

/** The lines a greedy fill of `widths` uses. An item joins the line while it fits (`<=`), else it starts the next one. */
function linesUsed(widths: number[], rowWidth: number, gap: number): number {
  let lines = 0
  let lineWidth = 0
  for (const width of widths) {
    const joins = lines > 0 && lineWidth + gap + width <= rowWidth
    lines += joins ? 0 : 1
    lineWidth = joins ? lineWidth + gap + width : width
  }
  return lines
}

/**
 * How many chips show, in order; the hidden ones are `widths.length - shown`. All of them when they fit in `rows` lines (no „+X“, however full
 * the last line is), else the most that leave room for „+X“ after the last one, so it ends the last line used. A chip wider than the row counts as
 * a whole row: it is the only one the card cuts. Never fewer than one chip when there is one: a first chip as wide as the row in a single
 * line takes the row, and the card lets it shrink to make room for „+X“.
 */
export function fitTags({ widths, rowWidth, gap, moreWidth, rows }: TagFitInput): number {
  if (widths.length === 0) return 0
  if (rowWidth <= 0) return widths.length

  const capped = widths.map(width => Math.min(width, rowWidth))
  if (linesUsed(capped, rowWidth, gap) <= rows) return widths.length

  const more = Math.min(moreWidth, rowWidth)
  for (let shown = widths.length - 1; shown > 1; shown--) {
    if (linesUsed([...capped.slice(0, shown), more], rowWidth, gap) <= rows) return shown
  }
  return 1
}
