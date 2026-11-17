-- The question bank is never read directly: questions come out one at a time through
-- private.draw_question (security definer). RLS was already on with no policies, which
-- denies everything; this policy says the same thing out loud so the security advisor
-- (rls_enabled_no_policy) and future readers see it is on purpose.
create policy "questions: no direct access"
  on public.questions
  as restrictive
  for all
  to anon, authenticated
  using (false)
  with check (false);

comment on table public.questions is
  'Question bank. No direct access (restrictive deny policy); read only via private.draw_question.';
