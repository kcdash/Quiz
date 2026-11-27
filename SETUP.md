# Quiz app – setup and run sheet

## What's in the folder
- `host.html` – the big screen (your laptop / projector)
- `index.html` – the page teams open on their phones
- `config.js` – where your Firebase keys go
- `questions_template.xlsx` – question format with three sheets (Questions, Rounds, Intro)
- `questions_template.csv` – the same questions as a single CSV (no Intro sheet)
- `media/` – optional: media files you are happy to publish on the website
- `host.js`, `export.js`, `store.js`, `style.css`, `vendor/` – leave as they are

## Try it right now (no setup)
1. Double-click `host.html`. It opens in REHEARSAL mode.
2. Click **Use sample questions** → **Create game**.
3. Open the join link shown on screen in new tabs, adding `&tab=2`, `&tab=3`… to act as different phones.

Rehearsal mode only works inside one browser. YouTube clips need the hosted version.

## Firebase rules (update these once – the new features need them)
Firebase console → **Realtime Database → Rules** → replace everything with this → **Publish**:
```json
{
  "rules": {
    "games": {
      "$code": {
        ".read": true,
        "meta":     { ".write": true },
        "state":    { ".write": true },
        "scores":   { ".write": true },
        "hist":     { ".write": true },
        "players":  { "$pid":  { ".write": true } },
        "names":    { "$name": { ".write": true } },
        "presence": { "$pid":  { ".write": true } },
        "rejoin":   { "$dev":  { ".write": true } },
        "answers":  { "$q": { "$pid": { ".write": "!data.exists()" } } }
      }
    }
  }
}
```
The `answers` line is what makes the database itself refuse a second answer from the same team.
Without `names`, `presence`, `rejoin` and `hist`, teams can still join and play, but the connection dots,
moving a team to another phone and the online score backup will not work.

## Questions file
Download the template from the setup screen (**Download template**) or open `questions_template.xlsx`.

### Sheet 1: Questions (required)
| Column | Meaning |
|---|---|
| question | Question text |
| A, B, C, D | Choices (C and D may be left blank) |
| answer | Correct letter |
| points | Base points for this question (default 1000; use 2000 for a hard one, 0 for a no-points question) |
| time | Seconds on the clock (5 to 240). Blank = the default you set on the setup screen (10) |
| media | Optional: YouTube link, or the file name of an image, video or music clip (`clip1.mp4`) |
| start, end | Optional: seconds to start/stop a YouTube, video or music clip |
| round | Which round the question belongs to (`1`, `2`, … or a name). Blank = same round as the row above |
| size | Optional: question text size in percent (`80` = smaller, `120` = larger) |
| multiplier | Optional: overrides the round's multiplier for this one question |

### Sheet 2: Rounds (optional)
| round | name | multiplier |
|---|---|---|
| 1 | Warm-up | 1 |
| 2 | Screen time | 1.5 |
| 3 | Brain burners | 2 |

### Sheet 3: Intro (optional)
Two columns, `item` and `value`. Items: `title`, `subtitle`, `image` (up to 4 rows), `rule` (one row per rule).
Leave the sheet out and you get the answer tiles as artwork and a standard set of rules.

## Media that stays on your laptop
On the setup screen, pick your **Media folder**. The questions file then only needs the file name
(`clip1.mp4`, `photo.jpg`, `song.mp3`). Nothing is uploaded. Use Chrome or Edge.
After a browser refresh, press **Media folder** in the bottom bar to pick it again.

## How points are worked out
`points = base points × multiplier × speed`, where speed runs from 100% (instant) down to 50% (at the buzzer).
The result is rounded once to a whole number and stored. Round totals and the grand total are sums of those
stored numbers, so the scoreboard and the spreadsheet always agree.

## Running the game
Order of screens: join page → title slide → rules → round card → questions → round scores → … → podium.

| Key | Does |
|---|---|
| Space / → / clicker | Next step |
| L | Scores table on/off (after an answer is revealed) |
| K | Skip a question |
| T | Add 10 seconds to the clock |
| - and = | Question text smaller / larger |
| [ and ] | Answer text smaller / larger |
| F | Fullscreen |

- Text and image questions: the clock starts immediately.
- YouTube / video / music questions: the clip plays first; press **Space** to start the clock.
- The top right shows how many teams have answered; the name strip under the answers shows which ones
  (yellow = answered, red outline = phone offline).
- When the clock runs out the answer is revealed. If every team answers sooner, press **Space** to reveal
  (or tick "Reveal the answer automatically" on the setup screen).
- The reveal shows the correct answer and a bar chart of how many teams chose A, B, C and D.
- After the last question of a round the scores table appears by itself.
- The podium reveals 3rd, 2nd and 1st on three presses of Space, then the full standings.
- **Download results** (any time) gives an Excel file: Summary (by round, running totals, check column),
  By question, and Answer log.
- Click a team name on the join page to remove it.

## If something goes wrong mid-game
- **A phone refreshes, locks or loses signal**: reopening the page puts the team back in with its score.
- **A team's phone dies**: they join on another phone with the same team name and tap
  "This is my team". You get an Allow / No prompt on the host screen.
- **Your laptop browser refreshes or crashes**: reopen `host.html` → **Resume it**. Scores are kept.
- **A clip won't play**: press **K** to skip it.

## Before the event
- Run all the questions once on the hosted version with 2–3 phones on mobile data. Some YouTube videos block embedding; this is how you find them.
- Do that run on the laptop and network you'll present from (work networks sometimes block sites).
- Firebase's free plan allows 100 devices connected at once.
