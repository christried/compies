CREATE TYPE "public"."message_deleter" AS ENUM('host', 'writer');--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"event_id" uuid NOT NULL,
	"writer_id" uuid NOT NULL,
	"text" text,
	"written_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	"deleted_by" "message_deleter",
	CONSTRAINT "messages_deleted_text_check" CHECK (("messages"."deleted_at" IS NULL) = ("messages"."text" IS NOT NULL)),
	CONSTRAINT "messages_deleted_pair_check" CHECK (("messages"."deleted_at" IS NULL) = ("messages"."deleted_by" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_writer_id_users_id_fk" FOREIGN KEY ("writer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "messages_event_id_written_at_idx" ON "messages" USING btree ("event_id","written_at");