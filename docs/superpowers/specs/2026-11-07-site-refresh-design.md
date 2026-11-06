# The Natural 20 Tavern: site refresh design

Date: 2026-11-07. Status: design approved in chat, spec awaiting review.

## Goal

Turn thenatural20tavern.com from a three-page placeholder into the group's home: a gothic, mobile-first site with the next session and who's coming, a live Foundry status, the Curse of Strahd chronicle, a players' wall, an In Memoriam page and a campaigns page. Covers audit items W1–W8.

## Hard rules

- **Player-known content only.** Everything in the chronicle, codex, wall and memoriam is what the players saw, heard or learned at the table. No DM notes, hidden motives, unrevealed secrets or anything about the finale.
- **Jazz is excluded.** She and her characters appear nowhere on the site, and no entry mentions her, including Danny's entries and his characters. Content is checked for this before it goes in.
- **First names only** for players: Danny, Fraser, Ryan, Stefan. Past players (except Jazz) use first names too.
- **No login or passcode.** Anyone can set availability. Protection comes from validation and rate limits, not accounts.
- **Mobile first.** Every page is designed at 360px wide first and must have no horizontal scroll, tap targets of at least 44px and readable text without zooming.
- **Nothing goes live until the user merges.** All work lands on branch `site-refresh` and reaches the site through a pull request.
- The Foundry world is not touched.

## Stack

