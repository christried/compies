// Ton: one switch per device, stored in this browser (05-assets § Sound cues), that the Clip's sound and the cue player (`useCuePlayer`, #531) read. Off means silence; nothing else changes.
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
