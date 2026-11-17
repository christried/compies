import { mountSuspended } from '@nuxt/test-utils/runtime'
import type { VueWrapper } from '@vue/test-utils'
import type { Editor } from '@tiptap/vue-3'
import { expect, vi } from 'vitest'
import RichNotesEditor from '~/components/RichNotesEditor.vue'
import type { NotesDoc } from '~~/shared/notes-doc'

// Drives the notes editor (#454) from a test: the component mounts its Tiptap editor on mount, and the helper waits for it. happy-dom has no layout, and
// ProseMirror asks a Range for its rectangles when it scrolls the caret into view and when the link control places its popover: the helper gives it empty ones.

type Props = Partial<InstanceType<typeof RichNotesEditor>['$props']>

let geometry = false
function ensureGeometry() {
  if (geometry) return
  geometry = true
  const rect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) })
  const range = Range.prototype as unknown as Record<string, unknown>
  range.getClientRects ??= () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} })
  range.getBoundingClientRect ??= rect
}

export type MountedEditor = VueWrapper & { values: (NotesDoc | null)[], invalids: boolean[] }

/** Mounts the editor as `v-model` binds it: what it emits comes back as `modelValue`, and every emitted value is kept in `values`. */
export async function mountEditor(props: Props = {}): Promise<MountedEditor> {
  ensureGeometry()
  const values: (NotesDoc | null)[] = []
  const invalids: boolean[] = []
  const page = await mountSuspended(RichNotesEditor, {
    props: {
      'modelValue': null,
      'onUpdate:modelValue': (value: NotesDoc | null) => {
        values.push(value)
        void page.setProps({ modelValue: value })
      },
      'onInvalid': (over: boolean) => void invalids.push(over),
      ...props,
    },
  })
  if (!props.readonly) await vi.waitFor(() => expect(page.find('[role="textbox"]').exists()).toBe(true))
  return Object.assign(page, { values, invalids })
}

export function editorOf(page: VueWrapper): Editor {
  return (page.vm as unknown as { editor: Editor }).editor
}

/** The content element: the one a User types in. */
export function contentOf(page: VueWrapper) {
  return page.get('[role="textbox"]')
}

export function toolbarButton(page: VueWrapper, label: string) {
  return page.get(`[role="toolbar"] button[aria-label="${label}"]`)
}

/** Types text into the editor at the caret, as the editor's own command does. */
export function type(page: VueWrapper, text: string) {
  editorOf(page).commands.insertContent(text)
}
