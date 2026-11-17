-- Security follow-ups after the M8 audit (docs/SECURITY.md, "Follow-ups").
--
-- Advisors (2026-11-17): security = only "questions has RLS but no policies" (by design) and
-- "leaked password protection off" (dashboard setting). Performance = only "unused index
-- seen_questions_question_idx": kept on purpose, it is the index for the foreign key to
-- questions (used when a question is deleted, cascade). Every function already has
-- search_path = '' and every policy already uses (select auth.uid()). Nothing to change there.
--
-- Finding #8: team photos had a 2 MB limit per file but no limit per account.
-- New rule: at most 40 uploads per account in any 24 hours (a game uses at most 2).
-- The count only sees the user's own folder (the read-own policy), which is exactly what we want.

drop policy if exists "team-photos: upload own" on storage.objects;

create policy "team-photos: upload own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'team-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and (
      select count(*)
        from storage.objects o
       where o.bucket_id = 'team-photos'
         and (storage.foldername(o.name))[1] = (select auth.uid())::text
         and o.created_at > now() - interval '24 hours'
    ) < 40
  );
