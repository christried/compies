import { describe, expect, it } from 'vitest'
import { tabKeyAction } from '../../scripts/wording/review-keys.mjs'

// The wording review page's Tab key (#811, spec #790): with no field focused, Tab puts the cursor at the end of the comment
// field; everything else stays with the browser. The page is plain DOM, so the decision is pinned here, not in the page.

const tab = { key: 'Tab' }
const shown = { inField: false, commentShown: true }

describe('tabKeyAction', () => {
  it('sends Tab with no field focused and a step shown to the comment field', () => {
    expect(tabKeyAction(tab, shown)).toBe('comment')
  })

  it('leaves Tab inside a text field to the browser', () => {
    expect(tabKeyAction(tab, { inField: true, commentShown: true })).toBe(null)
  })

  it('leaves Shift+Tab to the browser, with no field focused and inside one', () => {
    expect(tabKeyAction({ key: 'Tab', shiftKey: true }, shown)).toBe(null)
    expect(tabKeyAction({ key: 'Tab', shiftKey: true }, { inField: true, commentShown: true })).toBe(null)
  })

  it('leaves Tab with Alt, Ctrl or Meta to their own handlers and the browser', () => {
    expect(tabKeyAction({ key: 'Tab', altKey: true }, shown)).toBe(null)
    expect(tabKeyAction({ key: 'Tab', ctrlKey: true }, shown)).toBe(null)
    expect(tabKeyAction({ key: 'Tab', metaKey: true }, shown)).toBe(null)
  })

  it('leaves Tab alone when no step is shown or the step is an unused group, whose comment box is hidden', () => {
    expect(tabKeyAction(tab, { inField: false, commentShown: false })).toBe(null)
  })

  it('leaves a printable character alone, so it still starts the replacement', () => {
    expect(tabKeyAction({ key: 'a' }, shown)).toBe(null)
  })
})
