import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSession, validatePut } from "../../backend/rsvp/validate.mjs";

const now = new Date("2026-11-07T00:00:00Z");
const roster = ["Danny", "Fraser", "Ryan", "Stefan"];

test("session must be a real date from 1 day ago to 60 days ahead", () => {
  assert.equal(validateSession("2026-11-08", now), "2026-11-08");
  assert.equal(validateSession("2026-11-06", now), "2026-11-06");
  assert.equal(validateSession("2026-11-04", now), null);
  assert.equal(validateSession("2027-02-01", now), null);
  assert.equal(validateSession("2026-02-30", now), null);
  assert.equal(validateSession("<script>", now), null);
  assert.equal(validateSession("2026-11-08T00:00", now), null);
  assert.equal(validateSession(undefined, now), null);
  assert.equal(validateSession(20261108, now), null);
});

test("put accepts roster names and yes/no/clear only", () => {
  assert.deepEqual(validatePut({ session: "2026-11-08", player: "Danny", answer: "yes" }, roster, now), {
    ok: true,
    value: { session: "2026-11-08", player: "Danny", answer: "yes" },
  });
  assert.equal(validatePut({ session: "2026-11-08", player: "Bob", answer: "yes" }, roster, now).ok, false);
  assert.equal(validatePut({ session: "2026-11-08", player: "danny", answer: "yes" }, roster, now).ok, false);
  assert.equal(validatePut({ session: "2026-11-08", player: "Danny", answer: "maybe" }, roster, now).ok, false);
  assert.equal(validatePut({ session: "2026-11-08", player: "__proto__", answer: "yes" }, roster, now).ok, false);
  assert.equal(validatePut({ session: "1999-01-01", player: "Danny", answer: "yes" }, roster, now).ok, false);
  assert.equal(validatePut(null, roster, now).ok, false);
  assert.equal(validatePut([], roster, now).ok, false);
  assert.equal(validatePut({ session: "2026-11-08", player: "Danny", answer: "clear" }, roster, now).value.answer, "clear");
});
