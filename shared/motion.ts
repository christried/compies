// What defines the device's Reduced motion (#680, GLOSSARY: Reduced motion).

/** The cookie that keeps a device's Reduced motion (#680): it exists only while the switch is on and holds only `reduced`. */
export const MOTION_COOKIE = 'compies-motion'

/** The one value the cookie holds, and the one `data-motion` is ever set to: `full` would override the device's own setting for script alone. */
export const MOTION_REDUCED = 'reduced'
