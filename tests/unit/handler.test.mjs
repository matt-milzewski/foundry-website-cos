import { test } from "node:test";
import assert from "node:assert/strict";
import { createHandler } from "../../backend/rsvp/index.mjs";

function memStore() {
  const m = new Map();
  return {
    async get(s) {
      return { ...(m.get(s) || {}) };
    },
    async set(s, p, a) {
      const cur = { ...(m.get(s) || {}) };
      if (a) cur[p] = a;
      else delete cur[p];
      m.set(s, cur);
      return cur;
    },
  };
}

const roster = ["Danny", "Fraser", "Ryan", "Stefan"];
const now = () => new Date("2026-11-07T00:00:00Z");
const mk = () => createHandler({ store: memStore(), roster, now });
const ev = (routeKey, extra = {}) => ({ routeKey, ...extra });

test("GET returns empty answers, PUT sets and clears them", async () => {
  const h = mk();
  let r = await h(ev("GET /rsvp", { queryStringParameters: { session: "2026-11-08" } }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body), { session: "2026-11-08", answers: {} });

  r = await h(ev("PUT /rsvp", { body: JSON.stringify({ session: "2026-11-08", player: "Ryan", answer: "no" }) }));
  assert.equal(r.statusCode, 200);
  assert.deepEqual(JSON.parse(r.body).answers, { Ryan: "no" });

  r = await h(ev("PUT /rsvp", { body: JSON.stringify({ session: "2026-11-08", player: "Ryan", answer: "clear" }) }));
  assert.deepEqual(JSON.parse(r.body).answers, {});
});

test("responses are JSON and never cached", async () => {
  const r = await mk()(ev("GET /rsvp", { queryStringParameters: { session: "2026-11-08" } }));
  assert.equal(r.headers["content-type"], "application/json");
  assert.equal(r.headers["cache-control"], "no-store");
});

test("rejects bad input, oversized bodies, old routes and unknown routes", async () => {
  const h = mk();
  assert.equal((await h(ev("PUT /rsvp", { body: "{not json" }))).statusCode, 400);
  assert.equal((await h(ev("PUT /rsvp", { body: "x".repeat(1100) }))).statusCode, 400);
  assert.equal((await h(ev("PUT /rsvp"))).statusCode, 400);
  assert.equal((await h(ev("GET /rsvp", { queryStringParameters: { session: "nope" } }))).statusCode, 400);
  assert.equal((await h(ev("GET /rsvp"))).statusCode, 400);
  assert.equal((await h(ev("PUT /rsvp", { body: JSON.stringify({ session: "2026-11-08", player: "Bob", answer: "yes" }) }))).statusCode, 400);
  assert.equal((await h(ev("POST /notes", { body: "{}" }))).statusCode, 410);
  assert.equal((await h(ev("GET /notes"))).statusCode, 410);
  assert.equal((await h(ev("GET /other"))).statusCode, 404);
});

test("base64 bodies from API Gateway are decoded", async () => {
  const body = Buffer.from(JSON.stringify({ session: "2026-11-08", player: "Stefan", answer: "yes" })).toString("base64");
  const r = await mk()(ev("PUT /rsvp", { body, isBase64Encoded: true }));
  assert.deepEqual(JSON.parse(r.body).answers, { Stefan: "yes" });
});
