# Natural 20 Tavern Site Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild thenatural20tavern.com as a mobile-first Eleventy site with next-session RSVPs, a live Foundry badge, the Curse of Strahd chronicle and codex, a players' wall, In Memoriam and campaigns pages. Harden the calendar API against abuse.

**Architecture:** Eleventy 3 builds static pages from JSON data files in `src/_data/`. Three small browser ES modules add the live parts: the Foundry status, the next-session banner and the RSVP buttons. The RSVP backend is the existing `calendarHandler` Lambda, rewritten for Node 22 behind the existing HTTP API with new `/rsvp` routes, reusing its existing IAM role and DynamoDB table. Pure logic lives in importable modules with `node:test` tests. Pages are checked by Playwright at three widths.

**Tech Stack:** Node 22, Eleventy 3 (Nunjucks), plain CSS, vanilla JS (ES modules), `@aws-sdk/lib-dynamodb` (provided by the Lambda runtime), `node:test`, Playwright, `sharp` for images, GitHub Actions, AWS (S3, CloudFront, API Gateway v2, Lambda, DynamoDB, Budgets).

**Spec:** `docs/superpowers/specs/2026-11-07-site-refresh-design.md`

## Global Constraints

- Player-known content only: no DM notes, hidden motives, unrevealed secrets or finale material.
- Jazz and her characters appear nowhere, and no entry mentions her, especially Danny's entries and his characters.
- First names only for players. RSVP roster: Danny, Fraser, Ryan, Stefan.
- No login or passcode anywhere.
- Mobile first: designed at 360px, no horizontal scroll, tap targets at least 44px, body text at least 16px.
- Sessions are scheduled in `Australia/Brisbane`. Times are shown in both QLD (`Australia/Brisbane`) and VIC (`Australia/Melbourne`).
- Regular session: Monday 20:00 QLD. Override: Sunday 2026-11-08 20:00 QLD.
- The user has authorised Claude to merge `site-refresh` into `main` and deploy once tests pass (this repo only).
- The repo lives at `D:\Projects\foundry-website-cos`. The C: drive is full, so local npm runs use `npm_config_cache=D:\npm-cache` and `TEMP/TMP=D:\tmp`.
- AWS: account 622842579488, region ap-southeast-2, API `1j3keab8uk` (stages `prod` and `$default`), Lambda `calendarHandler`, table `TavernCalendar` (key `date`, string), bucket `thenatural20tavern.com`, CloudFront `E32CDK4TJQ6G1I`.

---

## File structure

```
package.json, eleventy.config.js, .gitignore, playwright.config.js
src/
  _data/        site.json, schedule.json, characters.json, players.json, records.json,
                chronicle.json, codex.json, campaigns.json
  _includes/    layouts/base.njk, partials/nav.njk, partials/footer.njk, partials/portrait.njk
  assets/css/   main.css            (tokens, base, layout, components, one file)
  assets/js/    lib/schedule.js     (pure next-session + time formatting, shared with tests)
                next-session.js, rsvp.js, status.js, nav.js, codex-filter.js
  assets/fonts/ cinzel-*.woff2, eb-garamond-*.woff2
  assets/img/   bg-barovia.webp, og-card.jpg, favicon.svg, icons, portraits/*.webp
  index.njk, chronicle/index.njk, chronicle/session.njk, codex.njk, players.njk,
  in-memoriam.njk, campaigns.njk, 404.njk, calendar.njk, wiki.njk (redirect stubs)
backend/rsvp/   index.mjs (handler), validate.mjs, store.mjs
tests/unit/     schedule.test.mjs, validate.test.mjs, handler.test.mjs
tests/e2e/      pages.spec.js
scripts/        build-content.mjs (content-raw → src/_data with review rules), fetch-portraits.mjs
infra/          github-oidc.yaml
content-raw/    ChatGPT answers as received (not deployed)
.github/workflows/deploy.yaml
```

The old root files (`index.html`, `calendar.html`, `wiki.html`, `style.css`, `wiki.css`, `wiki.js`, `images/`) are removed. Their URLs are preserved by redirect stubs.

---

### Task 1: Scaffold Eleventy

**Files:**
- Create: `package.json`, `eleventy.config.js`, `.gitignore`, `src/index.njk` (temporary hello page)
- Delete: `index.html`, `calendar.html`, `wiki.html`, `style.css`, `wiki.css`, `wiki.js`, `images/images-3.jpeg`, `images/images-4.jpeg`, `images/images-5.jpeg`
- Keep for re-encoding: `images/barovia.png` (moved to `src/assets/img/src/barovia.png`)

