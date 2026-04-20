/**
 * Matura Mix — Google Apps Script backend.
 *
 * Deploy this as a Web App (Deploy → New deployment → Web app):
 *   - Execute as: Me
 *   - Who has access: Anyone
 * Then copy the web-app URL into config.js on the front end.
 *
 * On first run Apps Script will ask for permission to access your spreadsheet.
 *
 * Expected inbound payload (JSON, sent as text/plain):
 * {
 *   "name": "Marko Marković",
 *   "songs": [
 *     { "title": "...", "artist": "..." },
 *     ... up to 5
 *   ],
 *   "userAgent": "...",
 *   "clientTime": "2026-04-20T18:41:02.231Z"
 * }
 */

// The sheet this script writes to. Leave as "" to write to the first sheet of
// whatever spreadsheet you bound this Apps Script to (Extensions → Apps Script
// from inside a Google Sheet does this automatically). If you created the
// script standalone, paste the spreadsheet ID here and uncomment openById().
var SHEET_NAME = "Odgovori"; // created on first write if missing
var SPREADSHEET_ID = "";     // only needed for standalone Apps Script

var MAX_SONGS = 5;

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonOut({ ok: false, error: "empty_body" });
    }

    var payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      return jsonOut({ ok: false, error: "bad_json" });
    }

    var name = sanitize(payload.name, 80);
    if (!name) return jsonOut({ ok: false, error: "name_required" });

    var songTitles = [];
    var songArtists = [];
    for (var j = 0; j < MAX_SONGS; j++) {
      var s = (payload.songs || [])[j] || {};
      songTitles.push(sanitize(s.title, 160));
      songArtists.push(sanitize(s.artist, 120));
    }

    var filledSongs = 0;
    for (var k = 0; k < MAX_SONGS; k++) {
      if (songTitles[k] && songArtists[k]) filledSongs++;
    }
    if (filledSongs < 1) return jsonOut({ ok: false, error: "no_songs" });

    var sheet = getOrCreateSheet();
    ensureHeader(sheet);

    var row = [new Date(), name];
    for (var m = 0; m < MAX_SONGS; m++) {
      row.push(songTitles[m]);
      row.push(songArtists[m]);
    }
    row.push(sanitize(payload.userAgent, 400));
    row.push(sanitize(payload.clientTime, 40));

    sheet.appendRow(row);

    return jsonOut({ ok: true });
  } catch (err) {
    return jsonOut({ ok: false, error: String(err) });
  }
}

// Optional health check in a browser: visiting the URL should return ok:true.
function doGet() {
  return jsonOut({ ok: true, service: "matura-mix" });
}

// --- helpers ----------------------------------------------------------

function getOrCreateSheet() {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error(
      "No bound spreadsheet. Either bind this script to a Google Sheet " +
      "(Extensions → Apps Script from inside the sheet), or set SPREADSHEET_ID."
    );
  }
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeader(sheet) {
  if (sheet.getLastRow() > 0) return;
  var header = ["Timestamp", "Ime"];
  for (var j = 1; j <= MAX_SONGS; j++) {
    header.push("Pesma " + j + " — naslov");
    header.push("Pesma " + j + " — izvođač");
  }
  header.push("User-Agent");
  header.push("Client time");
  sheet.appendRow(header);
  sheet.setFrozenRows(1);
}

function sanitize(v, maxLen) {
  if (v == null) return "";
  var s = String(v).replace(/[\u0000-\u001F\u007F]/g, "").trim();
  if (s.length > maxLen) s = s.substring(0, maxLen);
  return s;
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
