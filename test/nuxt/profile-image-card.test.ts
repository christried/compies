import { mountSuspended, registerEndpoint } from '@nuxt/test-utils/runtime'
import { flushPromises, type VueWrapper } from '@vue/test-utils'
import { createError, getHeader, readRawBody } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ProfilePage from '~/pages/profil.vue'
import { ImageConversionError } from '~/utils/image-resize'
import { CENTRE_CROP, PROFILE_IMAGE_TARGET } from '~~/shared/image'
import { kitty, signInAs } from './auth'

// The picture row of the card „Profil“ (#678, #910): „Hochladen“ picks a file and opens the crop; „Speichern“ in the crop sends the WebP, and the new picture shows
// without a reload. The crop itself is profile-image-crop.test.ts's.

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

// The removal of the own picture (#911): DELETE answers the address shown now, the provider's, or null.
const removals = vi.fn()
let holdRemoval: Promise<void> | null = null
let removalFailsWith: { statusCode: number, statusMessage: string } | null = null
let removedTo: string | null = null
registerEndpoint('/api/me/image', {
  method: 'DELETE',
  handler: async () => {
    removals()
    if (holdRemoval) await holdRemoval
    if (removalFailsWith) throw createError(removalFailsWith)
    return { image: removedTo }
  },
})

const mount = () => mountSuspended(ProfilePage, { route: '/profil' })
const card = (page: VueWrapper) => page.get('section[aria-labelledby="profile-card-title"]')
const cardPicture = (page: VueWrapper) => page.find('section[aria-labelledby="profile-card-title"] img')
const uploadButton = (page: VueWrapper) => page.findAll('button').find(button => button.text() === 'Hochladen')!
const removeLink = (page: VueWrapper) => page.findAll('button').find(button => button.text() === 'Eigenes Bild entfernen')
const providerHint = 'Kommt von Discord oder Twitch. Ein neues Bild siehst du nach deiner nächsten Anmeldung.'
const ownHint = 'Dein eigenes Bild. Eine neue Anmeldung ändert es nicht.'
const ownPicture = { ...withPicture, image: uploaded, hasOwnImage: true }

// The crop's buttons sit in a group named „Profilbild“: the name form has a „Speichern“ too.
const saveImage = (page: VueWrapper) => card(page).get('[role="group"][aria-labelledby]').findAll('button').find(button => button.text() === 'Speichern')!
const cropOpen = (page: VueWrapper) => page.find('[data-crop-x]').exists()

