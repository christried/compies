-- Release 0.22 (#697, spec #894): the Host removes a Member from an Event. The Activity enum gets the type `member_removed`; no table changes and no data migration.
-- Switch-over (ADR 0007): the 0.21 code serves until the switch-over and never writes the value, so an added enum value breaks nothing. A 0.21 browser tab that stays open across the switch-over drops an entry of a type it does not know (`readEntry`).
-- Postgres runs `ALTER TYPE … ADD VALUE` inside the migration's transaction only because nothing in this file uses the new value.
ALTER TYPE "public"."activity_type" ADD VALUE 'member_removed';
