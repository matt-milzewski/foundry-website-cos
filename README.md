# The Natural 20 Tavern

Source for [thenatural20tavern.com](https://thenatural20tavern.com): the group's home for the next session night, the Curse of Strahd chronicle, the players' wall and In Memoriam.

## Everyday edits

- **Change the next session:** edit `src/_data/schedule.json`.
  - `regular` is the usual night (weekday 1 = Monday, time in QLD).
  - Add a one-off night to `overrides`, e.g. `{ "date": "2026-11-08", "time": "20:00", "note": "Sunday this week" }`.
  - Add a skipped Monday's date to `cancelled`.
  - Commit to `main` and the site redeploys in about a minute. The GitHub web editor works fine from a phone.
- **Add a session recap:** add an entry to a `content-raw/part4*.json` file, then run `npm run content`.
- **Content rules** (names to leave out, wording fixes, portraits) live in `content-raw/overrides.json`. `npm run content` refuses to build if an excluded name slips through.

## Develop

```bash
npm install
npm run serve        # http://localhost:8091
npm test             # unit tests
npm run e2e          # page tests at phone, tablet and desktop widths
```

`npm run images` rebuilds the background and preview card. `npm run portraits` re-downloads portraits from Foundry.

## How it fits together

- Eleventy builds static pages from `src/` into `_site/`. Pushing to `main` runs `.github/workflows/deploy.yaml`, which tests, builds, syncs `_site/` to the S3 bucket and refreshes CloudFront.
- The "who's coming" buttons call `backend/rsvp` (the `calendarHandler` Lambda behind `TavernCalendarAPI`). It only accepts the four players' names and yes / no / clear. It's rate-limited, so there's no login.
- The Foundry badge reads `https://foundry.thenatural20tavern.com/api/status` straight from the browser.
