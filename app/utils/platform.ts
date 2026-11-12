/** Whether a user agent string names an Apple platform, where the save shortcut is ⌘ (#465). */
export function isApplePlatform(userAgent: string): boolean {
  return /Macintosh|iPhone|iPad|iPod/.test(userAgent)
}
