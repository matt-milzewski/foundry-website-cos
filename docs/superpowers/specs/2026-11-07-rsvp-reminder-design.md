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

## Player reminders

Added on 2026-11-07 at Matt's request.

Players who haven't tapped 👍 or 👎 get a reminder email. Anyone who has answered gets nothing.

**Timing.** A session "goes live" when the job first sees it as the next session. That happens when the previous game starts, or after a schedule change.

- **Goes live more than 48 hours ahead:**
  - first reminder 24 hours after it goes live
  - second reminder 48 hours before the game, unless that would land within 24 hours of the first
- **Goes live 48 hours or less ahead:** one reminder 24 hours before the game, or straight away if that time has passed.
- **A normal Monday week:**
  - Monday 8 pm QLD: the game starts and next Monday goes live
  - Tuesday about 8 pm QLD: first reminder
  - Saturday about 8 pm QLD: second reminder, at the same time as Matt's 48-hour summary

**The email:**
- **From:** Natural 20 Tavern, with Reply-To set to Matt
- **Subject:** "Are you in for Monday 16 Nov?"
- **Body:** both times, a link to the buttons, and a note that the reminders stop once they answer

**Storage.**
- Addresses live in the SSM SecureString `/natural20tavern/player-emails` as a JSON map like `{"Danny": "..."}`. They are never in this repo or on the site.
- To add or change someone, overwrite the parameter.
- Players without an address are skipped.

**Start date.** The `RemindersFrom` stack parameter (`REMINDERS_FROM`) turns off all reminder emails, to Matt and to players, for sessions before that date. It's set to 2026-11-16, so Wednesday 11 Nov gets no emails. The `reminder#2026-11-11` item is also marked `firstEmail: "skipped"`.

**Preview.** `{"preview": true}` reports the next session, whether emails are on, who has an address, and sample subjects. It sends nothing.
