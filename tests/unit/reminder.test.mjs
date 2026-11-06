import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, decide, composeEmail, joinNames } from "../../backend/reminder/logic.mjs";
import { createReminder } from "../../backend/reminder/index.mjs";

const players = ["Danny", "Fraser", "Ryan", "Stefan"];
const start = new Date("2026-11-11T09:00:00Z"); // Wednesday 7:00 pm QLD
const at = (iso) => new Date(iso);
const times = { day: "Wednesday 11 Nov", qld: "7:00 pm", vic: "8:00 pm" };
const site = "https://thenatural20tavern.com";

const partial = summarise(players, { Danny: "yes", Fraser: "yes", Ryan: "no" });
const full = summarise(players, { Danny: "yes", Fraser: "yes", Ryan: "no", Stefan: "yes" });

test("summarise sorts the roster by answer and ignores anything else", () => {
  const s = summarise(players, { Danny: "yes", Ryan: "no", Bob: "yes", Fraser: "maybe", date: "rsvp#2026-11-11" });
  assert.deepEqual(s.yes, ["Danny"]);
  assert.deepEqual(s.no, ["Ryan"]);
  assert.deepEqual(s.waiting, ["Fraser", "Stefan"]);
  assert.equal(s.allReplied, false);
  assert.deepEqual(s.rows.map((r) => r.answer), ["yes", null, "no", null]);
  assert.equal(full.allReplied, true);
  assert.equal(summarise([], {}).allReplied, false);
});

test("first email goes when everyone has replied or 48 hours out, whichever is first", () => {
  assert.equal(decide({ start, now: at("2026-11-08T00:00:00Z"), summary: partial }), null);
  assert.equal(decide({ start, now: at("2026-11-08T00:00:00Z"), summary: full }), "everyone");
  assert.equal(decide({ start, now: at("2026-11-09T08:59:00Z"), summary: partial }), null);
  assert.equal(decide({ start, now: at("2026-11-09T09:05:00Z"), summary: partial }), "48h");
  assert.equal(decide({ start, now: at("2026-11-11T08:00:00Z"), summary: partial }), "48h"); // booked at short notice
});

test("after a 48-hour email with replies missing, one more when the last reply comes in", () => {
  const now = at("2026-11-10T00:00:00Z");
  assert.equal(decide({ start, now, summary: partial, state: { first: "48h" } }), null);
  assert.equal(decide({ start, now, summary: full, state: { first: "48h" } }), "final");
  assert.equal(decide({ start, now, summary: full, state: { first: "48h", final: true } }), null);
  assert.equal(decide({ start, now, summary: full, state: { first: "everyone" } }), null);
  assert.equal(decide({ start, now, summary: partial, state: { first: "everyone" } }), null);
});

test("nothing is sent once the session has started", () => {
  assert.equal(decide({ start, now: start, summary: full }), null);
  assert.equal(decide({ start, now: at("2026-11-11T10:00:00Z"), summary: partial }), null);
  assert.equal(decide({ start, now: at("2026-11-11T10:00:00Z"), summary: full, state: { first: "48h" } }), null);
});

test("names join naturally", () => {
  assert.equal(joinNames([]), "");
  assert.equal(joinNames(["Ryan"]), "Ryan");
  assert.equal(joinNames(["Ryan", "Stefan"]), "Ryan and Stefan");
  assert.equal(joinNames(["Danny", "Ryan", "Stefan"]), "Danny, Ryan and Stefan");
});

test("the subject sums up the replies", () => {
  const subject = (summary, kind = "48h") => composeEmail({ kind, times, summary, siteUrl: site }).subject;
  assert.equal(subject(partial), "Wednesday 11 Nov: 2 in, 1 out, 1 no reply");
  assert.equal(subject(summarise(players, { Danny: "yes" })), "Wednesday 11 Nov: 1 in, 3 no reply");
  assert.equal(subject(summarise(players, {})), "Wednesday 11 Nov: no replies yet");
  assert.equal(subject(full, "everyone"), "Wednesday 11 Nov: everyone's replied, 3 in, 1 out");
  assert.equal(subject(summarise(players, Object.fromEntries(players.map((p) => [p, "yes"])))), "Wednesday 11 Nov: everyone's in");
  assert.equal(subject(summarise(players, Object.fromEntries(players.map((p) => [p, "no"])))), "Wednesday 11 Nov: everyone's out");
  assert.equal(subject(partial, "test"), "[Test] Wednesday 11 Nov: 2 in, 1 out, 1 no reply");
});

