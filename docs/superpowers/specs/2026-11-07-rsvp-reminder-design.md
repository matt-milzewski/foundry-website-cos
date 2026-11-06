# RSVP reminder email — design

Approved by Matt in chat on 2026-11-07.

## Goal

Email Matt a summary of who's coming to the next session, so he doesn't have to keep checking the site.

## When it sends

One email per session, at whichever comes first:

- **everyone has replied** (all players in `schedule.json` have answered yes or no), or
- **48 hours before the session starts** (or as soon as possible after that, if a session is booked at shorter notice).

If the 48-hour email goes out while replies are still missing, one more email goes out when the last player answers. That makes at most two emails per session. Nothing is sent once the session has started, and later answer changes don't trigger more email.

A job runs hourly at 5 minutes past the hour, so emails arrive within an hour of either trigger. For example, a Wednesday 7:00 pm QLD session gets its 48-hour email around 7:05 pm QLD on Monday.

Moving a session to a new date starts afresh, because state is kept per session date.

## What the email says

- **From:** `Natural 20 Tavern <reminders@thenatural20tavern.com>`
- **To:** Matt. The address is a deploy-time parameter and is not stored in this public repo.
- **Subject:** built from the replies:
  - `Wednesday 11 Nov: everyone's in`
  - `Wednesday 11 Nov: everyone's replied, 3 in, 1 out`
  - `Wednesday 11 Nov: 2 in, 1 out, 1 no reply`
- **Body (plain text and simple HTML):**
  - a line saying why it was sent
  - the session day with QLD and VIC times
  - each player as 👍 In, 👎 Out or No reply yet
  - "Still waiting on …" when replies are missing
  - a link to the site

## How it works

- **Site:** publishes `/schedule.json` (the same data as the banner). The job reads it, so a schedule change merged to `main` reaches the job after the normal deploy.
- **`backend/reminder/logic.mjs`:** pure functions.
  - `summarise(players, answers)`
  - `decide({ start, now, summary, state })` → `"everyone" | "48h" | "final" | null`
  - `composeEmail(...)`
- **`backend/reminder/index.mjs`:** `createReminder({ loadSchedule, store, send, now, siteUrl })`. It uses `nextSession` / `formatSessionTimes` from `src/assets/js/lib/schedule.js`, the same code as the banner.
- **`backend/reminder/aws.mjs`:**
  - Reads RSVPs from the `rsvp#YYYY-MM-DD` items in `TavernCalendar`.
  - Records what was sent in `reminder#YYYY-MM-DD` with conditional writes, so overlapping or retried runs can't send twice. If sending fails, the record is undone so the next run retries.
  - Sends through SES v2.
- **`infra/reminder.yaml`:**
  - the SES domain identity for `thenatural20tavern.com` with Easy DKIM, plus its three Route 53 CNAMEs
  - the `rsvpReminder` Lambda (Node 22)
  - an hourly EventBridge rule
  - a log group with 30-day retention
  - a role that can only:
    - read `rsvp#*` / `reminder#*` items
    - update `reminder#*` items
    - send from `reminders@thenatural20tavern.com`
- **`scripts/deploy-reminder.ps1`:** zips the function and uploads its code.
- **Test mode:** invoking with `{"test": true}` sends a `[Test]` email for the next session straight away, without recording anything.

## Cost

About 720 Lambda runs a month and a handful of emails, all within free tiers.

## Testing

- Unit tests (`tests/unit/reminder.test.mjs`) cover:
  - summary counts
  - every send rule
  - email wording and escaping
  - the handler with fake storage and sender: duplicates, claim races and send failures
- A page test checks that `/schedule.json` is published.
- After deploy, a real test email is sent to Matt.
