#!/usr/bin/env node
// Matura Mix — build a Spotify playlist from the exported CSV.
//
// Usage:
//   1. In your Google Sheet: File → Download → Comma-separated values (.csv).
//      Save as ./data/odgovori.csv (or pass --csv path/to/file.csv).
//   2. Create a Spotify app at https://developer.spotify.com/dashboard,
//      add http://127.0.0.1:8888/callback as a redirect URI, note the
//      Client ID and Client Secret.
//   3. Export env vars before running:
//        export SPOTIFY_CLIENT_ID=...
//        export SPOTIFY_CLIENT_SECRET=...
//        export SPOTIFY_USER_ID=...           # your Spotify username
//        export SPOTIFY_PLAYLIST_NAME="Matura Mix 2026"
//   4. Run: node scripts/build-spotify-playlist.mjs
//      First run opens a browser for the authorization code flow.
//
// What it does:
//   - Parses the CSV into {name, songs[{title, artist}]} rows.
//   - For each song, calls Spotify's /search endpoint with track+artist filters.
//   - Aggregates unique track IDs + keeps a per-song provenance log.
//   - Creates (or reuses) a private playlist on your account, adds all tracks.
//   - Writes ./data/playlist-report.md with matched/unmatched and per-song votes.
//
// Intentionally standalone: no npm deps, no build step. Node 18+ (uses fetch).

// ---------------------------------------------------------------------------
// This is a scaffold. Implementation is deferred until after real responses
// land in the sheet, so the matching logic can be tuned against actual data.
// The structure below captures the intended flow.
// ---------------------------------------------------------------------------

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const args = parseArgs(process.argv.slice(2));
const CSV_PATH = args.csv || "./data/odgovori.csv";
const REPORT_PATH = "./data/playlist-report.md";

const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_USER_ID,
  SPOTIFY_PLAYLIST_NAME,
} = process.env;

async function main() {
  requireEnv();
  if (!existsSync(CSV_PATH)) {
    die(`CSV not found at ${CSV_PATH}. Export the Google Sheet first.`);
  }

  const rows = parseCsv(readFileSync(CSV_PATH, "utf8"));
  console.log(`Parsed ${rows.length} responses.`);

  const songCounts = tallySongs(rows);
  console.log(`${songCounts.size} unique (title × artist) combinations.`);

  // TODO (phase 2, once real responses land):
  //   - Spotify auth flow (authorization code + PKCE, local callback server)
  //   - For each unique song: search + pick best match, record confidence
  //   - Create playlist, add tracks in batches of 100
  //   - Write report to REPORT_PATH
  console.log(
    "\nMatcher not yet implemented. See the TODO list at the bottom of this file."
  );

  mkdirSync("./data", { recursive: true });
  writeFileSync(
    REPORT_PATH,
    buildDryReport(rows, songCounts),
    "utf8"
  );
  console.log(`Dry-run report written to ${REPORT_PATH}`);
}

// --- CSV parser (tiny, handles quoted fields with commas and escaped quotes)

function parseCsv(text) {
  const lines = splitLines(text);
  if (lines.length === 0) return [];
  const header = parseRow(lines[0]);
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const cells = parseRow(lines[i]);
    const rec = {};
    header.forEach((h, idx) => (rec[h] = cells[idx] || ""));
    out.push(normalizeRow(rec));
  }
  return out;
}

function splitLines(text) {
  // Handles \r\n, \n, and newlines inside quoted fields.
  const out = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
      buf += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf.length) out.push(buf);
  return out;
}

function parseRow(line) {
  const out = [];
  let buf = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { buf += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else buf += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { out.push(buf); buf = ""; }
      else buf += ch;
    }
  }
  out.push(buf);
  return out;
}

function normalizeRow(rec) {
  const songs = [];
  for (let i = 1; i <= 5; i++) {
    const t = (rec[`Pesma ${i} — naslov`] || "").trim();
    const a = (rec[`Pesma ${i} — izvođač`] || "").trim();
    if (t || a) songs.push({ title: t, artist: a });
  }
  return {
    timestamp: rec.Timestamp || "",
    name: (rec.Ime || "").trim(),
    songs,
  };
}

function tallySongs(rows) {
  const map = new Map();
  for (const r of rows) {
    for (const s of r.songs) {
      const key = (s.title.toLowerCase() + "\t" + s.artist.toLowerCase()).trim();
      if (!key || key === "\t") continue;
      const prev = map.get(key) || { title: s.title, artist: s.artist, votes: 0, voters: [] };
      prev.votes += 1;
      if (r.name && !prev.voters.includes(r.name)) prev.voters.push(r.name);
      map.set(key, prev);
    }
  }
  return map;
}

function buildDryReport(rows, songCounts) {
  const sorted = [...songCounts.values()].sort((a, b) => b.votes - a.votes);
  const lines = [];
  lines.push("# Matura Mix — draft playlist report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Responses: ${rows.length}`);
  lines.push(`Unique songs: ${songCounts.size}`);
  lines.push("");
  lines.push("## Songs by vote count");
  lines.push("");
  lines.push("| Votes | Song | Artist | Voters |");
  lines.push("|---|---|---|---|");
  for (const s of sorted) {
    lines.push(
      `| ${s.votes} | ${escapeMd(s.title)} | ${escapeMd(s.artist)} | ${s.voters.join(", ")} |`
    );
  }
  return lines.join("\n") + "\n";
}

function escapeMd(s) {
  return String(s || "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--csv") out.csv = argv[++i];
  }
  return out;
}

function requireEnv() {
  const missing = [];
  if (!SPOTIFY_CLIENT_ID) missing.push("SPOTIFY_CLIENT_ID");
  if (!SPOTIFY_CLIENT_SECRET) missing.push("SPOTIFY_CLIENT_SECRET");
  if (!SPOTIFY_USER_ID) missing.push("SPOTIFY_USER_ID");
  if (!SPOTIFY_PLAYLIST_NAME) missing.push("SPOTIFY_PLAYLIST_NAME");
  if (missing.length) {
    console.warn(
      `Note: ${missing.join(", ")} not set. Running in dry-report mode only.`
    );
  }
}

function die(msg) {
  console.error(msg);
  process.exit(1);
}

// Only run when executed directly.
const thisFile = fileURLToPath(import.meta.url);
if (process.argv[1] === thisFile) main().catch((e) => die(e.stack || String(e)));