async function pick(page: VueWrapper, file: File | null = new File(['x'], 'me.png', { type: 'image/png' })) {
  const input = page.get('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: file ? [file] : [], configurable: true })
  await input.trigger('change')
}

/** Picks a file, waits for the crop, and presses „Speichern“ in it. */
async function pickAndSave(page: VueWrapper, file?: File) {
  await pick(page, file)
  await vi.waitFor(() => expect(cropOpen(page)).toBe(true))
  await saveImage(page).trigger('click')
}

describe('uploading a Profile picture on the Profil page (#678)', () => {
  beforeEach(() => {
    signInAs(withPicture)
    uploads.mockClear()
    // The crop shows the picked file through an object URL (#910); a File is not a Blob of this runtime.
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:http://localhost/original')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    holdUpload = null
    uploadFailsWith = null
    removals.mockClear()
    holdRemoval = null
    removalFailsWith = null
    removedTo = null
    toCardWebp.mockReset()
    toCardWebp.mockResolvedValue({ blob: webp, width: 2000, height: 1000 })
  })

  it('shows „Hochladen“ beside the picture and leaves the hint as it was', async () => {
    const page = await mount()

    expect(uploadButton(page)).toBeDefined()
    expect(page.text()).toContain('Kommt von Discord oder Twitch. Ein neues Bild siehst du nach deiner nächsten Anmeldung.')
    expect(page.find('input[type="file"]').attributes('accept')).toBe('image/*')
  })

  it('cuts the picked file to the centre of a 256 × 256 tile, sends nothing, and sends the WebP as the raw body on „Speichern“', async () => {
    const page = await mount()
    const file = new File(['x'], 'me.png', { type: 'image/png' })

    await pick(page, file)
    await vi.waitFor(() => expect(cropOpen(page)).toBe(true))

    expect(toCardWebp).toHaveBeenCalledWith(file, CENTRE_CROP, PROFILE_IMAGE_TARGET)
    expect(uploads).not.toHaveBeenCalled()

    await saveImage(page).trigger('click')
    await vi.waitFor(() => expect(uploads).toHaveBeenCalled())

    expect(uploads).toHaveBeenCalledWith({ type: 'image/webp', bytes: [1, 2, 3, 4, 5] })
  })

  it('shows „Bild lädt hoch“ as a status and keeps the button inactive while the PUT is held', async () => {
    let release!: () => void
    holdUpload = new Promise<void>((resolve) => {
      release = resolve
    })
    const page = await mount()

    await pickAndSave(page)
    await vi.waitFor(() => expect(uploads).toHaveBeenCalled())
    await flushPromises()

    expect(card(page).get('[role="status"]').text()).toBe('Bild lädt hoch')
    expect(saveImage(page).attributes('aria-disabled')).toBe('true')
    release()
    await vi.waitFor(() => expect(card(page).find('[role="status"]').exists()).toBe(false))
    expect(cropOpen(page)).toBe(false)
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
    await vi.waitFor(() => expect(cropOpen(page)).toBe(true))
    expect(card(page).find('[role="status"]').exists()).toBe(false)
  })

  it('shows the answered address in the card and in the User, with no remount', async () => {
    const page = await mount()
    expect(cardPicture(page).attributes('src')).toBe(withPicture.image)

    await pickAndSave(page)
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))

    expect(cropOpen(page)).toBe(false)
    expect(useAuthUser().value?.image).toBe(uploaded)
    expect(useAuthUser().value?.hasOwnImage).toBe(true)
    expect(useAuthUser().value?.displayName).toBe('Kitty')
  })

  it('shows the picture for a User who had only the initial', async () => {
    signInAs(kitty)
    const page = await mount()
    expect(cardPicture(page).exists()).toBe(false)

    await pickAndSave(page)
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))
  })

  it.each([
    ['413', { statusCode: 413, statusMessage: 'image_too_large' }],
    ['500', { statusCode: 500, statusMessage: 'Internal Server Error' }],
  ])('keeps the old picture and the crop and says so when the PUT fails with %s', async (_name, failure) => {
    uploadFailsWith = failure
    const page = await mount()

    await pickAndSave(page)
    await vi.waitFor(() => expect(card(page).text()).toContain('Das Bild hat nicht geklappt. Dein altes Bild bleibt.'))

    expect(cropOpen(page)).toBe(true)
    expect(useAuthUser().value?.image).toBe(withPicture.image)
    expect(card(page).find('[role="status"]').exists()).toBe(false)
    expect(saveImage(page).attributes('aria-disabled')).toBeUndefined()

    await page.findAll('button').find(button => button.text() === 'Abbrechen')!.trigger('click')
    expect(cardPicture(page).attributes('src')).toBe(withPicture.image)
    expect(uploadButton(page).attributes('aria-disabled')).toBeUndefined()
  })

  it('says the browser cannot convert the file, sends nothing and keeps the old picture', async () => {
    toCardWebp.mockRejectedValue(new ImageConversionError())
    const page = await mount()

    await pick(page)
    await vi.waitFor(() => expect(card(page).text()).toContain('Dein Browser kann das Bild nicht umwandeln. Probier’s mit Chrome oder Firefox.'))
    expect(cropOpen(page)).toBe(false)
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

  it('ignores a second pick while the first converts: one conversion at the pick, one PUT after „Speichern“', async () => {
    let finish!: () => void
    toCardWebp.mockReturnValue(new Promise((resolve) => {
      finish = () => resolve({ blob: webp, width: 2000, height: 1000 })
    }))
    const page = await mount()

    await pick(page)
    await flushPromises()
    await pick(page, new File(['y'], 'other.png', { type: 'image/png' }))
    await flushPromises()
    finish()
    await vi.waitFor(() => expect(cropOpen(page)).toBe(true))
    await saveImage(page).trigger('click')
    await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(uploaded))

    expect(toCardWebp).toHaveBeenCalledTimes(1)
    expect(uploads).toHaveBeenCalledTimes(1)
  })

  it('clears the notice with the next pick', async () => {
    toCardWebp.mockRejectedValueOnce(new ImageConversionError())
    const page = await mount()
    await pick(page)
    await vi.waitFor(() => expect(card(page).text()).toContain('Dein Browser kann das Bild nicht umwandeln'))

    await pick(page)
    await vi.waitFor(() => expect(cropOpen(page)).toBe(true))

    expect(card(page).text()).not.toContain('Dein Browser kann das Bild nicht umwandeln')
  })

  describe('removing the own picture (#911)', () => {
    it('shows the link and the own hint only for a User with an uploaded picture', async () => {
      signInAs(ownPicture)
      const page = await mount()

      expect(removeLink(page)).toBeDefined()
      expect(card(page).text()).toContain(ownHint)
      expect(card(page).text()).not.toContain(providerHint)
    })

    it('has no link and the provider hint for a User without an upload', async () => {
      const page = await mount()

      expect(removeLink(page)).toBeUndefined()
      expect(card(page).text()).toContain(providerHint)
      expect(card(page).text()).not.toContain(ownHint)
    })

    it('shows the provider picture at once, with no reload, and drops the link and the own hint', async () => {
      removedTo = withPicture.image
      signInAs(ownPicture)
      const page = await mount()
      expect(cardPicture(page).attributes('src')).toBe(uploaded)

      await removeLink(page)!.trigger('click')
      await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(withPicture.image))

      expect(removals).toHaveBeenCalledTimes(1)
      expect(removeLink(page)).toBeUndefined()
      expect(card(page).text()).toContain(providerHint)
      expect(useAuthUser().value).toMatchObject({ image: withPicture.image, hasOwnImage: false })
    })

    it('shows the initial, not a picture, when the provider has none', async () => {
      removedTo = null
      signInAs({ ...ownPicture, image: null })
      const page = await mount()

      await removeLink(page)!.trigger('click')
      await vi.waitFor(() => expect(removeLink(page)).toBeUndefined())

      expect(cardPicture(page).exists()).toBe(false)
    })

    it('ignores a second click while the removal is on its way', async () => {
      let release!: () => void
      holdRemoval = new Promise<void>((resolve) => {
        release = resolve
      })
      removedTo = withPicture.image
      signInAs(ownPicture)
      const page = await mount()

      await removeLink(page)!.trigger('click')
      await flushPromises()
      expect(removeLink(page)!.attributes('aria-disabled')).toBe('true')
      await removeLink(page)!.trigger('click')
      release()
      await vi.waitFor(() => expect(cardPicture(page).attributes('src')).toBe(withPicture.image))

      expect(removals).toHaveBeenCalledTimes(1)
    })

    it('keeps the picture and the own hint and says so when the removal fails', async () => {
      removalFailsWith = { statusCode: 500, statusMessage: 'Internal Server Error' }
      signInAs(ownPicture)
      const page = await mount()

      await removeLink(page)!.trigger('click')
      await vi.waitFor(() => expect(card(page).text()).toContain('Das Bild konnte nicht entfernt werden. Dein eigenes Bild bleibt.'))

      expect(cardPicture(page).attributes('src')).toBe(uploaded)
      expect(card(page).text()).toContain(ownHint)
      expect(removeLink(page)!.attributes('aria-disabled')).toBeUndefined()
    })

    it('is disabled while a picked file converts, and gone while the crop is open', async () => {
      let finish!: () => void
      toCardWebp.mockReturnValue(new Promise((resolve) => {
        finish = () => resolve({ blob: webp, width: 2000, height: 1000 })
      }))
      signInAs(ownPicture)
      const page = await mount()

      await pick(page)
      await flushPromises()
      expect(removeLink(page)!.attributes('aria-disabled')).toBe('true')

      finish()
      await vi.waitFor(() => expect(cropOpen(page)).toBe(true))
      expect(removeLink(page)).toBeUndefined()
      expect(card(page).text()).not.toContain(ownHint)
    })
  })
})
