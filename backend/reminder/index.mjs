// Hourly job (rsvpReminder Lambda): emails Matt the RSVP summary for the next session
// when everyone has replied or it's 48 hours away, whichever comes first.
// See docs/superpowers/specs/2026-11-07-rsvp-reminder-design.md.
//   {}             normal hourly run
//   {"test": true} send a [Test] email for the next session now, without recording it

import { nextSession, formatSessionTimes } from "../../src/assets/js/lib/schedule.js";
import { summarise, decide, composeEmail } from "./logic.mjs";

export function createReminder({ loadSchedule, store, send, now = () => new Date(), siteUrl }) {
  return async (event = {}) => {
    const schedule = await loadSchedule();
    const t = now();
    const next = nextSession(schedule, t);
    if (!next) return { sent: null, reason: "no session scheduled" };

    const session = next.date;
    const summary = summarise(schedule.players || [], await store.getAnswers(session));
    const times = formatSessionTimes(next.start);

    if (event.test) {
      await send(composeEmail({ kind: "test", times, summary, siteUrl }));
      return { sent: "test", session };
    }

    const kind = decide({ start: next.start, now: t, summary, state: await store.getState(session) });
    if (!kind) return { sent: null, session };

    // Record first so overlapping or retried runs can't both send; undo if sending fails.
    if (!(await store.claim(session, kind))) return { sent: null, session, reason: "already sent" };
    try {
      await send(composeEmail({ kind, times, summary, siteUrl }));
    } catch (err) {
      await store.release(session, kind);
      throw err;
    }
    return { sent: kind, session };
  };
}

let run;

export const handler = async (event) => {
  if (!run) {
    const { fetchSchedule, dynamoReminderStore, sesSender } = await import("./aws.mjs");
    const env = process.env;
    run = createReminder({
      loadSchedule: () => fetchSchedule(env.SCHEDULE_URL),
      store: dynamoReminderStore(env.TABLE || "TavernCalendar"),
      send: sesSender({ from: env.FROM, to: env.TO }),
      siteUrl: env.SITE_URL,
    });
  }
  const result = await run(event || {});
  console.log(JSON.stringify(result));
  return result;
};
