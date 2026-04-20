// Matura Mix — results page
//
// Reads submissions from Firebase Realtime Database in real time and renders
// two tabs (individual votes, top songs). CSV export matches the column
// layout expected by scripts/build-spotify-playlist.mjs.
//
// Gated by a URL key: results.html?key=<RESULTS_KEY from config.js>. If the
// key is missing or wrong, the page shows a "Pristup nije dozvoljen" card
// and never connects to Firebase.

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const cfg = window.MATURA_MIX_CONFIG || {};
const MAX_SONGS = cfg.MAX_SONGS || 5;

// --- Gate on URL key --------------------------------------------------

const urlKey = new URLSearchParams(location.search).get("key");
const deniedEl = document.getElementById("denied");
const grantedEl = document.getElementById("granted");

if (!cfg.RESULTS_KEY || urlKey !== cfg.RESULTS_KEY) {
  deniedEl.hidden = false;
  // Stop here. No Firebase connection, nothing else runs.
  throw new Error("results: access denied");
}
grantedEl.hidden = false;

// --- Firebase ---------------------------------------------------------

const app = initializeApp(cfg.FIREBASE_CONFIG);
const db = getDatabase(app);

// --- Tab switching ----------------------------------------------------

const tabIndividual = document.getElementById("tab-individual");
const tabLeaderboard = document.getElementById("tab-leaderboard");
const panelIndividual = document.getElementById("panel-individual");
const panelLeaderboard = document.getElementById("panel-leaderboard");

function showTab(which) {
  const showInd = which === "individual";
  tabIndividual.classList.toggle("is-active", showInd);
  tabLeaderboard.classList.toggle("is-active", !showInd);
  tabIndividual.setAttribute("aria-selected", String(showInd));
  tabLeaderboard.setAttribute("aria-selected", String(!showInd));
  panelIndividual.hidden = !showInd;
  panelLeaderboard.hidden = showInd;
}
tabIndividual.addEventListener("click", () => showTab("individual"));
tabLeaderboard.addEventListener("click", () => showTab("leaderboard"));

// --- Subscribe to submissions ----------------------------------------

let latestRows = []; // flattened: one entry per submission

const submissionsRef = ref(db, "submissions");
onValue(submissionsRef, (snapshot) => {
  const raw = snapshot.val() || {};
  // Firebase returns an object keyed by push-id. Turn it into an array,
  // sorted by serverTimestamp (or clientTime as fallback).
  const rows = Object.entries(raw).map(([id, v]) => ({
    id,
    name: v.name || "",
    email: v.email || "",
    songs: Array.isArray(v.songs) ? v.songs : [],
    userAgent: v.userAgent || "",
    clientTime: v.clientTime || "",
    serverTimestamp: typeof v.serverTimestamp === "number" ? v.serverTimestamp : null,
  }));
  rows.sort((a, b) => {
    const ta = a.serverTimestamp || Date.parse(a.clientTime) || 0;
    const tb = b.serverTimestamp || Date.parse(b.clientTime) || 0;
    return tb - ta; // newest first
  });
  latestRows = rows;

  renderStatus(rows);
  renderIndividual(rows);
  renderLeaderboard(rows);
});

// --- Renderers --------------------------------------------------------

function renderStatus(rows) {
  document.getElementById("count").textContent = String(rows.length);
  const lastEl = document.getElementById("last-update");
  if (rows.length === 0) {
    lastEl.textContent = "čekam prvi odgovor…";
  } else {
    const ts = rows[0].serverTimestamp || Date.parse(rows[0].clientTime) || Date.now();
    lastEl.textContent = "poslednji: " + formatRelative(ts);
  }
}

