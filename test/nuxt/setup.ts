import { config, type VueWrapper } from '@vue/test-utils'
import { afterEach } from 'vitest'

// Every component a test mounts is unmounted after that test, so its intervals and listeners stop with it.
// mountSuspended leaves its components mounted until the file ends, and an Event page's 15 s poll (usePollRefresh)
// then fired after the test environment was gone: CI failed on `staging` with „document is not defined“ (retro 0.7).
// Only root wrappers can unmount; Vue Test Utils gives those, and only those, their app as `__app`. A test that
// unmounted its component already is left alone, because a second unmount makes Vue warn.
const roots: VueWrapper[] = []

config.plugins.VueWrapper.install((wrapper) => {
  if (Reflect.get(wrapper, '__app')) roots.push(wrapper)
  return {}
})

afterEach(() => {
  for (const wrapper of roots.splice(0)) {
    if (!wrapper.vm.$.isUnmounted) wrapper.unmount()
  }
})
