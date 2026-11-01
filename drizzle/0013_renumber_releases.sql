-- Release 0.5.1 renumbers every Release 1.N.p to 0.(N+1).p (#220): each User's „Was ist neu“ version follows. Null and
-- versions outside the map stay as they are.
UPDATE "users" SET "news_seen_version" = CASE "news_seen_version"
  WHEN '1.0.0' THEN '0.1.0'
  WHEN '1.1.0' THEN '0.2.0'
  WHEN '1.1.1' THEN '0.2.1'
  WHEN '1.1.2' THEN '0.2.2'
  WHEN '1.2.0' THEN '0.3.0'
  WHEN '1.3.0' THEN '0.4.0'
  WHEN '1.4.0' THEN '0.5.0'
END
WHERE "news_seen_version" IN ('1.0.0', '1.1.0', '1.1.1', '1.1.2', '1.2.0', '1.3.0', '1.4.0');
