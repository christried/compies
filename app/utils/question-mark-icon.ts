import { createLucideIcon } from '@lucide/vue'

// A bare „?“ for the hint (#616): the button is the circle already, so the glyph is lucide's circle-question-mark without its circle. The paths
// are that icon's (`M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3` and `M12 17h.01`) scaled 1.5 about (12, 12), so the mark fills the button's inside
// instead of looking tiny at 16 px.
export const QuestionMark = createLucideIcon('question-mark', [
  ['path', { d: 'M7.64 7.5a4.5 4.5 0 0 1 8.75 1.5c0 3-4.5 4.5-4.5 4.5' }],
  ['path', { d: 'M12 19.5h.01' }],
])