**Interfaces:**
- Produces: `npm run build` writes `_site/`, `npm test` runs unit tests, `npm run e2e` runs Playwright.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "natural20tavern-site",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "eleventy",
    "serve": "eleventy --serve --port 8080",
    "test": "node --test tests/unit/",
    "e2e": "playwright test",
    "content": "node scripts/build-content.mjs",
    "portraits": "node scripts/fetch-portraits.mjs"
  },
  "devDependencies": {
    "@11ty/eleventy": "^3.1.2",
    "@playwright/test": "^1.56.0",
    "sharp": "^0.34.4"
  },
  "engines": { "node": ">=22" }
}
```

- [ ] **Step 2: Write eleventy.config.js**

```js
export default function (cfg) {
  cfg.addPassthroughCopy({ "src/assets/css": "assets/css" });
  cfg.addPassthroughCopy({ "src/assets/js": "assets/js" });
  cfg.addPassthroughCopy({ "src/assets/fonts": "assets/fonts" });
  cfg.addPassthroughCopy({ "src/assets/img": "assets/img", filter: (p) => !p.includes("/src/") });
  cfg.addFilter("pad2", (n) => String(n).padStart(2, "0"));
  cfg.addFilter("byStatus", (arr, ...s) => arr.filter((c) => s.includes(c.status)));
  return { dir: { input: "src", output: "_site" }, htmlTemplateEngine: "njk" };
}
```

- [ ] **Step 3: .gitignore** with `node_modules/`, `_site/`, `test-results/`, `playwright-report/`.
- [ ] **Step 4: Install and build.** Run `npm install`, then `npm run build`. Expected: `_site/index.html` exists.
- [ ] **Step 5: Commit** "Scaffold Eleventy build".

---

### Task 2: Next-session logic (pure, tested)

**Files:**
- Create: `src/assets/js/lib/schedule.js`, `src/_data/schedule.json`
- Test: `tests/unit/schedule.test.mjs`

**Interfaces:**
- Produces: `nextSession(schedule, now: Date) → { date: "YYYY-MM-DD", start: Date, note: string|null } | null` and `formatSessionTimes(start: Date) → { day: "Sunday 8 Nov", qld: "8:00 pm", vic: "9:00 pm" }`.

- [ ] **Step 1: schedule.json**

```json
{
  "timezone": "Australia/Brisbane",
  "regular": { "weekday": 1, "time": "20:00" },
  "overrides": [{ "date": "2026-11-08", "time": "20:00", "note": "Sunday this week" }],
  "cancelled": [],
  "players": ["Danny", "Fraser", "Ryan", "Stefan"]
}
```

`weekday` uses JS numbering (0 = Sunday, 1 = Monday). Brisbane is UTC+10 with no daylight saving, so a QLD wall time converts to UTC by subtracting 10 hours.

- [ ] **Step 2: Write failing tests**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSession, formatSessionTimes } from "../../src/assets/js/lib/schedule.js";

const base = { regular: { weekday: 1, time: "20:00" }, overrides: [], cancelled: [] };

test("override before the next Monday wins", () => {
  const s = { ...base, overrides: [{ date: "2026-11-08", time: "20:00", note: "Sunday this week" }] };
  const r = nextSession(s, new Date("2026-11-07T00:00:00Z"));
  assert.equal(r.date, "2026-11-08");
  assert.equal(r.start.toISOString(), "2026-11-08T10:00:00.000Z");
  assert.equal(r.note, "Sunday this week");
});

test("falls back to the regular Monday", () => {
  const r = nextSession(base, new Date("2026-11-10T00:00:00Z")); // Tue 10am QLD
  assert.equal(r.date, "2026-11-16");
});

test("session stays next until 4 hours after start", () => {
  const r = nextSession(base, new Date("2026-11-09T12:59:00Z")); // Mon 10:59pm QLD
  assert.equal(r.date, "2026-11-09");
  const r2 = nextSession(base, new Date("2026-11-09T14:01:00Z")); // Tue 12:01am QLD
  assert.equal(r2.date, "2026-11-16");
});

test("cancelled Monday is skipped", () => {
  const r = nextSession({ ...base, cancelled: ["2026-11-16"] }, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.date, "2026-11-23");
});

test("formats QLD and VIC (daylight saving) times", () => {
  const t = formatSessionTimes(new Date("2026-11-08T10:00:00Z"));
  assert.equal(t.qld, "8:00 pm");
  assert.equal(t.vic, "9:00 pm");
  assert.equal(t.day, "Sunday 8 Nov");
});

test("formats VIC without daylight saving in winter", () => {
  const t = formatSessionTimes(new Date("2027-06-07T10:00:00Z"));
  assert.equal(t.vic, "8:00 pm");
});
```

- [ ] **Step 3: Run** `npm test`. Expected: FAIL (module not found).
- [ ] **Step 4: Implement**

