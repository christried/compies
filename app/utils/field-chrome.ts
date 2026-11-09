/**
 * The surface and border of a text-like field (TextField, TagInput, the Price source select): invalid is the 3 px error
 * border (#362). One home, so a field that is typed in and a field that is picked from wear the same chrome.
 */
export function fieldBox(invalid: boolean): string {
  return invalid
    ? 'rounded-md bg-surface border-3 border-error-fg'
    : 'rounded-md bg-surface border-(length:--cp-bw) border-line'
}
