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
| 5 | Low | The webhook does not check MyFatoorah's signature. Fake webhooks still cannot add credit (every payment is re-checked with MyFatoorah), but they can waste API calls. | **Fixed in code** (see Follow-ups): signature checked when `MYFATOORAH_WEBHOOK_SECRET` is set. |
| 6 | Low | Leaked-password protection (HaveIBeenPwned) is off (advisor WARN). | Open: the Supabase org is on the free plan and this switch needs Pro. Until then the server's own rule applies (8+ characters with letters and digits). If the plan is upgraded: dashboard → Authentication → enable "Prevent use of leaked passwords". |
| 7 | Low | No email/SMS verification, so someone could register another person's number first. | Accepted in the PRD (no SMS step in v1). |
| 8 | Low | Team-photo bucket has a 2 MB limit per file but no limit per account. | **Fixed** (see Follow-ups): max 40 uploads per account per 24 hours. |
| 9 | Info | `npm audit`: 3 moderate in `minimatch` inside `@expo/fingerprint` (build tool, not shipped in the app). | No action. |
| 10 | Info | The device reports the winner (`finish_game`). | Accepted: it only affects the player's own history; no leaderboard. |
| 11 | Info | `.env.example` named the payment secret `MYFATOORAH_API_TOKEN`; the code reads `MYFATOORAH_API_KEY`. | **Fixed** in `.env.example`. |
| 12 | Info | Advisor: `questions` has RLS on with no policies. | **Fixed** (`20261120120000_questions_no_direct_access.sql`): an explicit restrictive deny-all policy says out loud what was already true. Nobody reads the table directly; questions come out one at a time through `draw_question`. Advisor note cleared. |

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

Connected 2026-11-17: Sentry org `jawla-3q` (EU region), project `jawla-app` (React Native). The DSN is only in the untracked `quiz-app/.env.local`. Test event JAWLA-APP-1 arrived with the email and phone in the message shown as `[hidden]`, and no user email or IP address. Sentry still guessed a city from the connection, so **Prevent Storing of IP Addresses** was turned on (Settings → Projects → jawla-app → Security & Privacy, 2026-11-17), which also stops the city guess.

## Follow-ups (2026-11-17)

Second pass over the open Medium/Low items, plus fresh Supabase advisors (security + performance).

| # | What changed | Where |
|---|--------------|-------|
| 5 | **Webhook signature check.** When the secret `MYFATOORAH_WEBHOOK_SECRET` is set, `payment-webhook` rejects payment events with a missing or wrong `MyFatoorah-Signature` header (401). The signature is HMAC-SHA256 (base64) over the event's `Key=Value,...` string, as in the MyFatoorah docs ([signature](https://docs.myfatoorah.com/docs/webhook-signature), [v1 fields](https://docs.myfatoorah.com/docs/transaction-data-model), [v2 fields](https://docs.myfatoorah.com/docs/webhook-v2-payment-status-data-model)). Both webhook v1 and v2 are supported. Compared in constant time. A signed webhook is still only a hint: every payment is re-checked with MyFatoorah before any credit. Body limited to 64 KB; bad JSON gets 400. If the secret is not set, the old behaviour stays and a warning is logged. | `supabase/functions/_shared/webhook-signature.ts`, `supabase/functions/payment-webhook/index.ts` |
| 6 | Still open. Leaked-password protection is a dashboard switch (Pro plan). | Dashboard |
| 8 | **Team-photo cap.** Upload policy now allows at most 40 new photos per account in any 24 hours (a game uses at most 2). | `20261119120000_security_followups.sql` |
| new | **Throttle on `verify-payment`.** Each call asks MyFatoorah, so one account is limited to 20 checks per minute (429 `rate_limited`). Best effort, in memory per function instance; the hard limits stay in the database (`create_order`). | `_shared/myfatoorah.ts`, `verify-payment/index.ts` |

Checked, no change needed:

