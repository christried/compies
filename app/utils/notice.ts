// The look of an inline notice (#172), shared by NoticeBanner and the info sheet's „Achtung“ so it lives once. The
// four tones are info, warning (Hinweis), critical (Kritisch) and success. Each background is a pale mix of the
// tone's token on the surface (compies-theme.css), so the notice stands out from the dotted page in both themes.

export type NoticeTone = 'info' | 'warning' | 'critical' | 'success'

const TINT: Record<NoticeTone, string> = {
  info: 'bg-info-tint',
  warning: 'bg-warning-tint',
  critical: 'bg-error-tint',
  success: 'bg-success-tint',
}

const CHIP: Record<NoticeTone, string> = {
  info: 'bg-info text-ink',
  warning: 'bg-warning text-on-warning',
  critical: 'bg-error text-on-error',
  success: 'bg-success text-on-success',
}

/** The box of a notice: its corners, its border and its tint. The caller adds padding and layout. */
export function noticeClasses(tone: NoticeTone): string {
  return `rounded-[12px] border-2 border-line ${TINT[tone]}`
}

/** The round chip that holds a notice's icon. */
export function noticeChipClasses(tone: NoticeTone): string {
  return `grid size-7 flex-none place-items-center rounded-pill border-2 border-line ${CHIP[tone]}`
}
