-- The 180 starter questions are in git (public repo), so their answers are public.
-- Mark them as samples so they can be switched off once the real bank (kept out of git,
-- see supabase/questions/README.md) is loaded with: questions-to-sql.mjs --retire-samples
alter table public.questions add column is_sample boolean not null default false;
update public.questions set is_sample = true;
