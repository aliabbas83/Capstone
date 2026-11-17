-- M9 fix: keep pg_net out of the public schema (security advisor 0014).
-- pg_net cannot be moved with ALTER EXTENSION, so it is recreated in "extensions".
-- Its functions stay in the "net" schema, so the cron job (net.http_post) is unchanged.
drop extension if exists pg_net;
create extension pg_net with schema extensions;
