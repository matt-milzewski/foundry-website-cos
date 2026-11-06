// Input rules for the RSVP API. Nothing free-form is ever stored:
// only a date, a name from the roster, and yes/no/clear.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86400e3;
export const ANSWERS = ["yes", "no", "clear"];

/** Returns the date string if it's a real date from 1 day ago to 60 days ahead, else null. */
export function validateSession(s, now = new Date()) {
  if (typeof s !== "string" || !DATE_RE.test(s)) return null;
  const d = new Date(s + "T00:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  const today = new Date(now.toISOString().slice(0, 10) + "T00:00:00Z").getTime();
  if (d.getTime() < today - DAY || d.getTime() > today + 60 * DAY) return null;
  return s;
}

export function validatePut(body, roster, now = new Date()) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "Body must be a JSON object" };
  const session = validateSession(body.session, now);
  if (!session) return { ok: false, error: "Invalid session date" };
  if (typeof body.player !== "string" || !roster.includes(body.player)) return { ok: false, error: "Unknown player" };
  if (!ANSWERS.includes(body.answer)) return { ok: false, error: "Answer must be yes, no or clear" };
  return { ok: true, value: { session, player: body.player, answer: body.answer } };
}
