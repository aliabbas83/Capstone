# Jawla (جولة) — Product Requirements

## Problem
Friends and families want a fun Arabic quiz game they can play together on one phone, with a bit of strategy and a lot of excitement, not just a list of questions.

## Users
- **Host**: the person whose phone runs the game. Signs up, pays, sets up teams and reads questions aloud.
- **Players**: two teams in the same room. They don't need an account.
- **Guest**: anyone trying the free demo without an account.

## What each user can do
- Guest: play a short demo race with sample questions. No sign-up.
- Host: sign up / log in with **email** or **Kuwaiti phone number** and a **password** (no verification step); buy a real game for **1 KWD**; set up teams; run the game; play again / change teams / end the game.
- Players: answer questions out loud; when right, choose to **move their swimmer forward** or **push the other swimmer back**.

## Game rules
1. **Two teams**, each with a **name** and a **matching image**: picked from a mascot gallery (the app suggests one from the name) or a photo uploaded from the phone.
2. **Categories**: each team picks **4 categories**, taking turns. A category taken by one team can't be taken by the other (8 different categories per game).
3. **Race**: each team has a swimmer in its own lane of a pool. The swimmer's head is the team picture and the swimsuit is in the team colour. The lanes run sideways, one above the other: swimmers start on the right and swim left. The lane is **20 steps** long and ends with a finish line and a flag.
4. **Turns** alternate. On its turn, a team picks **any of the 8 categories** and the points: **2 points, 3 points or 4 points** (shown by their points, not as easy / medium / hard; 2 is still the easiest and 4 the hardest). Each team can use **2 points 2 times, 3 points 4 times and 4 points 4 times** per game. Stealing a question also uses one of that level for the stealing team (a team can always steal, even with none left). Once a team has used all 10, its counts start again. The 5-point comeback question does not count.
5. **Timer**: 60 s by default (30 / 60 / 90, or no timer, in setup); the 15 s steal timer stays. The host reveals the answer and taps who got it right.
6. **Correct answer** → the team chooses: **move own swimmer forward** OR **push the other swimmer back** by the question's points (1 point = 1 step). Swimmers can't go behind the start line.
7. **Wrong answer / time out** → the other team gets **one 15 s chance to steal**. If right, they get the points and make the same move-or-push choice. Then the turn passes as normal.
8. **5-point comeback question**: when a team is **4 steps or fewer** from the finish, the other team unlocks a **5-point question** (once per game per team). It appears as a button on their turn; it is used up even if answered wrong. It can be used to move or push.
9. **Winning**: the first swimmer to reach the finish (no exact landing needed) raises the flag and wins. The winning swimmer stands up in the water, celebrates and waves.
10. **No repeated questions**: an account never gets the same question twice. If an account has used every question in a category, that category shows as finished.
11. **Buttons**: play again (same teams, pick categories again), change teams, end game. In the pause menu and on the winner screen.

## Pricing
- Demo: free, no account, short lane (10 steps), fixed sample questions.
- Real game: **1 KWD per game**, paid with **MyFatoorah** (KNET / card). The server creates the payment and confirms it; a game is unlocked only after the server confirms the payment.

## Screens
1. Splash / Home — logo, start demo, sign up (email / phone), log in.
2. Sign up / log in — email or phone number + password (new account / log in tabs).
3. Lobby (logged in) — new game (pay 1 KWD), games left, settings, log out.
4. Payment — MyFatoorah page, then success / failure.
5. Teams — name + image for each team (gallery or photo).
6. Categories — teams take turns picking 4 each.
7. Race — the pool with two sideways lanes, swimmers, flags, whose turn, comeback button, pause.
8. Question — category, points, timer, question card, reveal answer, who got it right. Some categories (flags, maps) show a picture with the question.
9. Move or push — two big choices, then the swimmer swims forward or is pushed back.
10. Winner — flag rises, the winning swimmer waves, confetti, scores, play again / change teams / end.
11. Pause menu — resume, play again, change teams, end game, sound on/off.

## Look, sound and motion
Bright cartoon, daytime sea: turquoise water with moving waves, floats marking each step, swimmers in team-colour swimsuits with the team image as the head, a winner who celebrates and waves, flags that rise and wave, flip-in question cards, splash and cheer sounds, a horn at the finish, confetti for the winner. Arabic first, right-to-left, Cairo font, big touch targets.

## Data (Supabase)
Tables: profiles (games credit), categories, questions (the real bank, read only through the server), games (the two teams' names, mascots and photos are stored on the game), seen_questions (used questions per account), orders (payments). Demo questions are bundled in the app, so the free demo works without an account. Team photos in a private Storage bucket. RLS on every table.

## Out of scope (first version)
Online multiplayer on several phones, more than 2 teams, Apple/Google in-app purchase, an admin web panel, English UI.

## Success
- A full game can be played start to finish on a phone in Expo Go.
- Questions never repeat for the same account.
- A game unlocks only after a server-confirmed MyFatoorah sandbox payment.
- OWASP audit shows no critical or high findings; RLS on every table.

## Open questions
- Phone accounts have no SMS step, so there is no password reset by phone. Adding SMS (Twilio) later is optional.
- Who writes the full question bank and how many questions at launch.
- Background music source (royalty-free).
- Publishing to the App Store / Google Play would require in-app purchase instead of MyFatoorah.
