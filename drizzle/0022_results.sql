-- Release 0.8 (#273, spec #272): Results. `rounds` gets `number`, `result_at` and `corrected_at` (all nullable, with their checks and a unique (event_id, number)); the new table `round_places` holds a Round's Places and Scores; the Activity enum gets the three types of 0.8 (`result_entered`, `result_corrected`, `event_finished`) in this one migration (review 1.4 A6).
-- Switch-over (ADR 0007): the 0.7 code serves until the switch-over. It neither reads nor writes the new columns and the new table. It inserts and updates `rounds` without them (NULL passes every check: number and result_at are both NULL) and writes only the old Activity types. No Result exists before the new code serves, because only the new code writes one.
-- A 0.7 browser tab that stays open across the switch-over reads the new Event read, which lists no Round with a Result among the open ones, and drops a feed entry of a type it does not know (`readEntry`). A 0.7 tab's „Zurücklegen“ on a Round that has a Result is refused by the new server (`round_not_open`).
-- Postgres runs `ALTER TYPE … ADD VALUE` inside the migration's transaction only because nothing in this file uses the new values.
ALTER TYPE "public"."activity_type" ADD VALUE 'result_entered';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'result_corrected';--> statement-breakpoint
ALTER TYPE "public"."activity_type" ADD VALUE 'event_finished';--> statement-breakpoint
CREATE TABLE "round_places" (
	"round_id" uuid NOT NULL,
	"team" integer NOT NULL,
	"place" integer NOT NULL,
	"score" text,
	CONSTRAINT "round_places_round_id_team_pk" PRIMARY KEY("round_id","team"),
	CONSTRAINT "round_places_team_check" CHECK ("round_places"."team" >= 1),
	CONSTRAINT "round_places_place_check" CHECK ("round_places"."place" >= 1)
);
--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "result_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "rounds" ADD COLUMN "corrected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "round_places" ADD CONSTRAINT "round_places_round_id_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_event_id_number_unique" UNIQUE("event_id","number");--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_number_result_check" CHECK (("rounds"."number" IS NULL) = ("rounds"."result_at" IS NULL));--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_number_positive_check" CHECK ("rounds"."number" IS NULL OR "rounds"."number" >= 1);--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_result_stands_check" CHECK ("rounds"."result_at" IS NULL OR ("rounds"."set_at" IS NOT NULL AND "rounds"."put_back_at" IS NULL));--> statement-breakpoint
ALTER TABLE "rounds" ADD CONSTRAINT "rounds_corrected_after_result_check" CHECK ("rounds"."corrected_at" IS NULL OR "rounds"."result_at" IS NOT NULL);