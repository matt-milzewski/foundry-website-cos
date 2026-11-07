// When to email Matt the RSVP summary for the next session, and what it says.
// Pure functions: no AWS, no clock. See docs/superpowers/specs/2026-11-07-rsvp-reminder-design.md.

export const LEAD_MS = 48 * 3600e3;

/** Sorts the roster by answer. Only "yes" / "no" for roster names count. */
export function summarise(players, answers = {}) {
  const rows = players.map((name) => ({
    name,
    answer: answers[name] === "yes" || answers[name] === "no" ? answers[name] : null,
  }));
  const names = (answer) => rows.filter((r) => r.answer === answer).map((r) => r.name);
  const waiting = names(null);
  return { rows, yes: names("yes"), no: names("no"), waiting, allReplied: rows.length > 0 && waiting.length === 0 };
}

/**
 * One email at whichever comes first: everyone replied, or 48 hours to go.
 * If that was the 48-hour email and replies were missing, one more when the last reply lands.
 * @param {{start: Date, now: Date, summary: ReturnType<typeof summarise>, state?: {first?: string, final?: boolean}}} args
 * @returns {"everyone" | "48h" | "final" | null}
 */
export function decide({ start, now, summary, state = {} }) {
  const left = start.getTime() - now.getTime();
  if (left <= 0) return null;
  if (!state.first) {
    if (summary.allReplied) return "everyone";
    return left <= LEAD_MS ? "48h" : null;
  }
  return state.first === "48h" && !state.final && summary.allReplied ? "final" : null;
}

const HOUR = 3600e3;
const SLACK_MS = 10 * 60e3; // the hourly run can start a few seconds earlier than the day before

/**
 * Reminder for one player who hasn't answered. `liveAt` is when this session first became
 * "next" (the previous game started, or the schedule changed).
 * - Goes live 48 hours or less ahead: one nudge 24 hours before, or straight away if that's passed.
 * - Otherwise: first nudge 24 hours after going live, second 48 hours before the game,
 *   unless that would land within 24 hours of the first.
 * @param {{start: Date, liveAt: Date, now: Date, sent?: {first?: string, second?: string}}} args
 * @returns {"first" | "second" | null}
 */
export function nudgeDue({ start, liveAt, now, sent = {} }) {
  const s = start.getTime();
  const live = liveAt.getTime();
  const t = now.getTime();
  if (t >= s) return null;
  const reached = (when) => t + SLACK_MS >= when;

  if (s - live <= 48 * HOUR) return !sent.first && reached(s - 24 * HOUR) ? "first" : null;
  if (!sent.first) return reached(live + 24 * HOUR) ? "first" : null;
  if (sent.second) return null;
  const second = s - 48 * HOUR;
  const gapOk = second - new Date(sent.first).getTime() >= 24 * HOUR - SLACK_MS;
  return gapOk && reached(second) ? "second" : null;
}

/** The email a player gets when they haven't answered yet. */
export function composeNudge({ name, times, siteUrl, test = false }) {
  const subject = `${test ? "[Test] " : ""}Are you in for ${times.day}?`;
  const when = `${times.qld} QLD · ${times.vic} VIC`;
  const link = `${siteUrl}/#next`;
  const footer = "These reminders stop as soon as you answer. Reply to this email to reach Matt.";
  const text = [
    `Hi ${name},`,
    "",
    "You haven't said yet whether you're coming to the next session:",
    "",
    times.day,
    when,
    "",
    `Tap 👍 or 👎 next to your name: ${link}`,
    "",
    footer,
    "",
  ].join("\n");
  const html = `<!doctype html>
<html><body style="font-family:Georgia,'Times New Roman',serif;color:#1c1917;line-height:1.5">
<p>Hi ${esc(name)},</p>
<p>You haven't said yet whether you're coming to the next session:</p>
<h2 style="margin:0">${esc(times.day)}</h2>
<p style="margin:0 0 12px">${esc(when)}</p>
<p><a href="${esc(link)}">Tap 👍 or 👎 next to your name</a> (${esc(link)})</p>
<p style="color:#57534e;font-size:14px">${esc(footer)}</p>
</body></html>`;
  return { subject, text, html };
}

export function joinNames(names) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function tally(s) {
  if (s.allReplied) {
    if (!s.no.length) return "everyone's in";
    if (!s.yes.length) return "everyone's out";
    return `everyone's replied, ${s.yes.length} in, ${s.no.length} out`;
  }
  const parts = [];
  if (s.yes.length) parts.push(`${s.yes.length} in`);
  if (s.no.length) parts.push(`${s.no.length} out`);
  if (!parts.length) return "no replies yet";
  parts.push(`${s.waiting.length} no reply`);
  return parts.join(", ");
}

const INTRO = {
  everyone: "Everyone has replied for the next session.",
  "48h": "The next session is coming up. Here's where the replies stand.",
  final: "The last reply is in for the next session.",
  test: "This is a test of the session reminder. Here's how the next session looks right now.",
};

const LABEL = { yes: "👍 In", no: "👎 Out" };
const NO_REPLY = "No reply yet";

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** @returns {{subject: string, text: string, html: string}} */
export function composeEmail({ kind, times, summary, siteUrl }) {
  const subject = `${kind === "test" ? "[Test] " : ""}${times.day}: ${tally(summary)}`;
  const when = `${times.qld} QLD · ${times.vic} VIC`;
  const chase = summary.waiting.length ? `Still waiting on ${joinNames(summary.waiting)}.` : "";
  const link = `${siteUrl}/#next`;
  const answer = (r) => (r.answer ? LABEL[r.answer] : NO_REPLY);

  const text = [
    INTRO[kind],
    "",
    `Next session: ${times.day}`,
    when,
    "",
    ...summary.rows.map((r) => `${r.name}: ${answer(r)}`),
    ...(chase ? ["", chase] : []),
    "",
    `Who's coming: ${link}`,
    "",
  ].join("\n");

  const rows = summary.rows
    .map((r) => `<tr><td style="padding:4px 16px 4px 0"><strong>${esc(r.name)}</strong></td><td>${esc(answer(r))}</td></tr>`)
    .join("");
  const html = `<!doctype html>
<html><body style="font-family:Georgia,'Times New Roman',serif;color:#1c1917;line-height:1.5">
<p>${esc(INTRO[kind])}</p>
<h2 style="margin:0">${esc(times.day)}</h2>
<p style="margin:0 0 12px">${esc(when)}</p>
<table style="border-collapse:collapse">${rows}</table>
${chase ? `<p>${esc(chase)}</p>` : ""}
<p><a href="${esc(link)}">See who's coming</a> (${esc(link)})</p>
</body></html>`;

  return { subject, text, html };
}
