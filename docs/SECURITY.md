# Jawla security check (M8)

Date: 2026-11-17. Method: OWASP review (owasp-security skill) of `supabase/migrations`, `supabase/functions` and `quiz-app/src`, Supabase security advisors, live checks against the API with the public key, and `npm audit`.

**Result: no Critical or High findings.**

## Findings and what was done

| # | Severity | Finding | Status |
|---|----------|---------|--------|
| 1 | Medium | One paid game never ended: `draw_question` kept giving questions to an old game, so one credit could cover many evenings. | **Fixed** (`20261118120000_m8_hardening.sql`): a game stops giving questions after 6 hours or 100 questions. Tested: old game refused, full game refused, fresh game works. |
| 2 | Medium | The GitHub repo is public, and the sample question bank (with answers) is in `20261115120100_m3_seed_bank.sql`. | **Fixed going forward**: the real bank lives in git-ignored CSV files in `supabase/questions/` and is loaded with `supabase/scripts/questions-to-sql.mjs` (see the README there). The 180 public questions are flagged `is_sample` and are switched off with `--retire-samples` once the real bank is loaded. They stay in git history, so they must never be reused as real questions. |
| 3 | Low | The payment return link accepted any `exp://` address (open redirect through our trusted Supabase link). | **Fixed**: only `jawla://payment`, Expo Go on a private network / `exp.direct` tunnel, and localhost web dev are accepted. `create-payment` redeployed. |
| 4 | Low | The "5 pending orders per 10 minutes" limit could be passed with many requests at the same moment. | **Fixed**: per-user lock in `create_order`. |
| 5 | Low | The webhook does not check MyFatoorah's signature. Fake webhooks still cannot add credit (every payment is re-checked with MyFatoorah), but they can waste API calls. | Open: add the signature check once the webhook is registered in the MyFatoorah portal and `MYFATOORAH_WEBHOOK_SECRET` is set. |
| 6 | Low | Leaked-password protection (HaveIBeenPwned) is off (advisor WARN). | Open: dashboard → Authentication → enable "Prevent use of leaked passwords" (needs the Pro plan). |
| 7 | Low | No email/SMS verification, so someone could register another person's number first. | Accepted in the PRD (no SMS step in v1). |
| 8 | Low | Team-photo bucket has a 2 MB limit per file but no limit per account. | Open, low risk (own folder only, images only). |
| 9 | Info | `npm audit`: 3 moderate in `minimatch` inside `@expo/fingerprint` (build tool, not shipped in the app). | No action. |
| 10 | Info | The device reports the winner (`finish_game`). | Accepted: it only affects the player's own history; no leaderboard. |
| 11 | Info | `.env.example` named the payment secret `MYFATOORAH_API_TOKEN`; the code reads `MYFATOORAH_API_KEY`. | **Fixed** in `.env.example`. |
| 12 | Info | Advisor: `questions` has RLS on with no policies. | By design: nobody reads the table directly; questions come out one at a time through `draw_question`. Comment added on the table. |

## Live checks (with the public app key, not signed in)

- `private` schema is not exposed by the API (PGRST106). ✓
- Reading `questions` directly: permission denied. ✓
- Calling `draw_question` or `create_order` without signing in: permission denied. ✓
- `create-payment` without a sign-in token: 401. ✓

## Backend-truth checklist

- [x] Price is set on the server (`game_price_fils`, 1000 fils); the app never sends an amount.
- [x] Payments are verified by the server with MyFatoorah (`getPaymentStatus`), never by the app or the browser link.
- [x] Credit is added once, only when invoice + order + amount match (atomic pending → paid).
- [x] Questions are picked on the server, one at a time, and never repeat for an account (primary key on user + question).
- [x] Starting a game takes one credit atomically on the server; a game now has a 6-hour / 100-question limit.
- [x] RLS on every table; `games_credit` cannot be changed by the user.
- [x] Only the Supabase publishable key is in the app; secrets are in Supabase secrets or untracked `.env.local`.
- [x] No secrets in tracked files or git history.

## Monitoring (Sentry)

`@sentry/react-native` is set up in `quiz-app/src/lib/monitoring.ts`. It reports app crashes and failed server calls (start game, draw question, buy game, verify payment). It is off until `EXPO_PUBLIC_SENTRY_DSN` is set in `quiz-app/.env.local`. Privacy: no emails, phone numbers, IP addresses or screenshots are sent, only an anonymous account id. In Expo Go only JavaScript errors are reported (native crash reports need a development build).
