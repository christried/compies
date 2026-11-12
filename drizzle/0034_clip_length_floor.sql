-- Release 0.13.0 (#507, spec #501 § Clip length): a Clip is 10 to 120 s, default 30 (it was 5 to 60). Data only, no schema change: a game whose clip is
-- shorter than 10 s gets 10 s from the same start (`clip_start` stays). The column gets no CHECK.
-- Switch-over (ADR 0007): the code that serves until the switch-over accepts 5 to 60 s, so it can still store a clip of 5 to 9 s after this migration ran
-- (a new game, or an edit). That row is legal: the new code reads the stored length without a bound, the clip plays that length, its Veto window is that
-- length plus 30 s, and the form refuses to save the game until the Host sets 10 to 120 s. A CHECK would fail the old code's write.
UPDATE "games" SET "clip_length" = 10 WHERE "clip_length" < 10;
