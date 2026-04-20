# Matura Mix

A small survey site for an 8th-grade class prom. Each pupil submits:

- their name
- up to 5 favourite songs (title + artist)

Responses land in **Firebase Realtime Database** and are visible live on a
private results page. The DJ gets a CSV export and (later) a Spotify playlist
built from it.

**Stack:** static HTML/CSS/JS on GitHub Pages, Firebase Realtime Database as
the storage backend (free tier), Node script for Spotify playlist generation.

**Audience:** ~40–50 pupils, 14–15 years old, Serbian UI (Latin script).

---

## Repo layout

```
matura-mix/
├── index.html              # pupil-facing survey (Serbian)
├── results.html            # private results view (tabs + CSV export + Spotify match)
├── styles.css              # shared styles for both pages (Savremena school palette)
├── app.js                  # survey logic + Firebase write
├── results.js              # live subscription + tab rendering + CSV + Spotify matcher
├── config.js               # Firebase config + RESULTS_KEY
├── savremena-logo.svg      # school logo, displayed at the top of both pages
├── .nojekyll               # tells GitHub Pages to serve files as-is
├── scripts/
│   ├── build-spotify-playlist.mjs  # CSV → Spotify playlist (Node 18+)
│   └── get-spotify-token.sh        # get a short-lived token for the leaderboard
└── README.md               # this file
```

`data/` is git-ignored — exported CSVs and playlist reports live there locally.

---

## One-time setup (≈ 15 minutes)

### 1. Create the Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and
   sign in. Use a **personal Google account** if you have one — Workspace org
   policies can get in the way.