- **Eleventy 3** (the same tool the user's AnchorWebCo site uses), Nunjucks templates, content in JSON data files under `src/_data/`.
- **Plain CSS** with design tokens in one stylesheet. No CSS framework.
- **Small vanilla JS modules**, one per feature: `status.js` (Foundry badge), `next-session.js` (banner and countdown), `rsvp.js` (availability). Pages work without JS except for those live widgets, which show a plain fallback.
- **Fonts are self-hosted** (Cinzel for headings, EB Garamond for body text, both open-licence) so the content security policy can stay tight.
- **Images**: portraits pulled from Foundry and converted to WebP with `sharp` at build-prep time. The background is re-encoded from the 2.1 MB PNG to WebP at about 200 KB, with an AVIF variant if it's smaller.
- The repo lives at `D:\Projects\foundry-website-cos` because the C: drive is full.

## Pages

| Page | URL | Content |
|---|---|---|
| Home | `/` | Barovia hero, next-session banner with RSVPs, Foundry status badge, latest chronicle entry, "Enter the Foundry" button |
| Chronicle | `/chronicle/` | Every session as a card (number, title, 2–4 sentence recap, location, highlight); one page per session at `/chronicle/session-NN/` |
| Codex (the wiki) | `/codex/` | People, places, factions and lore as the party knows them, filterable by type, each linking to the session it was first seen |
| Players' Wall | `/players/` | One card per player: current and past characters with portraits, best quotes, legendary moment, funniest moment, signature move, award, running jokes |
| In Memoriam | `/in-memoriam/` | Candlelit grid of fallen and retired characters: portrait, name, player, sessions, how they fell, last words, epitaph |
| Campaigns | `/campaigns/` | Curse of Strahd as the final chapter, the one-shots (Pirates, Boonventures, Boons & Banes) and anything planned, with spoiler-free blurbs |
| 404 | `/404.html` | Themed not-found page, wired as CloudFront's custom error response |

Navigation: a top bar on desktop, a compact menu button on phones. The old `calendar.html` and `wiki.html` redirect to `/` and `/codex/` with meta-refresh pages so old links keep working.

## Look (W2, W3)

- Dark gothic theme everywhere: near-black backgrounds, the existing blood-red accent (`#e63946`), parchment cards for reading content, candlelight glow on the memoriam page.
- One type scale and spacing scale in tokens. Body text at least 16px on phones.
- d20 favicon and app icons, page titles and descriptions, and an Open Graph and Twitter image so links shared in Discord show a Barovia card.
- Respects `prefers-reduced-motion`: candle flicker and countdown animation switch off.
- Accessibility: colour contrast at least 4.5:1 for text, visible focus styles, alt text on every portrait.

## Next session and availability (W5)

**Schedule data** in `src/_data/schedule.json`, edited by the user:

```json
{
  "timezone": "Australia/Brisbane",
  "regular": { "weekday": "Monday", "time": "20:00" },
  "overrides": [{ "date": "2026-11-08", "time": "20:00", "note": "Sunday this week" }],
  "cancelled": [],
  "players": ["Danny", "Fraser", "Ryan", "Stefan"]
}
```

- The browser works out the next session: the earliest upcoming override, otherwise the next regular Monday, skipping cancelled dates. A session counts as "next" until it starts; then the banner moves straight on to the one after.
- The banner shows the night in both group time zones, because only the user is in Queensland: "Sunday 8 Nov · 8:00 pm QLD · 9:00 pm VIC". Victoria's daylight saving is handled with `Intl.DateTimeFormat` for `Australia/Brisbane` and `Australia/Melbourne`. It also shows a countdown.
- Under the banner, each player's first name has a thumbs-up and thumbs-down button showing their current answer. Tapping sets it, and tapping the same one again clears it. Everyone sees everyone's answers.
- Answers are tied to the session date, so they reset by themselves when the next session comes round.
- The old free-text calendar is retired. Its 21 entries from 2025 stay in the table untouched.

**API** (the existing HTTP API `TavernCalendarAPI`, new routes alongside the old ones until the new site is live):

- `GET /rsvp?session=YYYY-MM-DD` returns `{ "session": "...", "answers": { "Danny": "yes", "Fraser": "no" } }`.
- `PUT /rsvp` with `{ "session": "YYYY-MM-DD", "player": "Danny", "answer": "yes" | "no" | "clear" }` returns the updated answers.
- Stored in the existing DynamoDB table `TavernCalendar` as item `date = "rsvp#YYYY-MM-DD"` with one attribute per player and `updatedAt`.
- The old `GET/POST /notes` routes are removed after the new site is merged and live.

## Protection against abuse

Nobody logs in, so anyone can change any answer. The user is fine with that. The goal is that nobody can break the site, inject content or run up the AWS bill.

- **Validation in the Lambda:** `session` must be a real date from 1 day ago to 60 days ahead. `player` must be one of the names in the roster, which is held in a Lambda environment variable. `answer` must be `yes`, `no` or `clear`. Bodies over 1 KB are rejected. Anything else gets a plain 400 response. No free text is ever stored, so nothing can be injected.
- **Rendering** uses `textContent` only.
- **Rate limits:** API stage throttling of 2 requests per second with a burst of 5, and Lambda reserved concurrency of 2, which caps the worst-case cost.
- **CORS** allows only `https://thenatural20tavern.com` and `https://www.thenatural20tavern.com`.
- **Runtime:** Node 18 (end of life) moves to Node 22.
- **Budget alert:** an AWS budget of $5/month emails the user at 80% and 100%.
- **Security headers** through a CloudFront response headers policy: HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors 'none'`, and a content security policy allowing only the site itself, the calendar API and `foundry.thenatural20tavern.com/api/status`.

## Foundry status badge (W4)

- The browser calls `https://foundry.thenatural20tavern.com/api/status`. That endpoint already allows calls from other sites.
- It shows "Online · Curse of Strahd · 3 players connected" when Foundry is running, "Online · no world running" when no world is launched, and "Offline" when the call fails or takes longer than 5 seconds.
- It refreshes every 60 seconds while the page is visible.

## Deploy (W1)

- GitHub Actions: `actions/checkout@v4` and `actions/setup-node@v4` (Node 22), then `npm ci` and `npm run build`. Then `aws s3 sync _site/ s3://thenatural20tavern.com --delete` and a CloudFront invalidation.
- Only the built site is uploaded. The first deploy's `--delete` removes the stray `.git/` and `.github/` objects from the bucket.
- **Keyless deploy (optional, needs the user):** a CloudFormation template at `infra/github-oidc.yaml` defines a GitHub OIDC role that can only write to this bucket and invalidate this distribution. It changes account permissions, so the user deploys it with one command. After it works, the user deletes the old access key secrets and deactivates the key. Until then the workflow keeps using the existing secrets.
- The two leftover Copilot branches (`add-book-effect`, `add-wiki-page`) are deleted after the merge, with the user's OK.

## Content pipeline (W6, W7, W8)

1. The user pastes one prompt into their ChatGPT plugin. It answers in parts as JSON: characters, players' wall, party records, chronicle in 15-session chunks, codex, campaigns.
2. The user pastes the JSON back. It's validated against the schemas and saved as `src/_data/characters.json`, `players.json`, `records.json`, `chronicle.json`, `codex.json` and `campaigns.json`.
3. **Review pass before anything ships:**
   - remove anything about Jazz
   - flag anything that reads like DM-only knowledge or a finale spoiler, for the user to decide
   - match character names to Foundry portraits
4. Until the real content arrives, pages render from a small sample file so layout work isn't blocked.

## Testing

- **Lambda:** unit tests with `node:test` covering validation, each answer transition and roster enforcement.
- **Site:**
  - `npm run build` must pass
  - a link checker over `_site/`
  - Playwright smoke tests at 360px, 768px and 1280px: each page loads, there is no horizontal scroll and no console errors, the RSVP buttons work against a mocked API, and the countdown shows the right QLD and VIC times
- **Manual check** in the browser pane before the pull request.

## Rollout

1. Lambda and API changes deploy first. The new `/rsvp` routes are added alongside `/notes`, so the live site keeps working.
2. Throttling, CORS, the budget alert and the security headers are applied. The live calendar page runs on the same domain, so it keeps working.
3. The site goes on `site-refresh` and the user reviews the pull request and preview screenshots.
4. The user merges and the site deploys.
5. The old `/notes` routes are removed and the stale branches cleaned up.

## Out of scope

Logins, comments, editing content from the browser, renaming the repo (possible later), and any Foundry changes.
