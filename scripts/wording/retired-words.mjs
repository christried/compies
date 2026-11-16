// The words of GLOSSARY.md (#175). A UI word the glossary replaces goes into RETIRED with its successor
// (docs/agents/domain.md), so neither the copy nor the changelog falls back to it. This is the one home of the list (#628):
// test/unit/copy.test.ts reads it for the copy and the Unreleased lines, and the wording review's check of a typed replacement
// (check-replacement.mjs) warns of a retired word. A word is retired when a text includes it, case-sensitive.

/** @type {Record<string, string>} word to successor */
export const RETIRED = {
  'Lucky Wheel': 'Glücksrad',
  'Admin-Wahl': 'Host-Wahl',
  'Passende Formate': 'Passt zu',
  'Tiebreaker': 'Unentschieden',
  'Lobby': 'Event',
  'Bench': 'Tribüne',
  'Zuschauer': 'Tribüne',
}
