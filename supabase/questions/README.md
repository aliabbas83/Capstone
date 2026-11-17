# Real question bank (kept out of git)

The repo on GitHub is public, so the real questions and answers must **never** be committed.
Everything in this folder is ignored by git except this README and `template.csv`.

## Add or change questions

1. Copy `template.csv` to a new file in this folder, e.g. `bank.csv` (you can have several files).
2. Fill it in with Excel or Google Sheets. One question per row:

   | column     | what to write |
   |------------|---------------|
   | `category` | category id: `geo`, `history`, `science`, `sports`, `animals`, `food`, `tech`, `arabic`, `capitals`, `riddles` |
   | `points`   | `2` easy, `3` medium, `4` hard, `5` comeback question |
   | `question` | 5–300 characters |
   | `answer`   | 1–120 characters |

   Save as **CSV UTF-8**. Delete the example rows.
3. Turn the files into SQL:

   ```bash
   node supabase/scripts/questions-to-sql.mjs
   ```

   It checks every row and writes `supabase/questions/load.sql` (also ignored by git).
   Add `--retire-samples` once the real bank is ready: it switches off the 180 sample questions that are public on GitHub.
4. Open the Supabase dashboard → **SQL Editor**, paste the content of `load.sql`, and press **Run**.

Running it again is safe: an existing question (same text) is updated, not duplicated.
Players never see a question twice, and the app needs no update when questions are added.
