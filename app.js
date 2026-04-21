// Matura Mix — survey logic
//
// Renders 5 song (title + artist) rows, validates, and writes each submission
// into Firebase Realtime Database via an atomic push().
//
// Loaded as an ES module so we can import the Firebase SDK from Google's CDN
// with no build step. `window.MATURA_MIX_CONFIG` is set by config.js (loaded
// just before this script in index.html).

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const cfg = window.MATURA_MIX_CONFIG || {};
const MAX_SONGS = cfg.MAX_SONGS || 5;
const ALLOWED_EMAIL_DOMAIN = "savremena-osnovna.edu.rs";

const songsRoot = document.getElementById("songs");
const form = document.getElementById("survey");
const submitBtn = document.getElementById("submit");
const errorEl = document.getElementById("error");
const thanksEl = document.getElementById("thanks");
const nameInput = document.getElementById("name");
const emailInput = document.getElementById("email");

// --- Firebase init ----------------------------------------------------

let db = null;
try {
  if (!cfg.FIREBASE_CONFIG) {
    throw new Error("FIREBASE_CONFIG missing in config.js");
  }
  const app = initializeApp(cfg.FIREBASE_CONFIG);
  db = getDatabase(app);
} catch (e) {
  console.error("Firebase init failed:", e);
  // We still render the form; the submit handler will show a friendly error.
}

// --- Render rows ------------------------------------------------------

// Mobile UX notes on the song inputs:
//   autocapitalize="words" keeps proper nouns title-cased as pupils type.
//   autocorrect="off" + spellcheck="false" stop iOS from "correcting"
//     Serbian-diacritic words and band names into nonsense (e.g. Balašević
//     getting autocorrected to "Balancing").
//   autocomplete="off" keeps the browser from suggesting previous values.

for (let i = 0; i < MAX_SONGS; i++) {
  const row = document.createElement("div");
  row.className = "row";
  row.innerHTML =
    '<span class="idx">' + (i + 1) + ".</span>" +
    '<span class="pair">' +
    '<input type="text" class="title" name="song_' + (i + 1) + '_title" maxlength="160" ' +
    'autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" ' +
    'placeholder="Pesma" />' +
    '<input type="text" class="artist" name="song_' + (i + 1) + '_artist" maxlength="120" ' +
    'autocomplete="off" autocapitalize="words" autocorrect="off" spellcheck="false" ' +
    'placeholder="Izvođač" />' +
    "</span>";
  songsRoot.appendChild(row);
}

// --- Collect & validate -----------------------------------------------

function readPayload() {
  const songs = [];
  for (let i = 0; i < MAX_SONGS; i++) {
    const tEl = songsRoot.querySelector('[name="song_' + (i + 1) + '_title"]');
    const aEl = songsRoot.querySelector('[name="song_' + (i + 1) + '_artist"]');
    songs.push({
      title: (tEl.value || "").trim(),
      artist: (aEl.value || "").trim(),
    });
  }
  return {
    name: (nameInput.value || "").trim(),
    email: (emailInput.value || "").trim().toLowerCase(),
    songs,
    userAgent: navigator.userAgent,
    clientTime: new Date().toISOString(),
  };
}

