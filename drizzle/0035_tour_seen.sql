-- Release 0.15 (#646, spec #622): the Tour a User has seen (GLOSSARY: Tour). `users` gets `tour_seen_version` (integer, NOT NULL, default 0): the version of the Tour the
-- User last saw, 0 for never. Existing Users get 0, so everyone gets the Tour once. No index (nothing filters on it), no CHECK, no data migration and no backfill.
-- Switch-over (ADR 0007): the code that serves until the switch-over inserts and updates `users` with explicit columns and never names `tour_seen_version`: a User it
-- creates, by Better Auth's insert or the dev sign-in, gets the default 0 and sees the Tour, which is right, and its UPDATEs keep the value.
ALTER TABLE "users" ADD COLUMN "tour_seen_version" integer DEFAULT 0 NOT NULL;