- **Advisors.** Security: only #6 and #12 above. Performance: "unused index `seen_questions_question_idx`". It is kept on purpose, because it is the index behind the foreign key to `questions` (used when a question is deleted). All functions already have `search_path = ''`, and all policies already use `(select auth.uid())`.
- **CORS** is `*` on the two app-facing functions. They use a bearer token, not cookies, so another website cannot act as the user. The webhook and the return page are server-to-server or browser redirects and never needed CORS.
- **Error messages.** Functions return short codes (`gateway_failed`, `order_failed`, ...). The details only go to the function logs.
- **Input validation.** Order ids must be UUIDs, payment and invoice ids must be digits, and return links must match the allow-list (#3). Amounts never come from the app.

**User to-do for #5:** in the MyFatoorah portal (Integration Settings → Webhook), turn on the webhook with the URL `https://mqpzimmvnnzcoyfuqnbe.supabase.co/functions/v1/payment-webhook`, enable the secret key, then add it yourself with `supabase secrets set MYFATOORAH_WEBHOOK_SECRET=...` (never in chat or git). After that, make one sandbox payment and check the function logs for "bad or missing signature". If you see that warning, the field format did not match. Payments still go through, because the app and the return page also confirm with MyFatoorah.

## Final pass (2026-11-17)

- Real question bank loaded (400 questions, not in git); the 180 public samples are switched off (`is_sample`, `active = false`).
- Server-side game test (rolled back): payment adds exactly one credit and a repeat confirmation adds none; a start with no credit is refused; 100 draws were all different and none were samples; the 101st draw is refused.
- `questions` now has an explicit deny-all policy (#12). Security advisor: only #6 is left (needs the Pro plan).
- The other Supabase project in the account has no custom secrets, so no payment key is left there.
- Sentry has no open issues. "Prevent Storing of IP Addresses" is on.
- Webhook secret: `MYFATOORAH_WEBHOOK_SECRET` is set in Supabase (by the user, 2026-11-17). Live check: a fake payment event with no signature and one with a wrong signature both get 401 `invalid_signature`. A real signed event is checked by the next sandbox payment: the function logs must not show "bad or missing signature".

## M9 question refill (2026-11-17)

- **Who can run it:** `refill-questions` has no app-facing use. It only runs when the caller sends the random `refill_token` kept in Supabase Vault (only the pg_cron job reads it; it is not in git or in the job text). Wrong or missing token → 401. The refill database functions (`add_questions`, `refill_context`, `known_refs`, `check_refill_token`) are service-role only (pgTAP `06_question_refill`).
- **Cost limit:** at most ~60 new questions per run (`REFILL_MAX_PER_RUN`, max 100), once a day, and only for category/points pairs below target (60 per points level, 20 for 5 points). When the bank is full, a run makes no AI calls.
- **AI output is data, not instructions (OWASP LLM01/LLM05):** text from Open Trivia DB and the model is never executed. `add_questions` checks category, points, lengths, duplicates (question text, Open Trivia DB ref) and same answers before saving. A second, strict AI pass drops anything doubtful; every row keeps `source` (`opentdb` / `ai`), so a bad batch can be switched off with one update.
- **Secrets:** `OPENROUTER_API_KEY` lives only in Supabase secrets, added by the owner. Errors return short codes; details go only to the function logs.
- **License:** Open Trivia DB questions are CC BY-SA 4.0; the app credits them on the home screen, and translated questions are tagged `opentdb`.
- **Same-answer rule:** `draw_question` never gives an account a question whose normalised answer (`answer_key`) it has already seen, in any game or category. Plain numbers count per category.

## M10 categories and picture questions (2026-11-17)

- **14 categories:** science, sports and food are hidden (`active = false`), not deleted, so old games and seen history stay valid. The app only lists active categories, and `start_game` on the server refuses any game that does not have 8 different active categories.
- **Picture bucket `question-images`:** public to read (pictures are not secret once a question is asked), PNG and SVG only, 512 KB limit. File names are 32 random hex characters, so a name never gives away the answer, and a database check refuses any other name. There is no list policy: nobody can list the bucket to see every picture in advance (pgTAP `07_categories_pictures`).
- **Only the server adds pictures:** the edge function `seed-pictures` uploads flags and map outlines with the service role. Like the refill, it only runs with the `refill_token` from Vault (401 otherwise). If a picture uploads but its question is not saved, the picture is deleted again.
- **SVG maps are drawn by our own code** from map numbers (one `<path>`, no scripts, no links), and the app shows them with `react-native-svg`, which does not run scripts.
- **The app never builds a picture link from anything but a hex name:** `questionImageUrl` refuses any other value from the server.
- **Same-answer rule for pictures:** a flag or map answer counts only inside its own category, so seeing Japan's flag does not block a text question about Japan, and the flag and the map of the same country are separate questions.
- **Credits:** flag images from flagcdn.com and map shapes from Natural Earth (via world-atlas) are both public domain.
