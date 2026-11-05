import { teamName } from '~/utils/board'
import { freshResult, marksOf, rankMoves, type StandingsNews } from '~/utils/standings-news'
import type { EventView } from '~~/shared/event'
import { winnersOf } from '~~/shared/results'
import type { StandingView } from '~~/shared/stage'

/** How long the celebration of a Result lasts (04-motion § Leaderboard: 4 s); the pills and the stamp leave then. */
const NEWS_MS = 4000

/**
 * The page's one „what is new“ for the Standings (#276, spec #272, rules in standings-news.ts). It keeps the baseline of the Event the page last
 * read; every later read is compared with it, and a Result the page has not seen makes one news, which clears itself after 4 s. The Event page
 * calls it once: the stage block is created by the first Result, and the side panel and the stage hold two Leaderboards, so none of them can
 * be the owner of „last seen“ (they read `news`). Nothing here is sent or timed on the server (ADR 0013): „newer than the page saw“ is
 * decided from the Event read.
 *
 * Calm cases, where the baseline still moves on: the first read (a load, a reload, a new slug), a tab nobody is watching, a finished Event
 * (its page is calm) and an Event without Standings (not set up).
 */
export function useStandingsNews(data: Readonly<Ref<EventView | null | undefined>>, slug: MaybeRefOrGetter<string>) {
  const { t } = useI18n()
  const news = shallowRef<StandingsNews | null>(null)
  // Not reactive: the baseline decides nothing on screen, only the next comparison.
  let baseline: { marks: Map<string, string>, standings: StandingView[] | null } | null = null
  let counter = 0
  let timer: ReturnType<typeof setTimeout> | undefined

  function clearTimer() {
    clearTimeout(timer)
    timer = undefined
  }
  onScopeDispose(clearTimer)

  // Created before the data watcher: when both change in one tick the reset comes first.
  watch(() => toValue(slug), () => {
    baseline = null
    clearTimer()
    news.value = null
  })

  function announce(view: EventView, kind: StandingsNews['kind'], number: number, before: StandingView[]): string {
    const nameOf = (team: number) => teamName(view.teams.find(item => item.position === team) ?? team, t)
    const moves = rankMoves(before, view.standings ?? [])
    return [
      t(kind === 'entered' ? 'table.announceSaved' : 'table.announceCorrected', { n: number }),
      ...moves.filter(move => move.to === 1).map(move => t('table.takesFirst', { team: nameOf(move.team) })),
      ...moves.filter(move => move.to !== 1).map(move => t('table.rankNow', { team: nameOf(move.team), rank: move.to })),
    ].join(' ')
  }

  watch(data, (view) => {
    if (!view) return
    const previous = baseline
    baseline = { marks: marksOf(view.results), standings: view.standings }
    if (!previous || !view.standings || view.event.phase === 'finished') return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    const fresh = freshResult(previous.marks, view.results)
    if (!fresh) return

    // The page saw no Standings yet (the Event was not set up): every Party starts at 0 on rank 1.
    const before = previous.standings ?? view.standings.map(standing => ({ team: standing.team, rank: 1, points: 0 }))
    clearTimer()
    news.value = {
      key: ++counter,
      kind: fresh.kind,
      roundId: fresh.result.roundId,
      number: fresh.result.number,
      before,
      winners: winnersOf(fresh.result.places),
      at: Date.now(),
      announcement: announce(view, fresh.kind, fresh.result.number, before),
    }
    timer = setTimeout(() => {
      news.value = null
      timer = undefined
    }, NEWS_MS)
  }, { immediate: true })

  const exposed: Readonly<Ref<StandingsNews | null>> = news
  return { news: exposed }
}
