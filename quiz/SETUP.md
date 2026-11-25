# Quiz app – setup and run sheet

## What's in the folder
- `host.html` – the big screen (your laptop / projector)
- `index.html` – the page teams open on their phones
- `config.js` – where your Firebase keys go
- `questions_template.csv` – question format (opens in Excel)
- `media/` – put your own images, video and audio clips here
- `store.js`, `style.css`, `vendor/` – leave as they are

## Try it right now (no setup)
1. Unzip, then double-click `host.html`. It opens in REHEARSAL mode.
2. Click **Use sample questions** → **Create game**.
3. Open the join link shown on screen in new tabs, adding `&tab=2`, `&tab=3`… to act as different phones.

Rehearsal mode only works inside one browser. YouTube clips need the hosted version (step 2 below).

## One-time setup (about 20 minutes)

### 1. Firebase (the live connection between screen and phones – free)
1. Go to https://console.firebase.google.com → **Create a project** (Analytics not needed).
2. **Build → Realtime Database → Create database** → pick a location → **Start in locked mode**.
3. Open the database's **Rules** tab, replace everything with the block below, **Publish**:
   ```json
   {
     "rules": {
       "games": {
         "$code": {
           ".read": true,
           "meta":    { ".write": true },
           "state":   { ".write": true },
           "scores":  { ".write": true },
           "players": { "$pid": { ".write": true } },
           "answers": { "$q": { "$pid": { ".write": "!data.exists()" } } }
         }
       }
     }
   }
   ```
4. **Project settings (gear) → General → Your apps → Web (`</>`)** → register an app (no hosting).
5. Copy the values from the `firebaseConfig` it shows into `config.js`. `databaseURL` must be there.

### 2. Put the folder online (free)
Any static host works. GitHub Pages:
1. Create a new **public** repository, e.g. `quiz`.
2. **Add file → Upload files** → drag in everything inside this folder (including `vendor` and `media`).
3. **Settings → Pages → Deploy from a branch → main / root → Save**.
4. After a minute your host screen is at `https://<your-username>.github.io/quiz/host.html`.

The Firebase keys in `config.js` are fine to be public; the rules above are what control access.

## Questions file
Columns (header row required, any order):

| Column | Meaning |
|---|---|
| question | Question text |
| A, B, C, D | Choices (C and D may be left blank) |
| answer | Correct letter |
| points | Maximum points for this question (default 1000) – use for difficulty |
| time | Seconds to answer (default 20, minimum 5) |
| media | Optional: YouTube link, or image / video / audio file (`media/clip1.mp4`) or URL |
| start, end | Optional: seconds to start/stop a YouTube, video or audio clip |

Save as `.xlsx` or `.csv`. You load the file on the host screen each game, so nothing needs re-uploading
when questions change. Only your own media files need to be in the hosted `media/` folder.

## Running the game
- **Space / → / clicker**: next step. **L**: leaderboard on/off. **K**: skip a question. **F**: fullscreen.
- Text and image questions: the timer starts immediately.
- YouTube / video / audio questions: the clip plays first; press **Space** to open answers and start the timer.
- A question closes when time runs out, when every team has answered, or when you press Space.
- Scoring: a correct answer earns between 100% (instant) and 50% (last second) of the question's points. Wrong or no answer = 0.
- Click a team name in the lobby to remove it.
- **Download results** gives a CSV with each team's points per question.

## If something goes wrong mid-game
- **A phone refreshes, locks or loses signal**: reopening the page puts the team back in with its score.
- **Your laptop browser refreshes or crashes**: reopen `host.html` → **Resume it**. Scores are kept.
- **A clip won't play**: press **K** to skip it.

## Before the event
- Run all 50 questions once on the hosted version with 2–3 phones. Some YouTube videos block embedding; this is how you find them.
- Do that run on the laptop and network you'll present from (work networks sometimes block sites).
- Firebase's free plan allows 100 devices connected at once.
