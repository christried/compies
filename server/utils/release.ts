// package.json names the newest Release (test/unit/changelog-file.test.ts keeps it equal to CHANGELOG.md), so
// the server needs no changelog parser to know it. A named import keeps the rest of package.json out of the bundle.
import { version } from '../../package.json'

/** The newest Release: what a new User counts as seen (#184), and the newest version a User can mark as seen. */
export const CURRENT_RELEASE: string = version