```js
const QLD_OFFSET_H = 10;
const LINGER_MS = 4 * 60 * 60 * 1000;

function qldToUtc(dateStr, time) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - QLD_OFFSET_H, mm));
}

function qldDateStr(dt) {
  const q = new Date(dt.getTime() + QLD_OFFSET_H * 3600e3);
  return q.toISOString().slice(0, 10);
}

export function nextSession(schedule, now = new Date()) {
  const cutoff = now.getTime() - LINGER_MS;
  const cancelled = new Set(schedule.cancelled || []);
  const candidates = [];
  for (const o of schedule.overrides || []) {
    const start = qldToUtc(o.date, o.time);
    if (start.getTime() >= cutoff && !cancelled.has(o.date)) candidates.push({ date: o.date, start, note: o.note ?? null });
  }
  const overrideDates = new Set((schedule.overrides || []).map((o) => o.date));
  let day = new Date(qldToUtc(qldDateStr(new Date(cutoff)), "00:00"));
  for (let i = 0; i < 60; i++) {
    const ds = qldDateStr(new Date(day.getTime() + 12 * 3600e3));
    const wd = new Date(ds + "T00:00:00Z").getUTCDay();
    if (wd === schedule.regular.weekday && !cancelled.has(ds) && !overrideDates.has(ds)) {
      const start = qldToUtc(ds, schedule.regular.time);
      if (start.getTime() >= cutoff) { candidates.push({ date: ds, start, note: null }); break; }
    }
    day = new Date(day.getTime() + 24 * 3600e3);
  }
  candidates.sort((a, b) => a.start - b.start);
  return candidates[0] ?? null;
}

const fmt = (tz, opts) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, ...opts });

export function formatSessionTimes(start) {
  const time = (tz) => fmt(tz, { hour: "numeric", minute: "2-digit", hour12: true }).format(start).replace(/\s?([ap])\.?m\.?/i, " $1m").toLowerCase();
  const parts = fmt("Australia/Brisbane", { weekday: "long", day: "numeric", month: "short" }).formatToParts(start);
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { day: `${get("weekday")} ${get("day")} ${get("month")}`, qld: time("Australia/Brisbane"), vic: time("Australia/Melbourne") };
}
```

- [ ] **Step 5: Run** `npm test`. Expected: all schedule tests PASS. Fix formatting differences (for example, narrow no-break spaces from `Intl`) in `time()` until they pass.
- [ ] **Step 6: Commit** "Add next-session schedule logic".

---

### Task 3: RSVP validation and handler (pure, tested)

**Files:**
- Create: `backend/rsvp/validate.mjs`, `backend/rsvp/store.mjs`, `backend/rsvp/index.mjs`
- Test: `tests/unit/validate.test.mjs`, `tests/unit/handler.test.mjs`

**Interfaces:**
- Produces: `validateSession(str, now) → string|null` (the normalised date, or null), `validatePut(body, roster, now) → { ok: true, value: { session, player, answer } } | { ok: false, error }`, and `createHandler({ store, roster, now }) → async (event) → { statusCode, headers, body }`.
- Store contract: `store.get(session) → { [player]: "yes"|"no" }` and `store.set(session, player, answer|null) → { [player]: ... }`.
- HTTP: `GET /rsvp?session=YYYY-MM-DD` → 200 `{ session, answers }`. `PUT /rsvp` with body `{ session, player, answer }` → 200 `{ session, answers }`. Validation failures → 400 `{ error }`. Any `/notes` route → 410. Anything else → 404.

- [ ] **Step 1: Failing tests for validation**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSession, validatePut } from "../../backend/rsvp/validate.mjs";
const now = new Date("2026-11-07T00:00:00Z");
const roster = ["Danny", "Fraser", "Ryan", "Stefan"];

test("session must be a real date within -1..+60 days", () => {
  assert.equal(validateSession("2026-11-08", now), "2026-11-08");
  assert.equal(validateSession("2026-11-06", now), "2026-11-06");
  assert.equal(validateSession("2026-11-04", now), null);
  assert.equal(validateSession("2027-02-01", now), null);
  assert.equal(validateSession("2026-02-30", now), null);
  assert.equal(validateSession("<script>", now), null);
  assert.equal(validateSession(undefined, now), null);
});