// Basic email shape check. Not trying to be RFC-5322; just "looks like an email".
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(p) {
  if (!p.name) return { msg: "Upiši ime i prezime.", flag: { input: nameInput } };
  if (p.name.length < 2) return { msg: "Ime je prekratko.", flag: { input: nameInput } };
  if (!p.email) return { msg: "Upiši školski email.", flag: { input: emailInput } };
  if (!EMAIL_RE.test(p.email)) {
    return { msg: "Email ne izgleda ispravno. Proveri još jednom.", flag: { input: emailInput } };
  }
  if (!p.email.endsWith("@" + ALLOWED_EMAIL_DOMAIN)) {
    return {
      msg:
        "Koristi školski email (završava se sa @" + ALLOWED_EMAIL_DOMAIN + "). " +
        "Ovaj formular je samo za učenike naše škole.",
      flag: { input: emailInput },
    };
  }
  // Per-row: a row with a title must also have an artist, and vice versa.
  for (let i = 0; i < MAX_SONGS; i++) {
    const s = p.songs[i];
    const hasTitle = !!s.title;
    const hasArtist = !!s.artist;
    if (hasTitle && !hasArtist) {
      return {
        msg: "U " + (i + 1) + ". redu si upisao/la naslov bez izvođača. Dodaj izvođača ili obriši naslov.",
        flag: { songRow: i, missing: "artist" },
      };
    }
    if (hasArtist && !hasTitle) {
      return {
        msg: "U " + (i + 1) + ". redu si upisao/la izvođača bez naslova. Dodaj naslov ili obriši izvođača.",
        flag: { songRow: i, missing: "title" },
      };
    }
  }
  const complete = p.songs.filter((s) => s.title && s.artist);
  if (complete.length < 1) {
    return {
      msg: "Upiši bar jednu pesmu sa naslovom i izvođačem.",
      flag: { songRow: 0 },
    };
  }
  return null;
}

function clearInvalidMarks() {
  const all = form.querySelectorAll("input.is-invalid");
  all.forEach((el) => el.classList.remove("is-invalid"));
}

function markInvalid(flag) {
  if (!flag) return;
  if (flag.input) {
    flag.input.classList.add("is-invalid");
    flag.input.focus();
    return;
  }
  if (typeof flag.songRow === "number") {
    const tEl = songsRoot.querySelector('[name="song_' + (flag.songRow + 1) + '_title"]');
    const aEl = songsRoot.querySelector('[name="song_' + (flag.songRow + 1) + '_artist"]');
    if (flag.missing === "title" && tEl) {
      tEl.classList.add("is-invalid");
      tEl.focus();
    } else if (flag.missing === "artist" && aEl) {
      aEl.classList.add("is-invalid");
      aEl.focus();
    } else {
      if (tEl) tEl.classList.add("is-invalid");
      if (aEl) aEl.classList.add("is-invalid");
      if (tEl) tEl.focus();
    }
  }
}

// Turn an email into a Firebase-safe path segment. Firebase RTDB forbids
// ".", "#", "$", "/", "[", "]" in keys — replace all of them (and any other
// non-alphanumeric chars beyond "-" and "_") with "_". The local-part +
// "@domain" collapse to e.g. "marko_markovic_savremena-osnovna_edu_rs".
function emailToKey(email) {
  return email.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
}

function showError(msg) {
  errorEl.hidden = false;
  errorEl.textContent = msg;
  errorEl.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearError() {
  errorEl.hidden = true;
  errorEl.textContent = "";
}

// --- Submit -----------------------------------------------------------

// Clear the red outline on any input the user starts typing into again.
form.addEventListener("input", function (ev) {
  if (ev.target && ev.target.classList && ev.target.classList.contains("is-invalid")) {
    ev.target.classList.remove("is-invalid");
  }
});

form.addEventListener("submit", async function (ev) {
  ev.preventDefault();
  clearError();
  clearInvalidMarks();

  const payload = readPayload();
  const err = validate(payload);
  if (err) {
    showError(err.msg);
    markInvalid(err.flag);
    return;
  }

  if (!db) {
    showError("Sajt još nije povezan sa serverom. Javi organizatoru.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = "Šaljem…";

  try {
    // Upsert by email: the node lives at /submissions/<sanitized-email>, and
    // set() replaces the whole node. If the pupil submits again, their
    // previous songs + name are fully overwritten — no duplicates.
    const key = emailToKey(payload.email);
    const entryRef = ref(db, "submissions/" + key);
    await set(entryRef, {
      name: payload.name,
      email: payload.email,
      songs: payload.songs,
      userAgent: payload.userAgent,
      clientTime: payload.clientTime,
      serverTimestamp: serverTimestamp(),
    });
    form.hidden = true;
    thanksEl.hidden = false;
    thanksEl.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (e) {
    console.error(e);
    submitBtn.disabled = false;
    submitBtn.textContent = "Pošalji";
    showError(
      "Greška pri slanju. Proveri internet i pokušaj ponovo. Ako i dalje ne radi, javi organizatoru."
    );
  }
});
