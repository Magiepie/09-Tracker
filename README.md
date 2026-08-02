# 2009Tracker

A GitHub-only 2009scape player tracker inspired by the original RuneTracker. GitHub Pages hosts the interface, GitHub Actions checks hiscores, and compact JSON files keep changed snapshots.

## Setup

1. Create a public GitHub repository and copy this folder into its root.
2. Create the label `player-update` in the repository.
3. In **Settings → Actions → General**, set workflow permissions to **Read and write**.
4. In **Settings → Pages**, choose **GitHub Actions** as the source.
5. Push to the `main` branch, then run **Deploy tracker** once from the Actions tab.

The daily workflow is scheduled for 00:05 UTC, five minutes after the server reset. The Player page builds a prefilled GitHub issue for early updates; the issue workflow checks the API, stores a snapshot only if XP changed, and closes the request.

## Local preview

Serve the repository root and open `/site/index.html`. The deployed workflow copies `site/` and `data/` into one Pages artifact.
