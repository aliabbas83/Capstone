# Jawla (جولة) — Arabic team quiz race

Jawla is a party quiz game for friends and families. Two teams play on **one phone**.
Each team has a rowing boat on the sea. Answer a question right and you choose:
**move your boat forward** or **push the other boat back**. The first boat to reach the flag wins.

The app is fully in Arabic, right-to-left.

## The game in a few lines

1. Each team picks a name and a picture (a mascot, or a photo from the phone).
2. The teams take turns to pick **4 categories each** (8 different categories in total).
3. On its turn, a team picks a category and a level: easy = 2, medium = 3, hard = 4 points.
4. The host reads the question. There is a timer (30 / 60 / 90 seconds).
5. Right answer → move forward or push the rival back by the points.
   Wrong answer → the other team gets one 15-second chance to **steal**.
6. When a team is 4 steps or less from the finish, the other team unlocks one **5-point comeback question**.
7. First boat to the finish line (20 steps) wins. Flag, confetti, horn.

## Features

- **Free demo** — no account, works offline, short lane (10 steps), sample questions inside the app.
- **Sign up / log in** with email **or** Kuwaiti phone number + password (no SMS or email code).
- **Real game for 1 KWD**, paid with **MyFatoorah** (sandbox). One payment = one game credit.
- **Questions never repeat** for the same account. The server picks every question.
- Team photos uploaded to a private storage bucket.
- Sound effects, music (with mute), animations, haptics, "Reduce Motion" support.
- Loading, empty and error states on every screen.
- Error monitoring with **Sentry** (no personal data).

## Tech stack

| Part | What we use |
|---|---|
| App | React Native + **Expo SDK 58** (runs in **Expo Go**), Expo Router, TypeScript |
| Backend | **Supabase** — Auth, Postgres with RLS, RPC functions, Storage, Edge Functions (Deno) |
| Payments | **MyFatoorah** sandbox (KNET / card), only through edge functions |
| Monitoring | Sentry (`@sentry/react-native`) |
| Tests | Jest (`jest-expo`) |

## Repo layout

```
capstone/
├─ quiz-app/                 the mobile app (Expo)
│  ├─ src/app/               screens (Expo Router: every file is a screen)
│  │   index.tsx  auth.tsx  lobby.tsx  payment.tsx  race.tsx  setup/teams.tsx  setup/categories.tsx
│  ├─ src/game/              game rules (engine.ts), game state (game-store.tsx), demo questions, mascots
│  ├─ src/lib/               Supabase client, auth, payments, sound, Sentry, input checks
│  ├─ src/components/        UI pieces (race track, boats, overlays, buttons)
│  ├─ assets/sounds/         sounds made in code by scripts/make-sounds.mjs
│  └─ .env.example           names of the public app settings
├─ supabase/
│  ├─ migrations/            database tables, RLS, server functions (SQL)
│  ├─ functions/             edge functions: create-payment, payment-return, verify-payment, payment-webhook
│  ├─ questions/             real question bank (git-ignored, only README + template are in git)
│  └─ scripts/               questions-to-sql.mjs (CSV → SQL)
├─ docs/                     PRD, PLAN, SECURITY, ARCHITECTURE, DEMO
└─ .env.example              names of the server secrets (never filled in git)
```

## Run the app

You need Node.js (LTS) and the **Expo Go** app on your phone (SDK 58).

1. Install packages:
   ```bash
   cd quiz-app
   npm install
   ```
