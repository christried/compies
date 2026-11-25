-- Release 0.21 (#678, spec #907): a User's uploaded Profile picture, `users.profile_image_key` (null = none), the key of the object in the image store.
-- A unique index, because the image route looks a User up by the key it is asked for; null keys do not collide.
-- Switch-over (ADR 0007): the code that serves until the switch-over inserts and updates `users` with explicit columns (Better Auth's insert and its
-- sign-in update) and never names `profile_image_key`, so a nullable column without a default keeps working for it, and a row it updates keeps its key.
-- Only the new route writes the column, so no User has an uploaded picture before the new code serves. No data migration.
ALTER TABLE "users" ADD COLUMN "profile_image_key" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_profile_image_key_idx" ON "users" USING btree ("profile_image_key");