function renderIndividual(rows) {
  const tbody = document.querySelector("#individual-table tbody");
  const empty = document.getElementById("individual-empty");
  tbody.innerHTML = "";
  let rowCount = 0;
  for (const r of rows) {
    const when = r.serverTimestamp || Date.parse(r.clientTime) || 0;
    const timeStr = when ? formatShortTime(when) : "";
    for (const s of r.songs) {
      if (!s.title && !s.artist) continue;
      const tr = document.createElement("tr");
      tr.innerHTML =
        "<td class=\"t-time\">" + esc(timeStr) + "</td>" +
        "<td>" + esc(r.name) + "</td>" +
        "<td class=\"t-email\">" + esc(r.email) + "</td>" +
        "<td>" + esc(s.title) + "</td>" +
        "<td>" + esc(s.artist) + "</td>";
      tbody.appendChild(tr);
      rowCount++;
    }
  }
  empty.hidden = rowCount > 0;
}

// Current leaderboard entries, exposed for the Spotify matcher.
let currentLeaderboard = [];

function renderLeaderboard(rows) {
  const tbody = document.querySelector("#leaderboard-table tbody");
  const empty = document.getElementById("leaderboard-empty");
  tbody.innerHTML = "";

  const map = new Map();
  for (const r of rows) {
    for (const s of r.songs) {
      const key = (s.title.toLowerCase() + "\t" + s.artist.toLowerCase()).trim();
      if (!key || key === "\t") continue;
      const cur = map.get(key) || {
        title: s.title,
        artist: s.artist,
        votes: 0,
        voters: [],
      };
      cur.votes += 1;
      if (r.name && !cur.voters.includes(r.name)) cur.voters.push(r.name);
      map.set(key, cur);
    }
  }

  const sorted = [...map.values()].sort((a, b) => b.votes - a.votes || a.title.localeCompare(b.title));
  currentLeaderboard = sorted;
  sorted.forEach((row, i) => {
    const tr = document.createElement("tr");
    const spCellHtml = renderSpotifyCellHtml(row.title, row.artist);
    tr.innerHTML =
      "<td class=\"num\">" + (i + 1) + "</td>" +
      "<td class=\"num t-votes\">" + row.votes + "</td>" +
      "<td>" + esc(row.title) + "</td>" +
      "<td>" + esc(row.artist) + "</td>" +
      "<td class=\"t-voters\">" + esc(row.voters.join(", ")) + "</td>" +
      "<td class=\"t-sp\">" + spCellHtml + "</td>";
    tbody.appendChild(tr);
  });
  empty.hidden = sorted.length > 0;

  // After the table renders, kick off Spotify matching for any new entries.
  scheduleSpotifyMatching();
}

// --- CSV export -------------------------------------------------------