2. Copy `quiz-app/.env.example` to `quiz-app/.env.local` and fill in the values.
   Only **public** values go here (anything starting with `EXPO_PUBLIC_` is built into the app):

   | Variable | What it is |
   |---|---|
   | `EXPO_PUBLIC_SUPABASE_URL` | Supabase project URL |
   | `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase **publishable** key (never the secret key) |
   | `EXPO_PUBLIC_SENTRY_DSN` | Sentry DSN (optional — Sentry is off when empty) |

3. Start the dev server. On **Windows** use `npx.cmd`:
   ```bash
   npx.cmd expo start -c
   ```
   (`-c` clears the cache. On macOS / Linux: `npx expo start -c`.)
4. Scan the QR code with Expo Go (Android) or the Camera app (iPhone). Phone and computer must be on the same Wi-Fi.

The **demo** works with no `.env.local` and no internet. Sign up, real games and payments need Supabase.

## Set up Supabase

The project is called `jawla` (ref `mqpzimmvnnzcoyfuqnbe`). For a new project, do the same steps.

1. **Database** — apply everything in `supabase/migrations/` in order (file names start with the date):
   ```bash
   npx supabase link --project-ref <your-project-ref>
   npx supabase db push
   ```
   This creates the tables, RLS rules, server functions, the `team-photos` bucket and 180 sample questions.
2. **Auth settings** (dashboard → Authentication):
   - Email provider on, **Confirm email off**, magic links off.
   - Password: at least 8 characters (the app also asks for letters + digits).
3. **Edge functions** — deploy all four:
   ```bash
   npx supabase functions deploy create-payment
   npx supabase functions deploy verify-payment
   npx supabase functions deploy payment-return --no-verify-jwt
   npx supabase functions deploy payment-webhook --no-verify-jwt
   ```
   `payment-return` (the browser comes back here) and `payment-webhook` (MyFatoorah calls it) have no user token,
   so JWT checking must be off for them. They never trust their input: they always ask MyFatoorah.
4. **Secrets** — the owner adds these himself (dashboard → Edge Functions → Secrets, or `npx supabase secrets set`).
   Never paste them into chat or into git:

   | Secret | Needed? |
   |---|---|
   | `MYFATOORAH_API_KEY` | Yes — MyFatoorah sandbox API key |
   | `MYFATOORAH_BASE_URL` | Optional — defaults to `https://apitest.myfatoorah.com` (sandbox) |
   | `MYFATOORAH_WEBHOOK_SECRET` | Later — for the webhook signature check (not used yet) |

   `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are given to edge functions by Supabase automatically.
   The root `.env.example` lists the server secret names; copy it to `.env` (git-ignored) if you want a local note.
5. **Webhook (optional)** — in the MyFatoorah portal, set the webhook URL to
   `https://<project-ref>.supabase.co/functions/v1/payment-webhook`.

## The real question bank stays out of git

The GitHub repo is public, so real questions and answers must never be committed.

- Everything in `supabase/questions/` is git-ignored except `README.md` and `template.csv`.
- Write questions in a CSV (copy `template.csv`), then run:
  ```bash
  node supabase/scripts/questions-to-sql.mjs --retire-samples
  ```
  It checks every row and writes `supabase/questions/load.sql` (also git-ignored).
- Paste `load.sql` into the Supabase **SQL Editor** and press Run. Running it again is safe.
- `--retire-samples` switches off the 180 public sample questions (they are flagged `is_sample`).
- The app never downloads the bank. It gets **one question at a time** from the server function `draw_question`.

Full steps: [`supabase/questions/README.md`](supabase/questions/README.md).

## Tests and checks

From `quiz-app/`:

```bash
npm test            # Jest: game rules, mascots, input checks
npx tsc --noEmit    # TypeScript check
npx expo lint       # lint
```

If a `supabase/tests/` folder is present, it holds database tests (RLS and server functions).
Run them against a local or linked database with the Supabase CLI (`npx supabase test db`) — see the README in that folder.

## Milestones

| # | Milestone | Status |
|---|---|---|
| M1 | Foundations (structure, theme, screens shell, Supabase client) | Done |
| M2 | Demo race (offline) | Done |
| M3 | Database, RLS, question bank, `draw_question` | Done |
| M4 | Sign up & log in (email or phone + password) | Done |
| M5 | Real game on the server (credit, questions, team photos) | Done |
| M6 | MyFatoorah payments (sandbox) | Done |
| M7 | Sound & polish | Done |
| M8 | Security check & Sentry | Done |
| M9 | Daily question refill (Open Trivia DB + AI) | Done |
| M10 | 14 new categories, flag and map picture questions | Done |

Details and test notes: [`docs/PLAN.md`](docs/PLAN.md).

## Docs

- [`docs/PRD.md`](docs/PRD.md) — what we build and the game rules
- [`docs/PLAN.md`](docs/PLAN.md) — milestones, tables, rules
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the parts talk to each other, payment flow, security rules
- [`docs/SECURITY.md`](docs/SECURITY.md) — OWASP security check results
- [`docs/DEMO.md`](docs/DEMO.md) — 5–7 minute demo script and examiner questions
- [`supabase/questions/README.md`](supabase/questions/README.md) — how to add real questions

## Security in one line

**Never trust the device:** price, payment check, question choice and game unlocking all happen on the server.
Every table has RLS. Only the publishable key is in the app. Secrets live in Supabase secrets or a git-ignored `.env`.
