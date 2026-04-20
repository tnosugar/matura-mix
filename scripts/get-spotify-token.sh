#!/usr/bin/env bash
# Get a short-lived Spotify "Client Credentials" access token.
#
# Requires SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in the environment.
# Prints just the token (no newline); copy it into the "Nalepi Spotify
# access token…" field on the results page.
#
# Usage:
#   export SPOTIFY_CLIENT_ID=...
#   export SPOTIFY_CLIENT_SECRET=...
#   ./scripts/get-spotify-token.sh | pbcopy   # macOS: straight to clipboard
#
# The token lasts 1 hour. Re-run this script to get a fresh one.

set -euo pipefail

: "${SPOTIFY_CLIENT_ID:?SPOTIFY_CLIENT_ID not set}"
: "${SPOTIFY_CLIENT_SECRET:?SPOTIFY_CLIENT_SECRET not set}"

resp="$(curl -s -X POST \
  -u "${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}" \
  -d "grant_type=client_credentials" \
  https://accounts.spotify.com/api/token)"

# Extract access_token without depending on jq.
token="$(printf '%s' "$resp" | sed -n 's/.*"access_token"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

if [ -z "$token" ]; then
  echo "ERROR: could not extract access_token. Response:" >&2
  echo "$resp" >&2
  exit 1
fi

printf '%s' "$token"
