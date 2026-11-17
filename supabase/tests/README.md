# Database tests (pgTAP)

These tests check the security rules in the database: row-level security,
grants, the server functions and the team-photos storage rules.

| File | What it checks |
|---|---|
| `01_rls_tables.test.sql` | RLS on every table; anon sees nothing private; a user only reads their own profile, games, orders, seen_questions; nobody reads `questions`; credit and orders can't be changed by the app |
| `02_draw_question.test.sql` | `draw_question` needs sign-in, never repeats a question for an account (even across games), records every draw, skips inactive questions, 6-hour and 100-question game limits; `remaining_questions` |
| `03_start_finish_game.test.sql` | `start_game` takes exactly 1 credit, fails at 0, bad input costs nothing; `finish_game` only for the owner and only once |
| `04_orders.test.sql` | price (1000 fils) set on the server; only the service role can create/confirm orders; credit added once, only when invoice + amount match; 5-pending-orders limit |
| `05_team_photos_storage.test.sql` | `team-photos` bucket is private, 2 MB, images only; each user can only upload, see and delete in their own folder; no overwrite/rename |

Every file runs inside `begin; ... rollback;`. Test users, categories,
questions and files are created inside that transaction and thrown away at the
end, so nothing is saved. The tests make their own test data (category
`pgtap_test` etc.), so they don't depend on the real question bank.

## How to run

Needs Docker and the Supabase CLI.

```sh
supabase start      # local database with all migrations applied
supabase test db    # runs every *.sql file in supabase/tests
```

Each file prints `ok` / `not ok` lines and a summary at the end.

## Notes

- Users are simulated with
  `set local role authenticated; set local request.jwt.claims = '{"sub":"<uuid>","role":"authenticated"}';`
  and `reset role;` goes back to the database owner.
- Supabase blocks direct `delete` on storage tables; the storage test turns on
  `storage.allow_delete_query` for its own transaction so the delete policy can
  be tested.
- Two taps on "start game" at the same moment can't be simulated in one SQL
  session. `start_game` takes the credit with one conditional update
  (`games_credit > 0`) plus a `check (games_credit >= 0)`; the tests check both.
- If you add a table, add it to `01_rls_tables.test.sql` (the "RLS is enabled on
  every table" check already fails if RLS is missing).
