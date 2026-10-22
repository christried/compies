CREATE TYPE "public"."date_mode" AS ENUM('poll', 'direct');--> statement-breakpoint
CREATE TYPE "public"."member_zone" AS ENUM('bench', 'stands', 'team');--> statement-breakpoint
CREATE TYPE "public"."session_phase" AS ENUM('draft', 'poll', 'date_set', 'running', 'finished', 'archived');--> statement-breakpoint
CREATE TYPE "public"."vote_value" AS ENUM('yes', 'maybe', 'no');--> statement-breakpoint
CREATE TABLE "poll_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_slots_session_id_starts_at_unique" UNIQUE("session_id","starts_at")
);
--> statement-breakpoint
CREATE TABLE "poll_votes" (
	"slot_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"value" "vote_value" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "poll_votes_slot_id_user_id_pk" PRIMARY KEY("slot_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "session_members" (
	"session_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	"zone" "member_zone" DEFAULT 'bench' NOT NULL,
	CONSTRAINT "session_members_session_id_user_id_pk" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"invite_token" text NOT NULL,
	"host_id" uuid NOT NULL,
	"name" text NOT NULL,
	"phase" "session_phase" NOT NULL,
	"date_mode" date_mode NOT NULL,
	"starts_at" timestamp with time zone,
	"previous_starts_at" timestamp with time zone,
	"ics_sequence" integer DEFAULT 0 NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "sessions_invite_token_unique" UNIQUE("invite_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"display_name" text,
	"can_host" boolean DEFAULT false NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "poll_slots" ADD CONSTRAINT "poll_slots_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_slot_id_poll_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."poll_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "poll_votes" ADD CONSTRAINT "poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_members" ADD CONSTRAINT "session_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_host_id_users_id_fk" FOREIGN KEY ("host_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;