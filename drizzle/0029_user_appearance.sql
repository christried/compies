-- Release 0.11 (#401, spec #398): a User's Appearance (GLOSSARY: Appearance). `users` gets `appearance` (text: `light`, `dark` or `system`), not null,
-- default `light`, with a CHECK. Every existing User gets `light` from the default: a constant default, so no table rewrite and nothing to backfill.
-- No index: nothing filters or joins on it.
-- Switch-over (ADR 0007): the 0.10.1 code serves until the switch-over. It reads users through its own `userColumns`, which do not name the column,
-- and writes users with explicit columns: Better Auth's insert at a first sign-in, `syncPermissions`, profile setup, „Was ist neu“, the dev
-- sign-in's upsert. A User it creates gets `light` from the default, which passes the CHECK; a User it updates keeps their Appearance, since no
-- UPDATE names the column. Nobody can choose another value before 0.11 ships anyway. An old browser tab that calls the new `GET /api/me` gets one
-- more key and ignores it.
ALTER TABLE "users" ADD COLUMN "appearance" text DEFAULT 'light' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_appearance_check" CHECK ("users"."appearance" IN ('light', 'dark', 'system'));