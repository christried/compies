-- Release 0.16 (#721, spec #717 § A, ADR 0018): the library splits per Host. For every pair (Host H, game G of someone else) that an Event H hosts refers to, H gets
-- one copy of G, and every reference of H's Events moves to the copy: `event_pool_games.game_id`, `rounds.game_id`, `draws.game_id`, every element of
-- `draws.slice_game_ids` and `activity.params->>'gameId'` of the six types that name a game (`game_drawn`, `vetoes_revealed`, `game_set`, `game_put_back`,
-- `result_entered`, `result_corrected`). A reference reaches its Host through its Event (`events.host_id`); a soft-deleted Event counts, and `users.can_host` is never read.
-- A copy carries name, image key (the same string, so the same object: no second upload, ADR 0018), Clip, player counts, Suitabilities, Game notes, Price with its day,
-- and the original's Tags (key, label, position, `created_at`); `created_by` is H, `created_at` and `updated_at` are the original's. A game of H's own is never copied,
-- also inside a slice list that mixes own and foreign games. One copy per pair, not per Event. The originals and every other row stay as they are, nothing is deleted.
-- One `DO` statement: no breakpoint inside, so it runs on one connection whatever the driver. A draw's `game_id` and its slice list move in one UPDATE, so
-- `draws_result_check` stays true; no constraint or index is dropped, disabled or recreated. An Activity entry that names an id no game has is left alone.
-- Data only, no schema change.
-- Switch-over (ADR 0007, spec #717 „The migration window“): the 0.15 code serves while the build migrates, so after this file ran it can still
--   (a) write a pool row of one Host for another Host's game (the schema takes it, and nothing here adds a constraint), and
--   (b) delete an image object that the copies share, since its image upload deletes the replaced image on every upload.
-- The window is minutes. The 0.16 readers do not name a game of another Host in a Game pool or on the wheel, and the operator's rehearsal and the staging
-- walk-through check the counts.
-- Needs the operator's approval for production (Release PR).
DO $$
DECLARE
  pair record;
  copy_id uuid;
BEGIN
  FOR pair IN
    SELECT DISTINCT refs.host_id, refs.game_id
    FROM (
      SELECT ev.host_id, pg.game_id
      FROM event_pool_games pg
      JOIN events ev ON ev.id = pg.event_id
      UNION
      SELECT ev.host_id, rd.game_id
      FROM rounds rd
      JOIN events ev ON ev.id = rd.event_id
      WHERE rd.game_id IS NOT NULL
      UNION
      SELECT ev.host_id, dr.game_id
      FROM draws dr
      JOIN rounds rd ON rd.id = dr.round_id
      JOIN events ev ON ev.id = rd.event_id
      UNION
      SELECT ev.host_id, slice.game_id
      FROM draws dr
      JOIN rounds rd ON rd.id = dr.round_id
      JOIN events ev ON ev.id = rd.event_id
      CROSS JOIN LATERAL unnest(dr.slice_game_ids) AS slice(game_id)
      UNION
      SELECT ev.host_id, gm.id
      FROM activity ac
      JOIN events ev ON ev.id = ac.event_id
      JOIN games gm ON gm.id::text = ac.params->>'gameId'
      WHERE ac.type IN ('game_drawn', 'vetoes_revealed', 'game_set', 'game_put_back', 'result_entered', 'result_corrected')
    ) refs
    JOIN games og ON og.id = refs.game_id
    WHERE og.created_by <> refs.host_id
  LOOP
    INSERT INTO games (name, image_key, youtube_id, clip_start, clip_length, players_min, players_max, suitabilities, notes, price_cents, price_source, price_checked_at, created_by, created_at, updated_at)
    SELECT name, image_key, youtube_id, clip_start, clip_length, players_min, players_max, suitabilities, notes, price_cents, price_source, price_checked_at, pair.host_id, created_at, updated_at
    FROM games
    WHERE id = pair.game_id
    RETURNING id INTO copy_id;

    INSERT INTO game_tags (game_id, key, label, position, created_at)
    SELECT copy_id, key, label, position, created_at
    FROM game_tags
    WHERE game_id = pair.game_id;

    UPDATE event_pool_games pg
    SET game_id = copy_id
    FROM events ev
    WHERE ev.id = pg.event_id AND ev.host_id = pair.host_id AND pg.game_id = pair.game_id;

    UPDATE rounds rd
    SET game_id = copy_id
    FROM events ev
    WHERE ev.id = rd.event_id AND ev.host_id = pair.host_id AND rd.game_id = pair.game_id;

    UPDATE draws dr
    SET game_id = CASE WHEN dr.game_id = pair.game_id THEN copy_id ELSE dr.game_id END,
        slice_game_ids = array_replace(dr.slice_game_ids, pair.game_id, copy_id)
    FROM rounds rd
    JOIN events ev ON ev.id = rd.event_id
    WHERE rd.id = dr.round_id
      AND ev.host_id = pair.host_id
      AND (dr.game_id = pair.game_id OR pair.game_id = ANY (dr.slice_game_ids));

    UPDATE activity ac
    SET params = jsonb_set(ac.params, '{gameId}', to_jsonb(copy_id::text))
    FROM events ev
    WHERE ev.id = ac.event_id
      AND ev.host_id = pair.host_id
      AND ac.type IN ('game_drawn', 'vetoes_revealed', 'game_set', 'game_put_back', 'result_entered', 'result_corrected')
      AND ac.params->>'gameId' = pair.game_id::text;
  END LOOP;
END
$$;
