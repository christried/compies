import type { EmoteId } from '~~/shared/emote'

/**
 * The picture of each Emote (#668): the sticker art of `docs/design_handoff_compies/reference/assets/emotes/`, served from `public/emotes/`. It is drawn
 * as an `<img>`, never inlined: each file reuses the ids `disc` and a clip id of its own, which would clash in one document, and an `<img>` runs no
 * script (`test/unit/emote-art.test.ts` keeps the files free of anything active).
 */
export const EMOTE_PICTURE: Record<EmoteId, string> = {
  clap: '/emotes/emote-klatschen.svg',
  tears: '/emotes/emote-freudentraenen.svg',
  angry: '/emotes/emote-wuetend.svg',
  roar: '/emotes/emote-bruellen.svg',
}
