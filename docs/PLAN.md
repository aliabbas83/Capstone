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
- [ ] **M5 Real game** — create a game on the server (needs credit), real questions from `draw_question`, team photo upload to Storage. *Test: play a real game; questions don't repeat in the next game.*
- [ ] **M6 Payments** — `create-payment` and `payment-webhook` edge functions (MyFatoorah sandbox), orders table, credit added only after the server verifies the payment. *Test: pay with the test card → 1 game credit; tampering with the amount does nothing.*
- [ ] **M7 Sound & polish** — sounds, music with mute, animations, haptics, accessibility pass, design critique.
- [ ] **M8 Security & monitoring** — OWASP audit (owasp-security skill) and fixes, backend-truth checklist, Supabase advisors, Sentry. *Test: no critical/high findings.*
