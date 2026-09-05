# Baseball and Bobblehead Collection

A static site (no dependencies, plain Node build script) that showcases an autographed
baseball collection and a bobblehead collection, plus a **local-only** management screen.

## Layout

| Path | Purpose |
| --- | --- |
| `data/baseballs.json` | One record per baseball |
| `data/bobbleheads.json` | One record per bobblehead |
| `data/collections.json` | Collection definitions (Perfect Game pitchers, 500 HR club, ...) |
| `images/baseballs/` | Baseball photos |
| `images/bobbleheads/` | Bobblehead photos |
| `public/` | Site CSS and client-side filter script |
| `lib/baseball.mjs` | Shared record normalization / display-title helpers |
| `scripts/build.mjs` | Static site generator → `dist/` |
| `admin/`, `tools/admin-server.mjs` | Local management screen (never deployed) |
| `.github/ISSUE_TEMPLATE/`, `scripts/intake.mjs` | Phone-friendly issue-form intake pipeline |

## Adding items from your phone

Open a new issue with the **New baseball** or **New bobblehead** template (Issues → New
issue, from the GitHub mobile app or a mobile browser). Fill in the fields and attach a
photo — the app's photo/camera icon inserts it into the "Photos" field for you.

Submitting the issue triggers `.github/workflows/intake.yml`, which parses the form,
downloads the photo(s), and opens a pull request adding the new record to `data/*.json`
plus the image files under `images/`. It comments back on the issue with a link to that
pull request. Nothing is published until you merge the pull request (from your phone, if
you like) — merging auto-closes the issue and GitHub Actions rebuilds and publishes the
site. If a required field is missing, it comments on the issue explaining what to fix;
editing the issue re-runs the check automatically.

This keeps `admin/`/`tools/admin-server.mjs` completely private (still local-only, still
excluded from `dist/`) — the issue-form pipeline is the only way to add items remotely,
and every change still lands as a reviewable pull request.

## Everyday use

```powershell
npm run admin   # http://localhost:4321 — manage baseballs and bobbleheads
npm run build   # regenerate dist/
npm run serve   # http://localhost:5173 — preview dist/
```

The admin server binds to `127.0.0.1` only and is not part of the published output —
`dist/` contains just HTML, CSS, JS, and images. The public navigation switches
between the baseball and bobblehead pages; bobbleheads can be filtered by year.

Collections can be added, renamed (including their id, which is remapped across every
baseball), and deleted from the admin screen. Deleting a collection removes it from any
baseball that referenced it.

**Baseball photo autoscan:** drop image files straight into `images/baseballs/`. The admin screen polls for
loose files that no baseball claims and shows them at the top with *Create record* (which
starts a new baseball pre-attached to that photo, with the player name guessed from the
filename) or *Discard*.

After making changes in the admin screen, commit the updated `data/*.json` and new
`images/*` files and push to `main`; GitHub Actions rebuilds and publishes the site.

## Data shape

A baseball holds one or more signatures and any number of photos. The first photo is the
cover shown on the card; reorder or remove photos from the admin screen.

```json
{
  "id": "1998-yankees-team-ball",
  "title": "",
  "signatures": [
    { "player": "Nolan Ryan", "team": "Texas Rangers", "signedYear": "1993", "inscription": "HOF 99" },
    { "player": "Tom Seaver", "team": "New York Mets", "signedYear": "", "inscription": "" }
  ],
  "acquired": "Private signing",
  "authentication": "PSA/DNA",
  "notes": "",
  "collections": ["hall-of-fame", "cy-young"],
  "images": ["ryan-seaver.jpg", "ryan-seaver-2.jpg"],
  "featured": false
}
```

`title` is optional — when blank the card title is derived from the signature names
(`"Nolan Ryan & Tom Seaver"`, or `"A, B & 3 more"` for larger team balls). Older records
using a single top-level `player`/`team`/`signedYear` are migrated automatically.

The build fails if a baseball has no signatures or references a collection id that does
not exist in `data/collections.json`.

A bobblehead stores a name, year, notes, and any number of photos:

```json
{
  "id": "ken-griffey-jr",
  "name": "Ken Griffey Jr.",
  "year": "2024",
  "notes": "Stadium giveaway",
  "images": ["ken-griffey-jr.jpg"]
}
```

## One-time GitHub setup

1. Push the repo to GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
