-- Deliberately failing migration to test the deploy pipeline (#4). Reverted right after.
ALTER TABLE "deploy_failure_test_missing_table" ADD COLUMN "x" integer;
