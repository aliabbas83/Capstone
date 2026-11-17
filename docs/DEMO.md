# Jawla — Capstone demo script (5–7 minutes)

## Before you start (checklist)

- [ ] Phone charged, **Expo Go** installed, phone and laptop on the **same Wi-Fi**.
- [ ] Laptop: `cd quiz-app` then `npx.cmd expo start -c`. Scan the QR code once and let the app load fully.
- [ ] `quiz-app/.env.local` has the Supabase URL and publishable key (and the Sentry DSN if you show Sentry).
- [ ] A demo account already exists and is logged out. Its password is in your head, not on the slide.
- [ ] Check the account still has unseen questions (play one question the day before).
- [ ] Get the **MyFatoorah sandbox test card** from MyFatoorah's docs (docs.myfatoorah.com → "Test Cards") and keep it on a paper note.
- [ ] Open in browser tabs: the GitHub repo, `docs/ARCHITECTURE.md`, Supabase dashboard (Table editor → `orders`, `profiles`).
- [ ] Phone volume up (sounds), screen mirroring ready if you have it.
- [ ] Turn off phone notifications.

## The script

### 0:00 – 0:45 · The idea

**Show:** Home screen.

**Say:**
"This is Jawla — جولة. It is an Arabic quiz race for friends and families on one phone.
Two teams, two boats. Answer right, and you decide: move your boat forward, or push the other boat back.
It is built with React Native and Expo, Supabase for the backend, and MyFatoorah for payment."

### 0:45 – 2:30 · Free demo (no account, works offline)

**Show:**
1. Tap the demo button. Enter two team names. Point out the mascot suggestion from the name.
2. Categories: teams take turns, 4 each. A taken category is locked for the other team.
3. Race screen: the sea, two lanes, buoys, the flag.
4. Pick a category and level (2 / 3 / 4 points). Show the timer, then **reveal answer**.
5. Tap that the team was **right** → show **move forward** vs **push back**. Pick push to show the other boat going back.
6. Next question: tap **wrong** → the other team gets a 15-second **steal**.
7. Open the **pause menu**: play again, change teams, end, sound switches.

**Say:**
"The demo has no sign-up and needs no internet. Its questions live inside the app and never overlap the real bank.
All the game rules are pure functions in `engine.ts`, and they have unit tests.
When one team is 4 steps from the finish, the other team unlocks a 5-point comeback question — once per game."

(If time is short, skip the steal and go straight to the next part.)

### 2:30 – 4:15 · Real account and payment

**Show:**
1. Back to home → **log in** (email or Kuwaiti phone + password). Show the lobby: games left = 0.
2. Tap **buy a game (1 KWD)**. The MyFatoorah sandbox page opens.
3. **Test card step:** choose card payment, type the sandbox test card number, expiry and CVV from your note, and confirm (enter the test OTP if the page asks).
4. The browser closes and the app shows "paid". Games left = 1.
5. (Optional, 15 s) Supabase dashboard → `orders` row is `paid`, `amount_fils = 1000`.

**Say:**
"The app never sends a price. The server makes the order at 1000 fils, creates the MyFatoorah invoice, and after payment it asks MyFatoorah itself.
Credit is added only if the invoice, the order and the amount all match — and only once.
If someone changes the link or the amount on the phone, nothing happens."

### 4:15 – 5:30 · Real game

**Show:**
1. New game → teams (optionally take a team photo) → categories → race.
2. Play one or two questions. Point out finished categories show as finished.

**Say:**
"Starting the game takes one credit on the server, in one step. Every question comes from the server, one at a time,
picked at random from questions this account has **never seen**. The database blocks a repeat with a primary key.
The app cannot read the question table — it can only ask for the next question.
One paid game is limited to 6 hours or 100 questions."

### 5:30 – 6:30 · How it is built and kept safe

**Show:** `docs/ARCHITECTURE.md` diagram (or a slide of it), then `docs/SECURITY.md` result line.

**Say:**
"The rule for the whole project is: **never trust the device.** Price, payment check, question choice and unlocking a game all happen on the server.
Every table has row-level security. The app only has the publishable key; secrets are in Supabase secrets.
I ran an OWASP review: no critical or high findings. Errors go to Sentry without personal data.
The real question bank is kept out of the public GitHub repo."

### 6:30 – 7:00 · Close

**Say:**
"Next steps would be more questions, a webhook signature check, and in-app purchase if we publish to the stores. Thank you — questions?"

## If the network fails — fallback plan

1. **Stay calm and say it:** "The Wi-Fi is down, so I will show the offline demo — this is exactly why the demo works without internet."
2. The **demo game works fully offline** once the app is loaded on the phone. Play it longer: steal, comeback, winner screen with flag and confetti.
3. For payment and the real game, show:
   - `docs/ARCHITECTURE.md` payment sequence diagram,
   - the code: `supabase/functions/_shared/myfatoorah.ts` (`settleOrder`) and `private.mark_order_paid` in `supabase/migrations/20261117120000_m6_orders.sql`,
   - screenshots or a short screen recording of a sandbox payment, made **before** the demo (recommended: record one the day before).
4. If Expo Go cannot load at all (laptop and phone can't see each other), try `npx.cmd expo start --tunnel`, or show the recording.

## Likely examiner questions

**Why Expo Go and not a native build?**
It is fast to develop and test on a real phone with no Xcode / Android Studio. We only use modules that run in Expo Go.

**How do you stop someone from getting a game for free?**
The price is set on the server. Credit is added only after the server checks with MyFatoorah that the invoice for this order is paid with the right amount. Starting a game takes one credit atomically on the server.

**What if the user closes the browser before coming back to the app?**
Three ways to finish: the return page checks MyFatoorah, the app asks `verify-payment`, and MyFatoorah's webhook calls `payment-webhook`. All three do the same check, and credit is added only once.

**Could a fake webhook add credit?**
No. The webhook body is only a hint; we take the invoice id and ask MyFatoorah ourselves. (A signature check is the next step, to stop wasted calls.)

**How do you make sure questions never repeat?**
`seen_questions` has a primary key on (user, question). `draw_question` only picks questions not in that table and records the pick in the same call.

**Can a player read all the answers from the API?**
No. The `questions` table has RLS with no policies and no grants. The only way in is `draw_question`, one question at a time, only for your own active game and its categories.

**Where are the secrets?**
In Supabase secrets (MyFatoorah key) and the service role is only used inside edge functions. The app has only the publishable key. `.env` files are git-ignored.

**Why is the winner decided on the phone?**
The game is played in one room on one phone; the host taps who answered right. The winner only affects that account's history — there is no leaderboard or prize, so it is an accepted risk.

**Why no SMS or email verification?**
It was a product decision for version 1 (no SMS cost). The risk — someone registering another person's number — is written down in `SECURITY.md`.

**How did you test it?**
Jest unit tests for the game rules, mascots and input checks; TypeScript and lint checks before every milestone; live checks against the API with the public key (e.g. reading `questions` is denied); Supabase security advisors; sandbox payments.

**What would you do next?**
Load the full real question bank, add the webhook signature check, turn on leaked-password protection, add a per-account photo limit, and use Apple/Google in-app purchase if we publish to the stores.

**Why Supabase?**
Auth, Postgres with row-level security, storage and edge functions in one place. RLS lets us put the security rules in the database, next to the data.
