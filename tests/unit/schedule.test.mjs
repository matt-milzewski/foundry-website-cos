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
  assert.equal(r.note, null);
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

test("an override on a Monday replaces that Monday's regular time", () => {
  const s = { ...base, overrides: [{ date: "2026-11-16", time: "19:00", note: "Early start" }] };
  const r = nextSession(s, new Date("2026-11-10T00:00:00Z"));
  assert.equal(r.date, "2026-11-16");
  assert.equal(r.start.toISOString(), "2026-11-16T09:00:00.000Z");
});

test("past overrides are ignored", () => {
  const s = { ...base, overrides: [{ date: "2026-11-08", time: "20:00", note: "Sunday this week" }] };
  const r = nextSession(s, new Date("2026-11-08T15:00:00Z")); // Mon 1am QLD, 5h after
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
