/** The Tour's current version (#646, GLOSSARY: Tour): a User's stored number says which version they last saw, 0 for never. */
export const TOUR_VERSION = 1

/**
 * A version a client reports as seen: a whole number from 1 up to the current Tour, else null. Above the current
 * version only a client built for a newer Tour sends one, and its save failing means the Tour shows again (#646).
 */
export function parseTourVersion(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isInteger(raw) && raw >= 1 && raw <= TOUR_VERSION ? raw : null
}
