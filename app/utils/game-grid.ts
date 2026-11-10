// The grid the game tiles sit in (#435): as many columns as the container fits, at least 170 px each, so the tiles lay out
// side by side by container width on a phone and from md up, without a media query. Tailwind compiles the class names from
// this file (`app/**`), so a component takes the whole string.
export const GAME_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3'
