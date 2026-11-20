// The page's key decisions that need no DOM: a unit test pins them (#811). The page imports this module from /modules/.
/**
 * Tab with no field focused puts the cursor at the end of the comment field: 'comment'. Anything else is left to the browser (null).
 * @param {{ key: string, shiftKey?: boolean, altKey?: boolean, ctrlKey?: boolean, metaKey?: boolean }} event
 * @param {{ inField: boolean, commentShown: boolean }} focus  `commentShown`: a step is shown and it is not an unused group.
 * @returns {'comment' | null}
 */
export function tabKeyAction(event, { inField, commentShown }) {
  if (event.key !== 'Tab' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey) return null
  if (inField || !commentShown) return null
  return 'comment'
}
