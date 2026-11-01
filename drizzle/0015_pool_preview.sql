ALTER TABLE "events" ADD COLUMN "pool_preview" boolean;--> statement-breakpoint
-- Pool preview (#225): Events that are set up keep what they showed (a Hidden wheel hid the pools, everything else showed them); Events not set up stay null.
UPDATE "events" SET "pool_preview" = NOT COALESCE("hidden_wheel", true) WHERE "selection_mode" IS NOT NULL;
