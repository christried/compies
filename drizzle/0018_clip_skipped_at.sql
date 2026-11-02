-- Synced clip (0.7, #230): when the Host skipped a draw's clip for everyone. A new nullable column: the previous deployment, which serves until the switch-over (ADR 0007), neither reads nor writes it, so nothing here needs a second step.
ALTER TABLE "draws" ADD COLUMN "clip_skipped_at" timestamp with time zone;
