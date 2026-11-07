// Hourly job (rsvpReminder Lambda) for the next session:
// - emails Matt who's coming once everyone has replied or it's 48 hours away, whichever is first
// - nudges players who haven't answered (see nudgeDue in logic.mjs for the timing)
// See docs/superpowers/specs/2026-11-07-rsvp-reminder-design.md.
//   {}                                  normal hourly run
//   {"preview": true}                   show what's set up and what would be sent, sending nothing
//   {"test": true}                      send Matt a [Test] summary for the next session now
//   {"test": "player", "player": "X"}   send Matt a [Test] copy of X's nudge (never the player)

import { nextSession, formatSessionTimes } from "../../src/assets/js/lib/schedule.js";
import { summarise, decide, composeEmail, nudgeDue, composeNudge } from "./logic.mjs";

/**
 * @param {object} deps
 * @param {string} [deps.remindersFrom] YYYY-MM-DD: no reminder emails at all for sessions before this date
 */
export function createReminder({
  loadSchedule,
  loadContacts = async () => ({}),
  store,
  send,
  sendPlayer,
  now = () => new Date(),
  siteUrl,
  remindersFrom,
}) {
  return async (event = {}) => {
    const schedule = await loadSchedule();
    const t = now();
    const next = nextSession(schedule, t);
    if (!next) return { sent: null, reason: "no session scheduled" };

    const session = next.date;
    const players = schedule.players || [];
    const summary = summarise(players, await store.getAnswers(session));
    const times = formatSessionTimes(next.start);
    const active = !remindersFrom || session >= remindersFrom;

    if (event.preview) {
      const contacts = await loadContacts();
      return {
        preview: true,
        session,
        emailsOn: active,
        playersWithEmail: players.filter((p) => contacts[p]),
        summarySubject: composeEmail({ kind: "48h", times, summary, siteUrl }).subject,
        playerSubject: composeNudge({ name: players[0], times, siteUrl }).subject,
      };
    }
    if (event.test === "player") {
      const name = players.includes(event.player) ? event.player : players[0];
      await send(composeNudge({ name, times, siteUrl, test: true }));
      return { sent: "test-player", session };
    }
    if (event.test) {
      await send(composeEmail({ kind: "test", times, summary, siteUrl }));
      return { sent: "test", session };
    }

    const state = await store.getState(session);
    const liveAt = new Date(state.liveAt || (await store.markLive(session, t.toISOString())));
    if (!active) return { sent: null, session, reason: `emails start from ${remindersFrom}` };

    const errors = [];

    // Player nudges
    const nudged = [];
    const contacts = await loadContacts();
    for (const name of summary.waiting) {
      const to = contacts[name];
      if (!to) continue;
      const kind = nudgeDue({ start: next.start, liveAt, now: t, sent: state.nudges?.[name] });
      if (!kind || !(await store.claimNudge(session, name, kind, t))) continue;
      try {
        await sendPlayer(to, composeNudge({ name, times, siteUrl }));
        nudged.push(`${name}:${kind}`);
      } catch (err) {
        await store.releaseNudge(session, name, kind);
        errors.push(err);
      }
    }

    // Matt's summary
    let sent = null;
    let reason;
    const kind = decide({ start: next.start, now: t, summary, state });
    if (kind) {
      // Record first so overlapping or retried runs can't both send; undo if sending fails.
      if (await store.claim(session, kind)) {
        try {
          await send(composeEmail({ kind, times, summary, siteUrl }));
          sent = kind;
        } catch (err) {
          await store.release(session, kind);
          errors.push(err);
        }
      } else {
        reason = "already sent";
      }
    }

    if (errors.length) throw errors[0];
    return { sent, session, ...(reason && { reason }), ...(nudged.length && { nudged }) };
  };
}

let run;

export const handler = async (event) => {
  if (!run) {
    const { fetchSchedule, dynamoReminderStore, sesSender, ssmContacts } = await import("./aws.mjs");
    const env = process.env;
    run = createReminder({
      loadSchedule: () => fetchSchedule(env.SCHEDULE_URL),
      loadContacts: () => ssmContacts(env.CONTACTS_PARAM),
      store: dynamoReminderStore(env.TABLE || "TavernCalendar"),
      send: sesSender({ from: env.FROM, to: env.TO }),
      sendPlayer: (to, message) => sesSender({ from: env.FROM, to, replyTo: env.TO })(message),
      siteUrl: env.SITE_URL,
      remindersFrom: env.REMINDERS_FROM || undefined,
    });
  }
  const result = await run(event || {});
  console.log(JSON.stringify(result));
  return result;
};
