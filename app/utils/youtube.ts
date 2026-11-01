// The YouTube IFrame Player API, loaded once per page (#141 the clip preview, #230 the synced clip). Client only. Just what we call of it.

export interface YouTubePlayer {
  getDuration: () => number
  getCurrentTime: () => number
  getPlayerState: () => number
  cueVideoById: (options: { videoId: string, startSeconds: number, endSeconds: number }) => void
  loadVideoById: (options: { videoId: string, startSeconds: number, endSeconds?: number }) => void
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  mute: () => void
  unMute: () => void
  playVideo: () => void
  stopVideo: () => void
  destroy: () => void
}

export interface YouTubePlayerOptions {
  videoId: string
  host: string
  playerVars: Record<string, number>
  events: {
    onReady?: () => void
    onStateChange?: (event: { data: number }) => void
    onError?: () => void
    /** The browser blocked autoplay (with sound); the player stays paused. */
    onAutoplayBlocked?: () => void
  }
}

export interface YouTubeApi {
  Player: new (element: HTMLElement, options: YouTubePlayerOptions) => YouTubePlayer
  /** The player states `onStateChange` reports and `getPlayerState` returns. */
  PlayerState?: { PLAYING: number }
}

declare global {
  interface Window {
    YT?: YouTubeApi
    onYouTubeIframeAPIReady?: () => void
  }
}

/** The privacy-enhanced domain both players load the embed from (Datenschutzerklärung: youtube-nocookie.com). */
export const YOUTUBE_HOST = 'https://www.youtube-nocookie.com'

/** `PlayerState.PLAYING`, for the places that run before the API object has it (a test's stub has none). */
export const YOUTUBE_PLAYING = 1

let apiLoad: Promise<YouTubeApi> | null = null

/** The IFrame API, loaded once per page. Rejects when the script cannot load, so a later player can try again. */
export function loadYouTubeApi(): Promise<YouTubeApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT)
  apiLoad ??= new Promise<YouTubeApi>((resolve, reject) => {
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT!)
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.onerror = () => {
      apiLoad = null
      script.remove()
      reject(new Error('YouTube IFrame API did not load'))
    }
    document.head.append(script)
  })
  return apiLoad
}
