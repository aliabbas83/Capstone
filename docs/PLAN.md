# Jawla — Build Plan

Stack: **React Native + Expo (SDK 58, Expo Go)** · Expo Router · **Supabase** (project `jawla`, ref `mqpzimmvnnzcoyfuqnbe`, region ap-south-1) · Edge Functions (Deno) · **MyFatoorah** sandbox · Sentry.

## Rules for the whole build
- Arabic first, right-to-left, Cairo font. Money in **fils** (1 KWD = 1000 fils), Kuwait time.
- **Never trust the device**: prices, payments, which questions you get, and "has this game been paid" are decided on the server.
- **RLS on every table** from day one. Only the publishable key is in the app; secrets live in Supabase secrets.
- Only modules that run in **Expo Go**.
- Every screen has loading, empty and error states.
- After each milestone: check it works, explain in simple words, commit and push, tick it here.

## Tables
| Table | Stores |
|---|---|
| `profiles` | one row per user (display name, games_credit) — owner reads own row; credit changed only by the server |
| `categories` | category list (name, colour, icon, active) — anyone reads |
| `questions` | question, answer, difficulty (2/3/4/5), category — **no direct read**; served only by a server function |
| `games` | a paid game: owner, status (active / finished), team names & images, lane length, winner |
| `seen_questions` | (user, question) pairs — makes sure a question never repeats for an account |

The free demo's questions stay inside the app (works offline, no sign-up) and never overlap the real bank.

Server functions: `draw_question(game, category, points)` picks a random question the account has never seen and records it; `remaining_questions(categories)` says how many are left. Both need a signed-in user; the real work runs in the private schema, which the API cannot reach.
| `orders` | MyFatoorah payments: owner, amount_fils, status (pending / paid / failed), invoice id |
| Storage `team-photos` | private bucket, each user only their own folder |

## Milestones
- [x] **M1 Foundations** — project structure, theme (sea, colours, Cairo font), Expo Router screens shell, Supabase client with env vars, docs + CLAUDE.md, Git connected. *Test: app opens in Expo Go and shows the home screen.*
- [x] **M2 Demo race (offline)** — teams (name + mascot gallery with name matching), category picking (4 each, alternating, no duplicates), race screen with lanes and boats, question screen with timer, reveal, steal, move-or-push, 5-point comeback, winner with flag + confetti, pause menu (play again / change teams / end). *Test: play a full demo game.*
- [x] **M3 Database** — tables, RLS, categories + seed question bank, `draw_question` server function that never repeats a question for the account. *Test: advisors show no RLS warnings; drawing questions never repeats.*
- [x] **M4 Sign-up & log in** — email or Kuwaiti phone + password (min 8, letters + digits), no verification email/SMS (Supabase: confirm email off, magic links off), lobby, log out. Phone accounts use an internal login name `<number>@phone.jawla.invalid`. *Test: sign up, log out, wrong password, log in, duplicate sign-up, phone sign-up.*
- [x] **M5 Real game** — create a game on the server (needs credit), real questions from `draw_question`, team photo upload to Storage. *Test: play a real game; questions don't repeat in the next game.* Server: `start_game` (takes 1 credit atomically), `finish_game` (winner or abandoned), private `team-photos` bucket (own folder only, 2 MB, jpg/png/webp).
- [x] **M6 Payments** — `create-payment` and `payment-webhook` edge functions (MyFatoorah sandbox), orders table, credit added only after the server verifies the payment. *Test: pay with the test card → 1 game credit; tampering with the amount does nothing.* Done: `orders` table (price 1000 fils set on the server), edge functions `create-payment`, `payment-return` (checks with MyFatoorah, then back to the app), `verify-payment`, `payment-webhook` (webhook body only a hint; always re-checked). Credit added once, only when invoice + order + amount match. Secret: `MYFATOORAH_API_KEY` (Supabase secrets).
- [x] **M7 Sound & polish** — sounds, music with mute, animations, haptics, accessibility pass, design critique. Done: 10 sound effects + a music loop made in code (`quiz-app/scripts/make-sounds.mjs`, free and original); effects on, music off by default; both switches on home and in the pause menu, remembered on the phone. Haptics on push and win. "Reduce Motion" stops waves, oars, flag and confetti. Accessibility: switch/radio states announced, 44pt targets, no text under 12pt. Critique fixes: lobby no longer spins forever when the account is gone, team-name hint no longer looks like a typed name, "Next" says why it is off, drawn icons instead of emoji on the sound switches.
- [x] **M8 Security & monitoring** — OWASP audit (owasp-security skill) and fixes, backend-truth checklist, Supabase advisors, Sentry. *Test: no critical/high findings.* Done: no Critical/High (full report in `docs/SECURITY.md`). Fixed: 6-hour / 100-question limit per paid game, strict payment return link, race-proof order limit. Sentry set up in `src/lib/monitoring.ts` (off until `EXPO_PUBLIC_SENTRY_DSN` is set; no personal data sent).
- [x] **M9 Question refill** — the bank tops itself up every day from Open Trivia DB (translated to Arabic) and OpenRouter (new Arabic questions), and an account never gets two questions with the same answer. *Test: refill API is service-role only and rejects duplicates / same answers; a seen answer never comes back.* Done: edge function `refill-questions` (pg_cron daily at 03:00 Kuwait, token from Vault), at most ~60 new questions per run, a second strict AI check before saving, `questions.answer_key` / `source` / `source_ref`, `add_questions` checks every field. Open Trivia DB credited on the home screen (CC BY-SA 4.0). Needs the secret `OPENROUTER_API_KEY` (optional `OPENROUTER_MODEL`, default `anthropic/claude-sonnet-5.5`).
- [x] **M10 New categories + picture questions** — 14 categories inspired by popular Gulf quiz games, with no audio or video: معلومات عامة، جغرافيا (with map outlines)، تاريخ، عالم الحيوان، تكنولوجيا، لغة وأدب، عواصم، ألغاز، أعلام (flag pictures)، الكويت، كرة قدم عالمية، قصص الأنبياء، طب عام، سيارات. Science, sports and food are hidden, not deleted; football questions moved out of sports. *Test: 14 active categories; picture questions need a random file name; a flag answer does not block a text answer; nobody can list the picture bucket.* Done: `questions.image_path` + public `question-images` bucket (PNG/SVG, random hex names, no listing), edge function `seed-pictures` (flags from flagcdn.com, map outlines drawn from Natural Earth data, both public domain; token from Vault), 194 flags + 174 maps, `draw_question` returns the picture, question card shows it with loading / retry, refill writes questions for the new categories (with a strict rule for قصص الأنبياء), demo has the 14 categories and 7 bundled flags. pgTAP `07_categories_pictures`. First fill: about 200 new questions (each new category now has 28–41, all four levels); duplicates found by hand were switched off. The refill now waits and retries once when OpenRouter says "too many requests" (new accounts get 20 per minute).
