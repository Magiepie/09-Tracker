# 2009Tracker

A GitHub-only 2009scape player tracker inspired by the original RuneTracker. GitHub Pages hosts the interface, GitHub Actions checks hiscores, and compact JSON files keep daily and changed snapshots.

## Setup

1. Create a public GitHub repository and copy this folder's contents into its root.
2. In **Settings → General → Features**, make sure public Issues are enabled.
3. In **Settings → Actions → General**, set workflow permissions to **Read and write**.
4. In **Settings → Pages**, choose **GitHub Actions** as the source.
5. Push to the `main` branch, then run **Deploy tracker** once from the Actions tab.

The daily workflow runs at 00:05 UTC, five minutes after the server reset. It reads the total-hiscores player list, removes names in `data/excluded-players.json`, updates existing tracked players, and imports up to 100 new eligible players per run. Change `DISCOVERY_BATCH_SIZE` in `.github/workflows/daily.yml` to adjust the initial-import speed.

Players with no XP-changing snapshot for 30 days are moved out of the daily update list and recorded in `data/inactive-players.json`. Their history is retained. Automatic discovery skips dormant players, while a requested player update removes them from the dormant list and starts tracking them again.

The Player page builds a prefilled GitHub issue for early updates; any signed-in GitHub user can submit it without repository edit permission. The issue workflow checks the API, enforces a 15-minute per-player cooldown, stores a snapshot only if XP changed, and closes the request.

For the initial bulk load, run **Import players** manually from the Actions tab. It imports only the next batch of new eligible names and does not recheck players already stored. Its default batch size is 1 and can be changed when starting the workflow.

## Local preview

Serve the repository root and open `/site/index.html`. The deployed workflow copies `site/` and `data/` into one Pages artifact.
