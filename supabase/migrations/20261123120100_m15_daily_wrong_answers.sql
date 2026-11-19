-- New questions arrive every day at 00:00 UTC (refill-questions). Twenty minutes later, write
-- wrong answers for any text question that does not have one yet (asked for by the owner).
-- Same pattern as the refill job: the Vault token `refill_token` is the only way in.
select cron.schedule(
  'seed-wrong-answers-daily',
  '20 0 * * *',
  $cron$
  select net.http_post(
    url := 'https://mqpzimmvnnzcoyfuqnbe.supabase.co/functions/v1/seed-wrong-answers',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-refill-token', (select decrypted_secret from vault.decrypted_secrets where name = 'refill_token')),
    body := '{"limit": 120}'::jsonb,
    timeout_milliseconds := 148000);
  $cron$
);
