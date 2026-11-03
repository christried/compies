// The pure part of dragging a row of a vertical list (#273, useRowDrag): which row a pointer is over.

/** The row a point at `y` is over: how many row middles lie above it, clamped to the list (0 to the last row). */
export function rowIndexAt(y: number, middles: readonly number[]): number {
  const above = middles.filter(middle => middle < y).length
  return Math.min(above, Math.max(middles.length - 1, 0))
}
