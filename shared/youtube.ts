// YouTube links of the Game library (#141): the video id behind whatever link a Host pastes, and the
// still image YouTube keeps for it. Pure, so the form (live link check) and the server (the stored id) agree.

const VIDEO_ID = /^[\w-]{11}$/
const HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com', 'www.youtube-nocookie.com',
])
/** Path prefixes whose next segment is the video id. */
const ID_PREFIXES = new Set(['shorts', 'embed', 'live'])

/** The video id of a YouTube watch, youtu.be, shorts, embed or live link; null for anything else. */
export function parseYouTubeId(raw: string): string | null {
  const text = raw.trim()
  if (!text) return null
  let url: URL
  try {
    url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(text) ? text : `https://${text}`)
  }
  catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
  if (!HOSTS.has(url.hostname.toLowerCase())) return null

  const segments = url.pathname.split('/').filter(Boolean)
  let id: string | null | undefined = null
  if (url.hostname.toLowerCase() === 'youtu.be') {
    id = segments.length === 1 ? segments[0] : null
  }
  else if (segments.length === 1 && segments[0] === 'watch') {
    id = url.searchParams.get('v')
  }
  else if (segments.length === 2 && ID_PREFIXES.has(segments[0]!)) {
    id = segments[1]
  }
  return id && VIDEO_ID.test(id) ? id : null
}

/** The thumbnail YouTube serves for a video; the library card's cover when a game has no image. */
export function youTubeThumbnail(id: string): string {
  return `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
}
