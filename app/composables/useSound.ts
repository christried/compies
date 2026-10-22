// Global mute, persisted per device (05-assets § Sound cues). The MVP plays no sounds yet;
// the toggle ships now so it exists when the first cue arrives.
const STORAGE_KEY = 'compies-sound'

export function useSound() {
  const enabled = useState('sound-enabled', () => true)

  onMounted(() => {
    try {
      enabled.value = localStorage.getItem(STORAGE_KEY) !== 'off'
    }
    catch {
      // Storage blocked: keep the default.
    }
  })

  function toggle() {
    enabled.value = !enabled.value
    try {
      localStorage.setItem(STORAGE_KEY, enabled.value ? 'on' : 'off')
    }
    catch {
      // Storage blocked: the choice lasts until reload.
    }
  }

  return { enabled: readonly(enabled), toggle }
}
