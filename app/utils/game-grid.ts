// The grid the game tiles sit in (#435): as many columns as the container fits, at least 142 px each, so the tiles lay out
// side by side by container width on a phone and from md up, without a media query. 142 px (#491) is the narrowest track a
// grid with tiles has at 390 px: the „Zuletzt gezogen“ card's tile, where the card hugs it from 324 px of width up (#585: (324 − 40) / 2). Tailwind compiles the class names from
// this file (`app/**`), so a component takes the whole string.
export const GAME_GRID = 'grid grid-cols-[repeat(auto-fill,minmax(142px,1fr))] gap-3'