test("put accepts roster names and yes/no/clear only", () => {
  assert.deepEqual(validatePut({ session: "2026-11-08", player: "Danny", answer: "yes" }, roster, now),
    { ok: true, value: { session: "2026-11-08", player: "Danny", answer: "yes" } });
  assert.equal(validatePut({ session: "2026-11-08", player: "Bob", answer: "yes" }, roster, now).ok, false);
  assert.equal(validatePut({ session: "2026-11-08", player: "Danny", answer: "maybe" }, roster, now).ok, false);
  assert.equal(validatePut({ session: "2026-11-08", player: "danny", answer: "yes" }, roster, now).ok, false);
  assert.equal(validatePut(null, roster, now).ok, false);
  assert.equal(validatePut({ session: "2026-11-08", player: "Danny", answer: "clear" }, roster, now).value.answer, "clear");
});
```

- [ ] **Step 2: Failing tests for the handler** (in-memory store)

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../../backend/rsvp/index.mjs";

function memStore() {
  const m = new Map();
  return {
    async get(s) { return { ...(m.get(s) || {}) }; },
    async set(s, p, a) { const cur = { ...(m.get(s) || {}) }; if (a) cur[p] = a; else delete cur[p]; m.set(s, cur); return cur; },
  };
}
const roster = ["Danny", "Fraser", "Ryan", "Stefan"];
const now = () => new Date("2026-11-07T00:00:00Z");
const mk = () => createHandler({ store: memStore(), roster, now });
const ev = (routeKey, extra = {}) => ({ routeKey, ...extra });

test("GET returns empty answers then PUT updates them", async () => {
  const h = mk();
  let r = await h(ev("GET /rsvp", { queryStringParameters: { session: "2026-11-08" } }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body), { session: "2026-11-08", answers: {} });
  r = await h(ev("PUT /rsvp", { body: JSON.stringify({ session: "2026-11-08", player: "Ryan", answer: "no" }) }));
  assert.deepEqual(JSON.parse(r.body).answers, { Ryan: "no" });
  r = await h(ev("PUT /rsvp", { body: JSON.stringify({ session: "2026-11-08", player: "Ryan", answer: "clear" }) }));
  assert.deepEqual(JSON.parse(r.body).answers, {});
});

test("rejects bad input, oversized bodies and old routes", async () => {
  const h = mk();
  assert.equal((await h(ev("PUT /rsvp", { body: "{not json" }))).statusCode, 400);
  assert.equal((await h(ev("PUT /rsvp", { body: "x".repeat(1100) }))).statusCode, 400);
  assert.equal((await h(ev("GET /rsvp", { queryStringParameters: { session: "nope" } }))).statusCode, 400);
  assert.equal((await h(ev("POST /notes", { body: "{}" }))).statusCode, 410);
  assert.equal((await h(ev("GET /other"))).statusCode, 404);
});

test("base64 bodies from API Gateway are decoded", async () => {
  const h = mk();
  const body = Buffer.from(JSON.stringify({ session: "2026-11-08", player: "Stefan", answer: "yes" })).toString("base64");
  const r = await h(ev("PUT /rsvp", { body, isBase64Encoded: true }));
  assert.deepEqual(JSON.parse(r.body).answers, { Stefan: "yes" });
});
```

- [ ] **Step 3: Run** `npm test`. Expected: FAIL.
- [ ] **Step 4: Implement validate.mjs**

```js
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400e3;
export const ANSWERS = ["yes", "no", "clear"];

export function validateSession(s, now = new Date()) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  if (d.getTime() < today - DAY || d.getTime() > today + 60 * DAY) return null;
  return s;
}

export function validatePut(body, roster, now = new Date()) {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be a JSON object" };
  const session = validateSession(body.session, now);
  if (!session) return { ok: false, error: "Invalid session date" };
  if (typeof body.player !== "string" || !roster.includes(body.player)) return { ok: false, error: "Unknown player" };
  if (!ANSWERS.includes(body.answer)) return { ok: false, error: "Answer must be yes, no or clear" };
  return { ok: true, value: { session, player: body.player, answer: body.answer } };
}
```

- [ ] **Step 5: Implement index.mjs** (the handler factory, plus the Lambda entry that wires the DynamoDB store)

```js
import { validateSession, validatePut } from "./validate.mjs";

const json = (statusCode, obj) => ({ statusCode, headers: { "content-type": "application/json", "cache-control": "no-store" }, body: JSON.stringify(obj) });
const MAX_BODY = 1024;

export function createHandler({ store, roster, now = () => new Date() }) {
  return async (event) => {
    const route = event.routeKey || "";
    if (route.endsWith(" /notes")) return json(410, { error: "The old calendar has been retired" });
    if (route === "GET /rsvp") {
      const session = validateSession(event.queryStringParameters?.session, now());
      if (!session) return json(400, { error: "Invalid session date" });
      return json(200, { session, answers: await store.get(session) });
    }
    if (route === "PUT /rsvp") {
      let raw = event.body || "";
      if (event.isBase64Encoded) raw = Buffer.from(raw, "base64").toString("utf8");
      if (raw.length > MAX_BODY) return json(400, { error: "Body too large" });
      let body; try { body = JSON.parse(raw); } catch { return json(400, { error: "Body must be JSON" }); }
      const v = validatePut(body, roster, now());
      if (!v.ok) return json(400, { error: v.error });
      const { session, player, answer } = v.value;
      const answers = await store.set(session, player, answer === "clear" ? null : answer);
      return json(200, { session, answers });
    }
    return json(404, { error: "Not found" });
  };
}

let lambdaHandler;
export const handler = async (event) => {
  if (!lambdaHandler) {
    const { dynamoStore } = await import("./store.mjs");
    const roster = (process.env.PLAYERS || "").split(",").map((s) => s.trim()).filter(Boolean);
    lambdaHandler = createHandler({ store: dynamoStore(process.env.TABLE || "TavernCalendar", roster), roster });
  }
  return lambdaHandler(event);
};
```

- [ ] **Step 6: Implement store.mjs**

