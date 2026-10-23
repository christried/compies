ALTER TYPE "public"."session_phase" RENAME TO "event_phase";--> statement-breakpoint
ALTER TABLE "sessions" RENAME TO "events";--> statement-breakpoint
ALTER INDEX "sessions_pkey" RENAME TO "events_pkey";--> statement-breakpoint
ALTER TABLE "events" RENAME CONSTRAINT "sessions_slug_unique" TO "events_slug_unique";--> statement-breakpoint
ALTER TABLE "events" RENAME CONSTRAINT "sessions_invite_token_unique" TO "events_invite_token_unique";--> statement-breakpoint
ALTER TABLE "events" RENAME CONSTRAINT "sessions_host_id_users_id_fk" TO "events_host_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "session_members" RENAME TO "event_members";--> statement-breakpoint
ALTER TABLE "event_members" RENAME COLUMN "session_id" TO "event_id";--> statement-breakpoint
ALTER TABLE "event_members" RENAME CONSTRAINT "session_members_session_id_user_id_pk" TO "event_members_event_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "event_members" RENAME CONSTRAINT "session_members_session_id_sessions_id_fk" TO "event_members_event_id_events_id_fk";--> statement-breakpoint
ALTER TABLE "event_members" RENAME CONSTRAINT "session_members_user_id_users_id_fk" TO "event_members_user_id_users_id_fk";--> statement-breakpoint
ALTER TABLE "poll_slots" RENAME COLUMN "session_id" TO "event_id";--> statement-breakpoint
ALTER TABLE "poll_slots" RENAME CONSTRAINT "poll_slots_session_id_starts_at_unique" TO "poll_slots_event_id_starts_at_unique";--> statement-breakpoint
ALTER TABLE "poll_slots" RENAME CONSTRAINT "poll_slots_session_id_sessions_id_fk" TO "poll_slots_event_id_events_id_fk";
