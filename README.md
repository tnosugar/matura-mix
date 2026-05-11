# matura-mix (tombstone)

The Matura Mix survey app has moved.

- **New public URL:** <https://tnosugar.github.io/matura-mix-public-app/>
- **Source (private working repo):** <https://github.com/tnosugar/matura-mix-private>

This repo exists solely to preserve the legacy `tnosugar.github.io/matura-mix/` URL by redirecting visitors to the new public location. It is **not** actively maintained, and the surveyed app is not built or served from here.

## What is here

- `index.html` — meta-refresh redirect to the new app root.
- `results.html` — redirect that preserves the `?key=...` query string (the DJ's gate) when JavaScript is enabled. The no-JS fallback lands on `results.html` without the key.
- `404.html` — catchall for any other path under `/matura-mix/` (legacy deep links, social-share image URLs, etc.). Preserves both path and query when JavaScript is enabled.
- `.nojekyll` — disables Jekyll processing on GitHub Pages.

All three redirects also send `<link rel="canonical">` pointing at the new URL so any crawlers that visit understand the move.

## Why not archive?

Anyone who scanned the classroom QR code, bookmarked the DJ link with the access key, or shared a link on social has a `tnosugar.github.io/matura-mix/...` URL. Without this repo, every one of those links returns a GitHub Pages 404. The redirect costs nothing to keep around indefinitely.
