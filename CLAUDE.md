# Jawla (جولة) — Arabic team quiz race app

Read first: `docs/PRD.md` (what we build) and `docs/PLAN.md` (milestones, tables, rules).

## Stack
- App: `quiz-app/` — React Native + Expo SDK 58 (Expo Go only), Expo Router, TypeScript. See `quiz-app/AGENTS.md` for Expo commands.
- Backend: Supabase project `jawla` (ref `mqpzimmvnnzcoyfuqnbe`). Migrations in `supabase/migrations/`, edge functions in `supabase/functions/`.
- Payments: MyFatoorah sandbox through edge functions. Monitoring: Sentry.

## Rules
- Work on one milestone at a time. Plan before you build.
- After each milestone: check it works, explain the changes in simple words, commit and push, tick it in `docs/PLAN.md`.
- Never change `docs/PRD.md` without asking the user.
- Never trust the device: prices, payments, question selection and game unlocking happen on the server.
- RLS on every table. Only the Supabase publishable key goes in the app. Secrets only in Supabase secrets or an untracked `.env`.
- Never ask the user to paste passwords or keys into chat. They add secrets themselves.
- Arabic RTL UI. Every screen needs loading, empty and error states.
- Use the project skills in `.claude/skills/` (expo-*, supabase*, owasp-security, security-and-hardening, test-driven-development, impeccable).
- Run `npx tsc --noEmit` and `npx expo lint` in `quiz-app/` before calling a milestone done.
