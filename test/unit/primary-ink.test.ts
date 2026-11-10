import { describe, expect, it } from 'vitest'
import { colour, contrast, dark, light } from './css-tokens'

// Text on a primary fill (the current page's footer link, the newest Release's chip) takes `--cp-on-primary`, not
// `--cp-ink`: in Dunkel ink flips to cream and reads 1.26:1 on the yellow (#411). The seam is the token file as text:
// jsdom computes no cascade, so no test can read the colour of a rendered element.
describe('text on the primary fill', () => {
  it('is the same colour as ink in Hell, so the swap from text-ink changes nothing there', () => {
    expect(colour(light, 'cp-on-primary')).toBe(colour(light, 'cp-ink'))
  })

  it('reads on the primary fill in Hell', () => {
    expect(contrast(colour(light, 'cp-on-primary'), colour(light, 'cp-primary'))).toBeGreaterThanOrEqual(4.5)
  })

  it('reads on the primary fill in Dunkel', () => {
    expect(contrast(colour(dark, 'cp-on-primary'), colour(dark, 'cp-primary'))).toBeGreaterThanOrEqual(4.5)
  })

  it('does not read on the primary fill in Dunkel with ink: why a text on primary takes text-on-primary', () => {
    // The day the tokens change so that ink reads on the yellow, this case says the swap is no longer needed.
    expect(contrast(colour(dark, 'cp-ink'), colour(dark, 'cp-primary'))).toBeLessThan(4.5)
  })

  it('does not read on the surface in Dunkel: why the Dunkel marker covers the whole line, not the lower 45 %', () => {
    // Pins the design reason of the footer's highlighter (brief 409b): no text colour reads on both the yellow and the surface.
    expect(contrast(colour(dark, 'cp-on-primary'), colour(dark, 'cp-surface'))).toBeLessThan(4.5)
  })
})
