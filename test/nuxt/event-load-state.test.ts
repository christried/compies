import { mountSuspended } from '@nuxt/test-utils/runtime'
import { afterEach, describe, expect, it } from 'vitest'
import EventLoadState from '~/components/EventLoadState.vue'

// The Event page's load states (#257): a removed User gets their own (#897), which wins over what their reads answer.
type Mounted = Awaited<ReturnType<typeof mountSuspended>>
let mounted: Mounted | undefined

const mount = async (props: { error: { statusCode?: number }, removed?: boolean }) => (mounted = await mountSuspended(EventLoadState, { props, attachTo: document.body }))

afterEach(() => {
  mounted?.unmount()
  mounted = undefined
  document.body.innerHTML = ''
})

describe('EventLoadState', () => {
  it('tells a removed User so, with the way to the start page and the focus on the title (#897)', async () => {
    const page = await mount({ error: { statusCode: 404 }, removed: true })

    expect(page.get('h1').text()).toBe('Du bist nicht mehr in diesem Event')
    expect(page.get('p').text()).toBe('Der Host hat dich aus dem Event entfernt.')
    const home = page.get('a')
    expect(home.text()).toContain('Zur Startseite')
    expect(home.attributes('href')).toBe('/')
    expect(document.activeElement).toBe(page.get('h1').element)
  })

  it('lets the removal win over a 410 (#897)', async () => {
    const page = await mount({ error: { statusCode: 410 }, removed: true })

    expect(page.get('h1').text()).toBe('Du bist nicht mehr in diesem Event')
  })

  it.each([[404, 'Link ungültig'], [410, 'Event gelöscht']])('still says %i as before when nobody was removed', async (statusCode, title) => {
    const page = await mount({ error: { statusCode }, removed: false })

    expect(page.get('h1').text()).toBe(title)
  })
})
