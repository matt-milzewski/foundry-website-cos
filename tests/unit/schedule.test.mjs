import { test } from "node:test";
import assert from "node:assert/strict";
import { nextSession, formatSessionTimes, countdownText } from "../../src/assets/js/lib/schedule.js";

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
  assert.equal(r.note, null);
});

test("the banner moves on to the following session as soon as one starts", () => {
  assert.equal(nextSession(base, new Date("2026-11-09T09:59:00Z")).date, "2026-11-09"); // Mon 7:59pm QLD
  assert.equal(nextSession(base, new Date("2026-11-09T10:00:00Z")).date, "2026-11-16"); // Mon 8:00pm QLD
  assert.equal(nextSession(base, new Date("2026-11-09T10:01:00Z")).date, "2026-11-16");
});

test("a one-off 7pm Wednesday hands over to the regular Monday at 7pm", () => {
  const s = { ...base, overrides: [{ date: "2026-11-11", time: "19:00", note: "Wednesday this week" }], cancelled: ["2026-11-09"] };
  assert.equal(nextSession(s, new Date("2026-11-11T08:59:00Z")).date, "2026-11-11"); // Wed 6:59pm QLD
  const r = nextSession(s, new Date("2026-11-11T09:00:00Z")); // Wed 7:00pm QLD
  assert.equal(r.date, "2026-11-16");
  assert.equal(r.start.toISOString(), "2026-11-16T10:00:00.000Z"); // Mon 8:00pm QLD
  assert.equal(r.note, null);
});

test("the countdown never goes negative", () => {
  assert.equal(countdownText(new Date("2026-11-09T10:00:00Z"), new Date("2026-11-09T09:15:00Z")), "in 45 mins");
  assert.equal(countdownText(new Date("2026-11-09T10:00:00Z"), new Date("2026-11-09T10:00:30Z")), "Starting now");
});

test("cancelled Monday is skipped", () => {
  const r = nextSession({ ...base, cancelled: ["2026-11-16"] }, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.date, "2026-11-23");
});

test("an override on a Monday replaces that Monday's regular time", () => {
  const s = { ...base, overrides: [{ date: "2026-11-16", time: "19:00", note: "Early start" }] };
  const r = nextSession(s, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.date, "2026-11-16");
  assert.equal(r.start.toISOString(), "2026-11-16T09:00:00.000Z");
});

test("past overrides are ignored", () => {
  const s = { ...base, overrides: [{ date: "2026-11-08", time: "20:00", note: "Sunday this week" }] };
  const r = nextSession(s, new Date("2026-11-08T10:00:00Z")); // Sun 8pm QLD, the moment it starts
  assert.equal(r.date, "2026-11-09");
});

test("formats QLD and VIC (daylight saving) times", () => {
  const t = formatSessionTimes(new Date("2026-11-08T10:00:00Z"));
  assert.equal(t.qld, "8:00 pm");
  assert.equal(t.vic, "9:00 pm");
  assert.equal(t.day, "Sunday 8 Nov");
});

test("formats VIC without daylight saving in winter", () => {
  const t = formatSessionTimes(new Date("2027-06-07T10:00:00Z"));
  assert.equal(t.qld, "8:00 pm");
  assert.equal(t.vic, "8:00 pm");
  assert.equal(t.day, "Monday 7 June"); // en-AU spells out short months like June and Sept
});