2. **Add project** → name it `matura-mix` → skip Analytics → Create.
3. Left nav: **Build → Realtime Database → Create Database**. Pick region
   `europe-west1`. Start in **test mode** (we'll tighten rules in step 3).
4. Project overview → click the `</>` icon → register a web app called
   `matura-mix-web` → skip hosting. You'll see a config snippet.
5. Paste the `firebaseConfig` object into `config.js` in this repo, replacing
   the `FIREBASE_CONFIG` value. (The apiKey is a public client identifier,
   not a secret — it's safe to commit.)

### 2. Set the results page key

The results page is gated by a URL parameter: visiting `results.html` without
`?key=<value>` shows a "Pristup nije dozvoljen" card. The key lives in
`config.js` as `RESULTS_KEY`.

A random key was generated when this repo was created. Keep the default or
rotate it:

```bash
openssl rand -hex 16   # prints a fresh 32-char hex string
```

Paste the new value into `config.js` and commit. The old bookmark stops
working immediately; the new URL is `results.html?key=<the new value>`.

### 3. Tighten the database rules

Test mode is open to the world for 30 days, then shuts everything off. Before
that window closes, set permanent rules.

Firebase Console → Realtime Database → **Rules** tab → paste:

```json
{
  "rules": {
    "submissions": {
      ".read": true,
      ".write": true,
      "$submissionId": {
        ".validate": "newData.hasChildren(['name', 'email', 'songs'])",
        "name": {
          ".validate": "newData.isString() && newData.val().length >= 2 && newData.val().length <= 80"
        },
        "email": {
          ".validate": "newData.isString() && newData.val().length >= 5 && newData.val().length <= 120"
        }
      }
    }
  }
}
```

Publish. This allows anonymous reads (needed by the results page) and
anonymous writes (needed by the survey) only under `/submissions`, with a
tiny validity check on name and email. Domain restriction (only emails on
`@savremena-osnovna.edu.rs`) is enforced on the client, not in the rules —
a determined attacker could still write anything via the REST API, but
for a class survey that's a non-risk.

**Upsert by email.** Each submission lives at `/submissions/<sanitized-email>`
(where `.` and `@` become `_`). Resubmitting from the same email overwrites
the previous entry instead of creating a duplicate. For stronger protection
you'd add Firebase Auth; that's out of scope for a class survey.

### 4. Test locally

No build step. Open `index.html` directly in a browser:

```bash
open index.html    # macOS
```

Fill in a test submission. If it works, you'll see the "Hvala!" state; a new
node appears under `/submissions` in the Firebase Console → Data tab.

Then open `results.html?key=<RESULTS_KEY>` in the same or another tab. The
test submission should appear in the "Pojedinačni glasovi" tab within a
second or two. Leave the page open and submit from another tab — new rows
appear live.

Common gotchas:

- **Blank page on `index.html`:** open DevTools Console. A "Firebase init
  failed" message means the `FIREBASE_CONFIG` object in `config.js` is
  malformed or missing a field.
- **"Pristup nije dozvoljen" on a URL you're sure is right:** check the
  `key=` parameter exactly matches `RESULTS_KEY` in `config.js`. No trailing
  spaces, no URL-encoded characters.
- **Submission seems to hang:** check the Firebase Console → Database →
  Rules tab. If you tightened rules but got a field name wrong, writes will
  fail silently.

### 5. Deploy to GitHub Pages

```bash
cd /Users/milos.funl/work/projects/matura-mix
git init
git add .
git commit -m "Matura Mix: initial scaffold"

gh repo create matura-mix --public --source=. --remote=origin --push
```

Enable Pages:

```bash
gh api -X POST repos/{YOUR_GH_USER}/matura-mix/pages \
  -f "source[branch]=main" \
  -f "source[path]=/"
```

The site serves at `https://{YOUR_GH_USER}.github.io/matura-mix/`.

### 6. Share with the class

Share the Pages URL in the class WhatsApp/Viber group. Optional: generate a
QR code for the classroom wall.

**Share only `index.html` with pupils. Never share the results URL.** Your
private results link is:

```
https://{YOUR_GH_USER}.github.io/matura-mix/results.html?key=<RESULTS_KEY>
```

Bookmark it. If the link ever leaks, rotate `RESULTS_KEY` in `config.js`,
commit, push.

---

## After the class has filed their answers

### Export the CSV

Open the results page → click **Preuzmi CSV**. Save as
`data/odgovori.csv` in this repo (the `data/` folder is git-ignored).

The CSV's column layout matches what `scripts/build-spotify-playlist.mjs`
expects out of the box:

```
Timestamp, Ime, Email, Pesma 1 — naslov, Pesma 1 — izvođač, …, User-Agent, Client time
```

### Build the Spotify playlist

```bash
export SPOTIFY_CLIENT_ID=...
export SPOTIFY_CLIENT_SECRET=...
export SPOTIFY_USER_ID=...            # your Spotify username
export SPOTIFY_PLAYLIST_NAME="Matura Mix 2026"

node scripts/build-spotify-playlist.mjs
```

On first run this writes a dry report to `data/playlist-report.md` — a
markdown table of every song with vote counts and voter names. The actual
Spotify matching + playlist creation will be finished once real responses
land. Sign up at <https://developer.spotify.com/dashboard> in the meantime.

### Live Spotify matching on the leaderboard (optional)

The leaderboard tab on the results page can fetch a Spotify link for each
song live. Click into the "Top pesme" tab → you'll see a bar with a token
input.

Get a short-lived access token:

```bash
export SPOTIFY_CLIENT_ID=...
export SPOTIFY_CLIENT_SECRET=...
./scripts/get-spotify-token.sh       # prints the token to stdout
# macOS shortcut:
./scripts/get-spotify-token.sh | pbcopy
```

Paste it into "Nalepi Spotify access token…" and click **Poveži**. The
matcher searches `track:"<title>" artist:"<artist>"` for each unique
song in the leaderboard, accepts a match only if the normalized title
and artist both line up, and caches results in-memory for the tab's
lifetime. Unmatched songs show `—` (the matcher is deliberately strict;
it doesn't guess). Click **Osveži** to retry everything after fixing a
typo, or **Odjavi** to clear the token. The token lasts 1 hour; after
that you'll get a "token istekao" status and need to re-run the script.

---

## Privacy note

Pupils are 14–15 years old. A few things to be mindful of:

- **Response contents:** name + music preferences. Low sensitivity.
- **Writes to Firebase are open:** anyone who reads `config.js` can post
  fake rows. Same trust model the Apps Script backend would have had. If
  someone sprays garbage, delete rows in the Firebase Console → Data tab.
- **Reads from Firebase are open too**, under current rules. The results
  page's URL key is obscurity, not security. For real privacy, swap to
  Firebase Auth (out of scope here).
- **If the repo is public,** the site is public. The site has
  `noindex, nofollow` to keep it off Google, but it's not secret.
- **Right to delete.** If a pupil asks you to remove their row, do it
  manually in the Firebase Console → Data tab; each submission is under
  `/submissions/<push-id>`.

---

## Things to decide later

Defaults baked in that may want revisiting:

- **Script (Latin vs. Cyrillic).** The UI uses Latin script. Swap to
  Cyrillic by translating the strings in `index.html`, `results.html`,
  `app.js`, and `results.js` — the data pipeline handles either.
- **Visual theme.** The accent is hot pink on dark violet. Tweak the CSS
  custom properties at the top of `styles.css`.
- **Distribution.** QR code generation isn't scripted; do it manually.
- **Class identifier.** Only one class assumed. If you want to support
  multiple, add a `class` / `section` field in `index.html`, `app.js`,
  `results.js` (columns), and the CSV export.
- **Validation tone.** Error messages are firm but friendly. Soften or
  sharpen as taste dictates.