```js
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

export function dynamoStore(table, roster) {
  const doc = DynamoDBDocumentClient.from(new DynamoDBClient({}));
  const pick = (item) => Object.fromEntries(roster.filter((p) => item?.[p]).map((p) => [p, item[p]]));
  return {
    async get(session) {
      const r = await doc.send(new GetCommand({ TableName: table, Key: { date: `rsvp#${session}` } }));
      return pick(r.Item);
    },
    async set(session, player, answer) {
      const base = { TableName: table, Key: { date: `rsvp#${session}` }, ReturnValues: "ALL_NEW", ExpressionAttributeNames: { "#p": player, "#u": "updatedAt" } };
      const cmd = answer
        ? new UpdateCommand({ ...base, UpdateExpression: "SET #p = :a, #u = :t", ExpressionAttributeValues: { ":a": answer, ":t": new Date().toISOString() } })
        : new UpdateCommand({ ...base, UpdateExpression: "REMOVE #p SET #u = :t", ExpressionAttributeValues: { ":t": new Date().toISOString() } });
      const r = await doc.send(cmd);
      return pick(r.Attributes);
    },
  };
}
```

- [ ] **Step 7: Run** `npm test`. Expected: all PASS.
- [ ] **Step 8: Commit** "Add RSVP Lambda with validation".

---

### Task 4: Deploy the backend and protections (AWS)

Needs free space on C:. The AWS tool stages zip files in `C:\Users\Matt\AppData\Local\Temp\aws-api-mcp\workdir`.

- [ ] **Step 1: Check the role** that `calendarHandler-role-ql2kqxop` allows `dynamodb:GetItem` and `dynamodb:UpdateItem` on `TavernCalendar` (`aws iam list-attached-role-policies`, `list-role-policies`, `get-role-policy`). If it only allows Put/Scan/Query, stop and ask the user to add GetItem/UpdateItem. Claude does not edit IAM.
- [ ] **Step 2: Package** `backend/rsvp/*.mjs` into `rsvp.zip` (no node_modules; the Node 22 runtime ships AWS SDK v3). Copy it into the AWS tool's workdir.
- [ ] **Step 3: Update the function:**
  - `aws lambda update-function-configuration --function-name calendarHandler --runtime nodejs22.x --handler index.handler --timeout 5 --environment "Variables={PLAYERS=Danny,Fraser,Ryan,Stefan,TABLE=TavernCalendar}"`
  - `aws lambda update-function-code --function-name calendarHandler --zip-file fileb://rsvp.zip`
  - `aws lambda put-function-concurrency --function-name calendarHandler --reserved-concurrent-executions 2`
- [ ] **Step 4: Add routes** `GET /rsvp` and `PUT /rsvp` on API `1j3keab8uk`, targeting the same integration as `GET /notes` (look up its `integrations/<id>`).
- [ ] **Step 5: CORS:**
  - `aws apigatewayv2 update-api --api-id 1j3keab8uk --cors-configuration AllowOrigins=https://thenatural20tavern.com,https://www.thenatural20tavern.com,http://localhost:8080,AllowMethods=GET,PUT,OPTIONS,AllowHeaders=content-type,MaxAge=600`
  - `localhost:8080` is removed in Task 11.
- [ ] **Step 6: Throttling** on both stages:
  - `aws apigatewayv2 update-stage --api-id 1j3keab8uk --stage-name prod --default-route-settings ThrottlingRateLimit=2,ThrottlingBurstLimit=5`
  - The same for `$default`.
  - Then `aws apigatewayv2 create-deployment --api-id 1j3keab8uk --stage-name prod`.
- [ ] **Step 7: Smoke test** from the browser pane at `https://thenatural20tavern.com`:
  - GET `/prod/rsvp?session=2026-11-08` → 200 `{answers:{}}`
  - PUT Danny yes → 200, then PUT clear
  - GET `/prod/notes?month=11&year=2026` → 410
  - PUT `player:"Bob"` → 400
- [ ] **Step 8: Budget alert.** `aws budgets describe-budgets --account-id 622842579488`. If no budget covers the account, create a $5 monthly COST budget with 80% and 100% ACTUAL notifications to the email on the account's existing budgets or alerts. If none exists, ask the user which address to use.
- [ ] **Step 9: Commit** "Deploy RSVP backend" (records the commands in `backend/README.md`).

---

### Task 5: Design system, base layout and navigation

**Files:**
- Create: `src/assets/css/main.css`, `src/_includes/layouts/base.njk`, `src/_includes/partials/nav.njk`, `src/_includes/partials/footer.njk`, `src/assets/js/nav.js`, `src/_data/site.json`, the fonts, `src/assets/img/favicon.svg`, `og-card.jpg`, `bg-barovia.webp`

**Requirements:**
- Tokens on `:root`:
  - colours: `--ink #0d0b0e`, `--night #16121a`, `--stone #221c26`, `--parchment #efe3c8`, `--parchment-ink #2a1d14`, `--blood #e63946`, `--blood-deep #9e1f2b`, `--candle #f5c46b`, `--mist #b9b3c2`
  - spacing: `--s1`–`--s7` (4, 8, 12, 16, 24, 40, 64px)
  - radius: `--r 10px`
  - type: `--font-display "Cinzel"`, `--font-body "EB Garamond"`, body size `clamp(1rem, 0.95rem + 0.3vw, 1.125rem)`
- Base layout:
  - skip link, `<header>` with nav, `<main id="main">`, footer
  - page title as `{{ title }} · The Natural 20 Tavern`
  - meta description, Open Graph and Twitter tags pointing at `/assets/img/og-card.jpg`
  - favicon SVG (d20), `theme-color #0d0b0e`
- Nav:
  - links: Home, Chronicle, Codex, Players, In Memoriam, Campaigns, plus a button-styled "Enter the Foundry"
  - below 768px a menu button toggles a full-width panel (`nav.js` sets `aria-expanded`)
  - links are at least 44px tall
- Background: `bg-barovia.webp` (re-encoded with sharp, width 1920, quality 70, about 200 KB) under a dark gradient. Never `background-attachment: fixed` on mobile.
- Components: `.card` (dark), `.parchment` (light reading card), `.btn`, `.btn--ghost`, `.badge`, `.grid` (auto-fill minmax(260px, 1fr)), `.section-title` with candle rule.
- `@media (prefers-reduced-motion: reduce)` disables animations.
- Fonts: download Cinzel (600, 700) and EB Garamond (400, 400 italic, 600) woff2 from the Google Fonts CSS API on D:. Self-host with `font-display: swap`.

- [ ] **Step 1:** Write `main.css` and the layout/partials as specified.
- [ ] **Step 2:** Generate `bg-barovia.webp`, `og-card.jpg` (1200x630 crop of the background with the title) and `favicon.svg` (d20 outline in `--blood`) with a one-off `scripts/make-images.mjs` using sharp.
- [ ] **Step 3:** `npm run build`. Open `_site/index.html` through `npm run serve` in the browser pane at 360px and 1280px. Check the nav menu toggles and there's no horizontal scroll.
- [ ] **Step 4: Commit** "Add design system and base layout".

---

### Task 6: Home page with next session, RSVPs and Foundry status

**Files:**
- Create: `src/index.njk`, `src/assets/js/next-session.js`, `src/assets/js/rsvp.js`, `src/assets/js/status.js`

**Interfaces:**
- Consumes: `nextSession`, `formatSessionTimes` (Task 2), the RSVP API (Task 3/4), `schedule.json`
- Produces: DOM hooks `#next-session` (with `data-schedule` holding the JSON), `#rsvp` (with `data-api`), `#foundry-status`

**Behaviour:**
- Hero:
  - "The Natural 20 Tavern" and the Barovia tagline
  - primary button "Enter the Foundry" (https://foundry.thenatural20tavern.com)
- **Next session card:**
  - day, "8:00 pm QLD · 9:00 pm VIC", note if any
  - a live countdown ("in 1 day 3 hrs"), switching to "Happening now" when within 4 hours after start
  - no-JS fallback text: "Mondays, 8:00 pm QLD / 9:00 pm VIC"
- **RSVP:**
  - one row per player: name, a 👍 button and a 👎 button (`aria-pressed`), current answer highlighted
  - tapping the active answer again sends `clear`
  - optimistic update; roll back and show "Couldn't save, try again" on failure
  - GET refreshes on load and every 60 s while the page is visible
  - API base: `https://1j3keab8uk.execute-api.ap-southeast-2.amazonaws.com/prod`
  - summary line: "3 in · 1 out · 0 waiting"
- **Foundry status:**
  - fetch `https://foundry.thenatural20tavern.com/api/status` with a 5 s timeout
  - "Online · Curse of Strahd · N players connected" when `active` and `world`, using a friendly world title from `site.json` worlds map (`curse-of-strahd` → "Curse of Strahd", `iron-sun` → "Iron Sun")
  - "Online · no world running" when `active` is false
  - "Offline" on error
  - refresh every 60 s while visible
- **Latest chronicle entry:** the highest session number from `chronicle.json`, linking to its page.

- [ ] **Step 1:** Implement the three modules and the page.
- [ ] **Step 2:** Verify in the browser pane against the live API (localhost is allowed by CORS from Task 4): set and clear an answer, then reload and confirm it persists.
- [ ] **Step 3: Commit** "Add home page with next session, RSVPs and Foundry status".

---

### Task 7: Content build with review rules and portraits

**Files:**
- Create: `scripts/build-content.mjs`, `scripts/fetch-portraits.mjs`, `content-raw/overrides.json`
- Output: `src/_data/characters.json`, `players.json`, `records.json`, `chronicle.json`, `codex.json`, `campaigns.json`, `src/assets/img/portraits/*.webp`

**Rules applied by build-content.mjs:**
1. **Exclusion:** drop any entry, list item, quote or sentence (split on `. `) containing an excluded name from `overrides.json` → `exclude` (initially `["Jazz"]`, plus any of her character names if identified). Log every drop to the console.
2. **Removals:** `overrides.json` → `removeQuotes` (exact strings) and `removeEntries`. Initially remove Danny's quote "If your face is the last I see before I depart, I will die happy", because who it was addressed to can't be confirmed.
3. **Fixes:** `overrides.json` → `replace` pairs, e.g. "Hruket's likeness" → "The likeness of Hrulek's master".
4. **Chronicle merge:** concatenate the `part4*` files, drop entries where `recap` is null, sort by session.
5. **Codex/campaigns:** pass through, with the same exclusion.
6. **Portraits:** `portraitMap` in `overrides.json` maps character name → Foundry image path (e.g. `"Hrulek Surprise": "forge-assets/tokenizer/pc-images/hrulek.Avatar.webp"`). `fetch-portraits.mjs` downloads each from `https://foundry.thenatural20tavern.com/<path>` and resizes to 480x480 cover WebP (quality 72). Characters without a portrait get a styled monogram.
7. **Spoiler flags:** any recap or codex entry containing words from `overrides.json` → `spoilerWatch` (e.g. "secret", "finale", "will", "plans to") is printed for manual review. Entries are not dropped automatically.

- [ ] **Step 1:** Implement both scripts and `overrides.json`.
- [ ] **Step 2:** `npm run content && npm run portraits`. Review the console log of drops and flags.
- [ ] **Step 3:** Unit test `tests/unit/content.test.mjs`. Feed a fixture with a Jazz entry, a sentence mentioning Jazz and a removed quote, and assert all three are gone and other content is intact.
- [ ] **Step 4: Commit** "Build content data with review rules".

---

### Task 8: Chronicle and codex pages

**Files:**
- Create: `src/chronicle/index.njk`, `src/chronicle/session.njk`, `src/codex.njk`, `src/assets/js/codex-filter.js`

**Requirements:**
- **Chronicle index:**
  - grouped by arc in 15-session blocks ("Sessions 1–15"…) with `<details>` per block, the newest block open
  - each card: "Session N", title, recap, location, link to its page
- **Session page:** paginate `chronicle` with `size: 1`, permalink `/chronicle/session-{{ s.session | pad2 }}/`. Shows the title, recap, location, NPC chips, highlight as a pull quote, and prev/next links.
- **Codex:**
  - tabs/filter buttons for People, Places, Factions, Lore, plus a search box (`codex-filter.js` filters by `data-type` and text)
  - people show status and relationship badges
  - every entry shows "First seen: Session N", linking to the session page
  - without JS everything shows, grouped by headings
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Build and check at 360px.
- [ ] **Step 3: Commit** "Add chronicle and codex".

---

### Task 9: Players' Wall, In Memoriam and Campaigns

**Files:**
- Create: `src/players.njk`, `src/in-memoriam.njk`, `src/campaigns.njk`, `src/_includes/partials/portrait.njk`

**Requirements:**
- **Players:** one parchment card per player from `players.json`:
  - name and award as a ribbon
  - the characters they played, with portrait and status
  - best quotes as pull quotes
  - legendary moment (with a session link), funniest moment, signature move, worst decision, running jokes, nat 20 moments
  - current players first (Danny, Fraser, Ryan, Stefan), then past players
- **In Memoriam:**
  - characters with status `dead` or `retired`, in fate-session order
  - each a tombstone card: portrait (greyscale, candle glow on hover/focus), name, player, "Sessions A–B", fate, killed by, last words (italic), epitaph engraved, brought-back note if any
  - a CSS-only candle flicker that respects reduced motion
- **Records strip on In Memoriam:** villains defeated, biggest fights, closest calls from `records.json`.
- **Campaigns:** cards from `campaigns.json`, with Curse of Strahd marked "Final chapter" and highlights as a list.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Build and check at 360px.
- [ ] **Step 3: Commit** "Add players, memoriam and campaigns pages".

---

### Task 10: 404, redirects and end-to-end tests

**Files:**
- Create: `src/404.njk`, `src/calendar.njk` (permalink `/calendar.html`, meta refresh to `/`), `src/wiki.njk` (permalink `/wiki.html`, meta refresh to `/codex/`), `playwright.config.js`, `tests/e2e/pages.spec.js`

- [ ] **Step 1: playwright.config.js**

```js
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  webServer: { command: "npx @11ty/eleventy --serve --port 8080", url: "http://localhost:8080", reuseExistingServer: true },
  use: { baseURL: "http://localhost:8080" },
  projects: [
    { name: "phone", use: { viewport: { width: 360, height: 780 } } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 } } },
    { name: "desktop", use: { viewport: { width: 1280, height: 900 } } },
  ],
});
```

- [ ] **Step 2: tests/e2e/pages.spec.js**

```js
import { test, expect } from "@playwright/test";
const pages = ["/", "/chronicle/", "/chronicle/session-01/", "/codex/", "/players/", "/in-memoriam/", "/campaigns/"];

for (const path of pages) {
  test(`${path} loads cleanly with no sideways scroll`, async ({ page }) => {
    const errors = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.route(/execute-api/, (r) => r.fulfill({ json: { session: "2026-11-08", answers: { Danny: "yes" } } }));
    await page.route(/api\/status/, (r) => r.fulfill({ json: { active: true, world: "curse-of-strahd", users: 3 } }));
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
    expect(await page.content()).not.toContain("Jazz");
  });
}

test("RSVP toggles and sends clear on second tap", async ({ page }) => {
  const sent = [];
  await page.route(/execute-api/, async (r) => {
    if (r.request().method() === "PUT") { const b = r.request().postDataJSON(); sent.push(b); return r.fulfill({ json: { session: b.session, answers: b.answer === "clear" ? {} : { [b.player]: b.answer } } }); }
    return r.fulfill({ json: { session: "2026-11-08", answers: {} } });
  });
  await page.route(/api\/status/, (r) => r.fulfill({ status: 500 }));
  await page.clock.setFixedTime(new Date("2026-11-07T00:00:00Z"));
  await page.goto("/");
  await expect(page.locator("#next-session")).toContainText("8:00 pm QLD");
  await expect(page.locator("#next-session")).toContainText("9:00 pm VIC");
  const up = page.getByRole("button", { name: "Fraser is in" });
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "true");
  await up.click();
  await expect(up).toHaveAttribute("aria-pressed", "false");
  expect(sent.map((s) => s.answer)).toEqual(["yes", "clear"]);
  await expect(page.locator("#foundry-status")).toContainText("Offline");
});

test("tap targets in the nav are at least 44px tall", async ({ page }) => {
  await page.goto("/");
  const toggle = page.locator("[data-nav-toggle]");
  if (await toggle.isVisible()) await toggle.click();
  for (const box of await page.locator("nav a").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(box).toBeGreaterThanOrEqual(44);
});
```

- [ ] **Step 3:** `npx playwright install chromium`, then `npm run e2e`. Expected: all pass on phone, tablet and desktop.
- [ ] **Step 4: Commit** "Add 404, redirects and end-to-end tests".

---

### Task 11: Deploy pipeline, headers and go-live

**Files:**
- Modify: `.github/workflows/deploy.yaml`
- Create: `infra/github-oidc.yaml`

- [ ] **Step 1: Workflow**

```yaml
name: Deploy site
on:
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}
      - run: aws s3 sync _site/ s3://${{ secrets.AWS_S3_BUCKET }} --delete
      - run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"
```

`--delete` on the first run removes the stray `.git/`, `.github/` and old files from the bucket.

- [ ] **Step 2: infra/github-oidc.yaml.** A CloudFormation template with:
  - a GitHub OIDC provider (parameter to reuse an existing one)
  - role `natural20tavern-deploy`, trusted for `repo:matt-milzewski/foundry-website-cos:ref:refs/heads/main`
  - a policy allowing `s3:ListBucket` on the bucket, `s3:PutObject`/`s3:DeleteObject` on `bucket/*`, and `cloudfront:CreateInvalidation` on the distribution

  The user deploys it. The README explains the swap to `role-to-assume`.
- [ ] **Step 3: Security headers.** Create the CloudFront response headers policy `natural20tavern-headers`:
  - HSTS: max-age 31536000, includeSubdomains
  - `nosniff`
  - `frame-options` DENY
  - referrer `strict-origin-when-cross-origin`
  - CSP: `default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self' https://1j3keab8uk.execute-api.ap-southeast-2.amazonaws.com https://foundry.thenatural20tavern.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`

  Attach it to the default behaviour of `E32CDK4TJQ6G1I`, and add custom error responses 403 and 404 → `/404.html` with response code 404.
- [ ] **Step 4: Go live:**
  - push `site-refresh`, open the PR, run the checks locally, then merge to `main` (authorised)
  - watch the Actions run
  - verify the live site in the browser pane: every page at 360px, RSVP round trip, Foundry badge, `/.git/HEAD` → 404, security headers present
- [ ] **Step 5: Cleanup:**
  - remove the `GET /notes` and `POST /notes` routes and `http://localhost:8080` from CORS
  - redeploy the `prod` stage
  - ask the user before deleting the `add-book-effect` and `add-wiki-page` branches

---

## Self-review

- **Spec coverage:**
  - W1: Task 11
  - W2: Tasks 5 and 6
  - W3: Task 5 and all page tasks
  - W4: Task 6
  - W5: Tasks 2, 3, 4 and 6
  - W6: Tasks 7 and 9
  - W7: Task 9
  - W8: Tasks 7 and 8
  - Protections: Tasks 3, 4 and 11
  - Mobile: Tasks 5 and 10
  - Exclusion rules: Tasks 7 and 10
- **Change from spec:** the old `/notes` routes return 410 from the new handler immediately, instead of running alongside. Nobody has used the calendar since June 2025, and this avoids keeping the old code.
- **Change from spec:** the RSVP handler reuses the `calendarHandler` function and role instead of a new function. That avoids creating IAM resources.
