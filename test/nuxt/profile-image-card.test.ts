import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, getHeader, readRawBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '~/pages/profil.vue'
import { ImageConversionError } from '~/utils/image-resize'
import { CENTRE_CROP, PROFILE_IMAGE_TARGET } from '~~/shared/image'
import { kitty, signInAs } from './auth'

// The picture row of the card „Profil“ (#678): „Hochladen“ cuts the picked file to its centre, sends it, and the new picture shows without a reload.

// The canvas does the real work (needs a browser); the card only sees a Blob.
const toCardWebp = vi.hoisted(() => vi.fn())
vi.mock('~/utils/image-resize', async importOriginal => ({ ...await importOriginal<object>(), toCardWebp }))

const withPicture = { ...kitty, image: 'https://example.com/kitty_tv.png' }
const uploaded = '/api/images/profile-abcdefghijklmnop.webp'
const webp = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: 'image/webp' })

const uploads = vi.fn()
// A test that holds the PUT sets this: the endpoint waits for it before it answers.
let holdUpload: Promise<void> | null = null
let uploadFailsWith: { statusCode: number, statusMessage: string } | null = null
registerEndpoint('/api/me/image', {
  method: 'PUT',
  handler: async (event) => {
    uploads({ type: getHeader(event, 'content-type'), bytes: Array.from(await readRawBody(event, false) ?? []) })
    if (holdUpload) await holdUpload
    if (uploadFailsWith) throw createError(uploadFailsWith)
    return { image: uploaded }
  },
})

const mount = () => mountSuspended(ProfilePage, { route: '/profil' })
const card = (page: VueWrapper) => page.get('section[aria-labelledby="profile-card-title"]')
const cardPicture = (page: VueWrapper) => page.find('section[aria-labelledby="profile-card-title"] img')
const uploadButton = (page: VueWrapper) => page.findAll('button').find(button => button.text() === 'Hochladen')!

async function pick(page: VueWrapper, file: File | null = new File(['x'], 'me.png', { type: 'image/png' })) {
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: file ? [file] : [], configurable: true })
  await input.trigger('change')
}

describe('uploading a Profile picture on the Profil page (#678)', () => {
  beforeEach(() => {
    signInAs(withPicture)
    uploads.mockClear()
    holdUpload = null
    uploadFailsWith = null
    toCardWebp.mockReset()
    toCardWebp.mockResolvedValue({ blob: webp, width: 2000, height: 1000 })
  })

  it('shows „Hochladen“ beside the picture and leaves the hint as it was', async () => {
    const page = await mount()

    expect(uploadButton(page)).toBeDefined()
    expect(page.text()).toContain('Kommt von Discord oder Twitch. Ein neues Bild siehst du nach deiner nächsten Anmeldung.')
    expect(page.find('input[type="file"]').attributes('accept')).toBe('image/*')
  })

  it('cuts the picked file to the centre of a 256 × 256 tile and sends the WebP as the raw body', async () => {
    const page = await mount()
    const file = new File(['x'], 'me.png', { type: 'image/png' })

    await pick(page, file)
    await vi.waitFor(() => expect(uploads).toHaveBeenCalled())

    expect(toCardWebp).toHaveBeenCalledWith(file, CENTRE_CROP, PROFILE_IMAGE_TARGET)
    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', bytes: [1, 2, 3, 4, 5] })
  })

  it('shows „Bild lädt hoch“ as a status and keeps the button inactive while the PUT is held', async () => {
    let release!: () => void
    holdUpload = new Promise<void>((resolve) => {
      release = resolve
    })
    const page = await mount()

    await pick(page)
    await flushPromises()

    expect(card(page).get('[role="status"]').text()).toBe('Bild lädt hoch')
    expect(uploadButton(page).attributes('aria-disabled')).toBe('true')
    release()
    await vi.waitFor(() => expect(card(page).find('[role="status"]').exists()).toBe(false))
    expect(uploadButton(page).attributes('aria-disabled')).toBeUndefined()
  })

  it('says the picture is being cut while it converts', async () => {
    let finish!: () => void
    toCardWebp.mockReturnValue(new Promise((resolve) => {
      finish = () => resolve({ blob: webp, width: 2000, height: 1000 })
    }))
    const page = await mount()

    await pick(page)
    await flushPromises()

    expect(card(page).get('[role="status"]').text()).toBe('Bild wird zugeschnitten …')
    finish()
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))
  })

  it('shows the answered address in the card and in the User, with no remount', async () => {
    const page = await mount()
    expect(cardPicture(page).attributes('src')).toBe(withPicture.image)

    await pick(page)
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))

    expect(useAuthUser().value?.image).toBe(uploaded)
    expect(useAuthUser().value?.displayName).toBe('Kitty')
  })

  it('shows the picture for a User who had only the initial', async () => {
    signInAs(kitty)
    const page = await mount()
    expect(cardPicture(page).exists()).toBe(false)

    await pick(page)
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))
  })

  it.each([
    ['413', { statusCode: 413, statusMessage: 'image_too_large' }],
    ['500', { statusCode: 500, statusMessage: 'Internal Server Error' }],
  ])('keeps the old picture and says so when the PUT fails with %s', async (_name, failure) => {
    uploadFailsWith = failure
    const page = await mount()

    await pick(page)
    await vi.waitFor(() => expect(card(page).text()).toContain('Das Bild hat nicht geklappt. Dein altes Bild bleibt.'))

    expect(cardPicture(page).attributes('src')).toBe(withPicture.image)
    expect(useAuthUser().value?.image).toBe(withPicture.image)
    expect(card(page).find('[role="status"]').exists()).toBe(false)
    expect(uploadButton(page).attributes('aria-disabled')).toBeUndefined()
  })

  it('says the browser cannot convert the file, sends nothing and keeps the old picture', async () => {
    toCardWebp.mockRejectedValue(new ImageConversionError())
    const page = await mount()

    await pick(page)
    await vi.waitFor(() => expect(card(page).text()).toContain('Dein Browser kann das Bild nicht umwandeln. Probier’s mit Chrome oder Firefox.'))
    expect(uploads).not.toHaveBeenCalled()
    expect(cardPicture(page).attributes('src')).toBe(withPicture.image)
    expect(uploadButton(page).attributes('aria-disabled')).toBeUndefined()
  })

  it('sends nothing when no file is picked', async () => {
    const page = await mount()

    await pick(page, null)
    await flushPromises()

    expect(toCardWebp).not.toHaveBeenCalled()
    expect(uploads).not.toHaveBeenCalled()
  })

  it('ignores a second pick while the first is on its way', async () => {
    let release!: () => void
    holdUpload = new Promise<void>((resolve) => {
      release = resolve
    })
    const page = await mount()

    await pick(page)
    await flushPromises()
    await pick(page, new File(['y'], 'other.png', { type: 'image/png' }))
    await flushPromises()
    release()
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))

    expect(toCardWebp).toHaveBeenCalledTimes(1)
    expect(uploads).toHaveBeenCalledTimes(1)
  })

  it('clears the notice with the next pick', async () => {
    uploadFailsWith = { statusCode: 500, statusMessage: 'Internal Server Error' }
    const page = await mount()
    await pick(page)
    await vi.waitFor(() => expect(card(page).text()).toContain('Das Bild hat nicht geklappt.'))

    uploadFailsWith = null
    await pick(page)
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))

    expect(card(page).text()).not.toContain('Das Bild hat nicht geklappt.')
  })
})