test("the body lists every player, both times and who to chase", () => {
  const { text, html } = composeEmail({ kind: "48h", times, summary: partial, siteUrl: site });
  for (const body of [text, html]) {
    assert.match(body, /Wednesday 11 Nov/);
    assert.match(body, /7:00 pm QLD · 8:00 pm VIC/);
    assert.match(body, /Still waiting on Stefan\./);
    assert.match(body, /https:\/\/thenatural20tavern\.com\/#next/);
  }
  assert.match(text, /Danny: 👍 In/);
  assert.match(text, /Ryan: 👎 Out/);
  assert.match(text, /Stefan: No reply yet/);
  assert.doesNotMatch(composeEmail({ kind: "everyone", times, summary: full, siteUrl: site }).text, /Still waiting/);
  assert.match(composeEmail({ kind: "final", times, summary: full, siteUrl: site }).text, /last reply is in/);
});

test("names are escaped in the HTML", () => {
  const { html } = composeEmail({ kind: "48h", times, summary: summarise(["<b>x</b>"], {}), siteUrl: site });
  assert.ok(!html.includes("<b>x</b>"));
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
});

// ---- the hourly job, with fake storage and a fake sender ----

const schedule = {
  timezone: "Australia/Brisbane",
  regular: { weekday: 1, time: "20:00" },
  overrides: [{ date: "2026-11-11", time: "19:00", note: "Wednesday this week" }],
  cancelled: ["2026-11-09"],
  players,
};

function fakeStore(answers) {
  const state = {};
  return {
    state,
    async getAnswers() {
      return answers;
    },
    async getState(date) {
      return { ...state[date] };
    },
    async claim(date, kind) {
      const s = (state[date] ||= {});
      if (kind === "final") {
        if (s.first !== "48h" || s.final) return false;
        s.final = true;
        return true;
      }
      if (s.first) return false;
      s.first = kind;
      return true;
    },
    async release(date, kind) {
      if (kind === "final") delete state[date].final;
      else delete state[date].first;
    },
  };
}

function job({ answers = {}, now, store = fakeStore(answers), send }) {
  const emails = [];
  const clock = { now: at(now) };
  const run = createReminder({
    loadSchedule: async () => schedule,
    store,
    send: send || (async (e) => emails.push(e)),
    now: () => clock.now,
    siteUrl: site,
  });
  return { run, emails, store, clock };
}

test("the job emails once at the 48-hour mark", async () => {
  const { run, emails } = job({ answers: { Danny: "yes" }, now: "2026-11-09T09:05:00Z" });
  assert.deepEqual(await run({}), { sent: "48h", session: "2026-11-11" });
  assert.equal((await run({})).sent, null);
  assert.equal(emails.length, 1);
  assert.equal(emails[0].subject, "Wednesday 11 Nov: 1 in, 3 no reply");
});

test("the job emails early once everyone has replied, then stays quiet", async () => {
  const answers = { Danny: "yes", Fraser: "yes", Ryan: "no", Stefan: "yes" };
  const { run, emails, clock } = job({ answers, now: "2026-11-08T00:05:00Z" });
  assert.equal((await run({})).sent, "everyone");
  clock.now = at("2026-11-09T09:05:00Z");
  assert.equal((await run({})).sent, null);
  assert.equal(emails.length, 1);
});

test("the job sends a final email when the last reply lands after the 48-hour one", async () => {
  const answers = { Danny: "yes" };
  const { run, emails, clock } = job({ answers, now: "2026-11-09T09:05:00Z" });
  assert.equal((await run({})).sent, "48h");
  Object.assign(answers, { Fraser: "yes", Ryan: "no", Stefan: "yes" });
  clock.now = at("2026-11-10T03:05:00Z");
  assert.equal((await run({})).sent, "final");
  assert.equal((await run({})).sent, null);
  assert.deepEqual(emails.map((e) => e.subject), [
    "Wednesday 11 Nov: 1 in, 3 no reply",
    "Wednesday 11 Nov: everyone's replied, 3 in, 1 out",
  ]);
});

test("a lost race sends nothing, and a failed send is retried next run", async () => {
  const raced = fakeStore({});
  raced.claim = async () => false;
  const a = job({ store: raced, now: "2026-11-09T09:05:00Z" });
  assert.deepEqual(await a.run({}), { sent: null, session: "2026-11-11", reason: "already sent" });
  assert.equal(a.emails.length, 0);

  let fail = true;
  const sent = [];
  const b = job({
    now: "2026-11-09T09:05:00Z",
    send: async (e) => {
      if (fail) throw new Error("SES down");
      sent.push(e);
    },
  });
  await assert.rejects(b.run({}), /SES down/);
  assert.deepEqual(b.store.state["2026-11-11"], {});
  fail = false;
  assert.equal((await b.run({})).sent, "48h");
  assert.equal(sent.length, 1);
});

test("test mode sends a [Test] email straight away without recording it", async () => {
  const { run, emails, store } = job({ answers: { Ryan: "no" }, now: "2026-11-07T00:00:00Z" });
  assert.deepEqual(await run({ test: true }), { sent: "test", session: "2026-11-11" });
  assert.match(emails[0].subject, /^\[Test\] Wednesday 11 Nov: 1 out, 3 no reply$/);
  assert.equal(store.state["2026-11-11"], undefined);
});
