import type { Translate } from './settings-summary'

/**
 * What a viewer is shown of a person a read sent (#915, ADR 0020): a Deleted User reads „Gelöschtes Konto“ with no picture, the same
 * for every Deleted User; anybody else keeps their name and picture. The server cuts the name and the picture of a Deleted User
 * (`readPerson`), so the mark is what this goes by. The one home of the Deleted User's name on the client.
 */
export function shownPerson(person: { name: string, image?: string | null, deleted?: boolean }, t: Translate): { name: string, image: string | null, deleted: boolean } {
  if (person.deleted) return { name: t('common.deletedUser'), image: null, deleted: true }
  return { name: person.name, image: person.image ?? null, deleted: false }
}
