const german = new Intl.ListFormat('de', { style: 'long', type: 'conjunction' })

/** Names as one German sentence part (#274): „A“, „A und B“, „A, B und C“. The one home of the list format; the Share image model uses it too (#313). */
export function joinNames(names: readonly string[]): string {
  return german.format(names)
}