document.getElementById("export-csv").addEventListener("click", () => {
  const csv = buildCsv(latestRows);
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "matura-mix-odgovori.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

function buildCsv(rows) {
  // Column layout matches scripts/build-spotify-playlist.mjs:
  //   Timestamp, Ime, Email, Pesma 1 — naslov, Pesma 1 — izvođač, ..., User-Agent, Client time
  const header = ["Timestamp", "Ime", "Email"];
  for (let i = 1; i <= MAX_SONGS; i++) {
    header.push("Pesma " + i + " \u2014 naslov");
    header.push("Pesma " + i + " \u2014 izvođač");
  }
  header.push("User-Agent");
  header.push("Client time");

  const lines = [header.map(csvCell).join(",")];
  // Export oldest-first for stable diffs.
  const asc = [...rows].sort((a, b) => {
    const ta = a.serverTimestamp || Date.parse(a.clientTime) || 0;
    const tb = b.serverTimestamp || Date.parse(b.clientTime) || 0;
    return ta - tb;
  });
  for (const r of asc) {
    const ts = r.serverTimestamp
      ? new Date(r.serverTimestamp).toISOString()
      : (r.clientTime || "");
    const row = [ts, r.name, r.email];
    for (let i = 0; i < MAX_SONGS; i++) {
      const s = r.songs[i] || { title: "", artist: "" };
      row.push(s.title || "");
      row.push(s.artist || "");
    }
    row.push(r.userAgent);
    row.push(r.clientTime);
    lines.push(row.map(csvCell).join(","));
  }
  return lines.join("\r\n") + "\r\n";
}

function csvCell(v) {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// --- Helpers ----------------------------------------------------------

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatShortTime(ts) {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}.${mo}. ${hh}:${mm}`;
}

function formatRelative(ts) {
  const diff = Math.max(0, Date.now() - ts);
  const s = Math.floor(diff / 1000);
  if (s < 10) return "upravo sada";
  if (s < 60) return `pre ${s} sek`;
  const m = Math.floor(s / 60);
  if (m < 60) return `pre ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `pre ${h} h`;
  const d = Math.floor(h / 24);
  return `pre ${d} d`;
}

// --- Spotify matcher --------------------------------------------------
//
// The organizer pastes a Spotify "Client Credentials" access token into the
// bar at the top of the leaderboard tab. The token is stored in
// sessionStorage (clears on tab close; also expires after 1h server-side).
// Matches are cached in-memory so we only hit the API once per unique
// (title, artist) pair, even as new submissions stream in.
//
// Strict matching rule (no guessing):
//   normalized(track.name) starts with normalized(query.title) AND
//   some track.artists[].name normalized-equals normalized(query.artist)
//
// If nothing returned by the search satisfies that, we cache { notFound: true }
// and render the cell as empty.

const SP_TOKEN_KEY = "matura_mix_sp_token";
const SP_API = "https://api.spotify.com/v1/search";
const spCache = new Map();      // key: title\tartist (both lowercased) → { url } | { notFound: true } | { pending: true }
let spToken = sessionStorage.getItem(SP_TOKEN_KEY) || "";
let spQueueRunning = false;

const spStatusEl = document.getElementById("sp-status");
const spTokenInputEl = document.getElementById("sp-token-input");
const spConnectBtn = document.getElementById("sp-connect");
const spRefreshBtn = document.getElementById("sp-refresh");
const spDisconnectBtn = document.getElementById("sp-disconnect");

function updateSpotifyUi() {
  if (spToken) {
    spStatusEl.textContent = "povezano";
    spStatusEl.classList.add("sp-ok");
    spTokenInputEl.hidden = true;
    spConnectBtn.hidden = true;
    spRefreshBtn.hidden = false;
    spDisconnectBtn.hidden = false;
  } else {
    spStatusEl.textContent = "nije povezano";
    spStatusEl.classList.remove("sp-ok");
    spTokenInputEl.hidden = false;
    spConnectBtn.hidden = false;
    spRefreshBtn.hidden = true;
    spDisconnectBtn.hidden = true;
  }
}
updateSpotifyUi();

spConnectBtn.addEventListener("click", () => {
  const t = (spTokenInputEl.value || "").trim();
  if (!t) return;
  spToken = t;
  sessionStorage.setItem(SP_TOKEN_KEY, t);
  spTokenInputEl.value = "";
  // Clear any prior "not found" results so we re-match with the new token.
  spCache.clear();
  updateSpotifyUi();
  renderLeaderboard(latestRows);
});

spDisconnectBtn.addEventListener("click", () => {
  spToken = "";
  sessionStorage.removeItem(SP_TOKEN_KEY);
  spCache.clear();
  updateSpotifyUi();
  renderLeaderboard(latestRows);
});

spRefreshBtn.addEventListener("click", () => {
  spCache.clear();
  renderLeaderboard(latestRows);
});

function spKey(title, artist) {
  return (title || "").toLowerCase().trim() + "\t" + (artist || "").toLowerCase().trim();
}

function spNormalize(s) {
  return String(s || "")
    .toLowerCase()
    // Serbian Latin đ uses a stroke (not a combining diacritic), so NFD
    // alone doesn't touch it. Map to the standard "dj" transliteration so
    // "Đurđevdan" and "Djurdjevdan" converge.
    .replace(/đ/g, "dj")
    .replace(/Đ/g, "dj")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")        // strip combining diacritics
    .replace(/\s*[\(\[].*?[\)\]]\s*/g, " ")  // drop (feat. ...), [Remastered], etc.
    .replace(/\bfeat\.?\s+.*$/i, "")         // drop trailing "feat. X"
    .replace(/[^\p{L}\p{N}\s]/gu, " ")       // non-alphanumerics → space
    .replace(/\s+/g, " ")
    .trim();
}

function renderSpotifyCellHtml(title, artist) {
  if (!spToken) return '<span class="sp-empty">—</span>';
  const k = spKey(title, artist);
  const cached = spCache.get(k);
  if (!cached) return '<span class="sp-empty">…</span>';
  if (cached.pending) return '<span class="sp-empty">…</span>';
  if (cached.notFound) return '<span class="sp-empty">—</span>';
  if (cached.url) {
    return '<a href="' + esc(cached.url) + '" target="_blank" rel="noopener noreferrer">otvori ↗</a>';
  }
  return '<span class="sp-empty">—</span>';
}

function scheduleSpotifyMatching() {
  if (!spToken) return;
  // Mark new entries as pending so the cell renders as "…" instead of "—".
  for (const row of currentLeaderboard) {
    const k = spKey(row.title, row.artist);
    if (!spCache.has(k)) spCache.set(k, { pending: true });
  }
  if (!spQueueRunning) runSpotifyQueue();
}

async function runSpotifyQueue() {
  spQueueRunning = true;
  try {
    // Keep going until no pending entries remain. Re-reads currentLeaderboard
    // each loop so new submissions queue up naturally.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const pending = [...currentLeaderboard].find((r) => {
        const cached = spCache.get(spKey(r.title, r.artist));
        return cached && cached.pending;
      });
      if (!pending) break;
      await matchOne(pending.title, pending.artist);
      await sleep(150); // be polite to the Spotify API
    }
  } finally {
    spQueueRunning = false;
  }
  // Re-render to surface the newly resolved cells.
  // (renderLeaderboard reads from spCache, so this paints the new links.)
  renderLeaderboard(latestRows);
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function matchOne(title, artist) {
  const k = spKey(title, artist);
  try {
    const q = 'track:"' + title.replace(/"/g, "") + '" artist:"' + artist.replace(/"/g, "") + '"';
    const url = SP_API + "?q=" + encodeURIComponent(q) + "&type=track&limit=5";
    const res = await fetch(url, {
      headers: { Authorization: "Bearer " + spToken },
    });
    if (res.status === 401) {
      // Token expired or invalid. Drop it and surface a friendly status.
      spToken = "";
      sessionStorage.removeItem(SP_TOKEN_KEY);
      updateSpotifyUi();
      spStatusEl.textContent = "token istekao — poveži ponovo";
      spStatusEl.classList.remove("sp-ok");
      return;
    }
    if (!res.ok) {
      // Treat any other failure as "not found" so we don't retry forever.
      spCache.set(k, { notFound: true });
      return;
    }
    const data = await res.json();
    const tracks = (data.tracks && data.tracks.items) || [];
    const nTitle = spNormalize(title);
    const nArtist = spNormalize(artist);
    let hit = null;
    for (const t of tracks) {
      const ntName = spNormalize(t.name);
      const titleOk = ntName === nTitle || ntName.startsWith(nTitle + " ") || nTitle.startsWith(ntName + " ");
      // Loose artist predicate: accept when the normalized query artist
      // appears as a substring of a Spotify artist name, or vice versa.
      // This handles cases like "Balašević" → "Đorđe Balašević" (the
      // user types a last name; Spotify has the full name). Empty
      // strings after normalization never match — otherwise a pupil who
      // typed only punctuation as the artist would match every track.
      const artistOk = (t.artists || []).some((a) => {
        const na = spNormalize(a.name);
        if (!na || !nArtist) return false;
        return na === nArtist || na.includes(nArtist) || nArtist.includes(na);
      });
      if (titleOk && artistOk) { hit = t; break; }
    }
    if (hit && hit.external_urls && hit.external_urls.spotify) {
      spCache.set(k, { url: hit.external_urls.spotify });
    } else {
      spCache.set(k, { notFound: true });
    }
  } catch (e) {
    console.error("Spotify match failed for", title, "—", artist, e);
    spCache.set(k, { notFound: true });
  }
}
