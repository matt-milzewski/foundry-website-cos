import { test } from "node:test";
import assert from "node:assert/strict";
import { summarise, decide, composeEmail, joinNames, nudgeDue, composeNudge } from "../../backend/reminder/logic.mjs";
import { createReminder } from "../../backend/reminder/index.mjs";

const players = ["Danny", "Fraser", "Ryan", "Stefan"];
const start = new Date("2026-11-11T09:00:00Z"); // Wednesday 7:00 pm QLD
const at = (iso) => new Date(iso);
const times = { day: "Wednesday 11 Nov", qld: "7:00 pm", vic: "8:00 pm" };
const site = "https://thenatural20tavern.com";
const H = 3600e3;

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

// ---- player reminders ----

test("normal week: first nudge 24 hours after the date goes live, second 48 hours before", () => {
  const S = at("2026-11-16T10:00:00Z"); // Monday 8 pm QLD
  const liveAt = at("2026-11-09T10:05:20Z"); // last Monday's game started, picked up by the 8:05 pm run
  const due = (now, sent) => nudgeDue({ start: S, liveAt, now: at(now), sent });
  assert.equal(due("2026-11-10T09:05:00Z"), null); // Tue 7:05 pm QLD
  assert.equal(due("2026-11-10T10:05:10Z"), "first"); // Tue 8:05 pm QLD, a few seconds early is fine
  const sent = { first: "2026-11-10T10:05:12Z" };
  assert.equal(due("2026-11-12T10:05:00Z", sent), null);
  assert.equal(due("2026-11-14T09:05:00Z", sent), null); // Sat 7:05 pm QLD
  assert.equal(due("2026-11-14T10:05:00Z", sent), "second"); // Sat 8:05 pm QLD
  assert.equal(due("2026-11-15T10:05:00Z", { ...sent, second: "2026-11-14T10:05:03Z" }), null);
  assert.equal(due("2026-11-16T10:00:00Z", sent), null); // game has started
});

test("short notice: one nudge 24 hours before, or straight away if it's sooner", () => {
  const S = at("2026-11-12T09:00:00Z");
  const due = (liveAt, now, sent) => nudgeDue({ start: S, liveAt: at(liveAt), now: at(now), sent });
  // goes live 40 hours ahead
  assert.equal(due("2026-11-10T17:00:00Z", "2026-11-10T18:05:00Z"), null);
  assert.equal(due("2026-11-10T17:00:00Z", "2026-11-11T09:05:00Z"), "first");
  assert.equal(due("2026-11-10T17:00:00Z", "2026-11-12T08:05:00Z", { first: "2026-11-11T09:05:00Z" }), null);
  // goes live 10 hours ahead
  assert.equal(due("2026-11-11T23:00:00Z", "2026-11-11T23:05:00Z"), "first");
});

test("in between: the second nudge is dropped if it would land within 24 hours of the first", () => {
  const nudges = (hoursAhead) => {
    const liveAt = at("2026-11-01T00:00:00Z");
    const S = new Date(liveAt.getTime() + hoursAhead * H);
    const sent = {};
    const out = [];
    for (let t = liveAt.getTime(); t < S.getTime(); t += H) {
      const kind = nudgeDue({ start: S, liveAt, now: new Date(t), sent });
      if (kind) {
        sent[kind] = new Date(t).toISOString();
        out.push(`${kind}@${(S.getTime() - t) / H}h before`);
      }
    }
    return out;
  };
  assert.deepEqual(nudges(60), ["first@36h before"]);
  assert.deepEqual(nudges(80), ["first@56h before"]);
  assert.deepEqual(nudges(100), ["first@76h before", "second@48h before"]);
  assert.deepEqual(nudges(168), ["first@144h before", "second@48h before"]);
  assert.deepEqual(nudges(30), ["first@24h before"]);
});

test("the player email says what's needed and how to answer", () => {
  const { subject, text, html } = composeNudge({ name: "Ryan", times, siteUrl: site });
  assert.equal(subject, "Are you in for Wednesday 11 Nov?");
  for (const body of [text, html]) {
    assert.match(body, /Hi Ryan/);
    assert.match(body, /7:00 pm QLD · 8:00 pm VIC/);
    assert.match(body, /https:\/\/thenatural20tavern\.com\/#next/);
    assert.match(body, /stop as soon as you answer/);
  }
  assert.equal(composeNudge({ name: "Ryan", times, siteUrl: site, test: true }).subject, "[Test] Are you in for Wednesday 11 Nov?");
  assert.match(composeNudge({ name: "<i>", times, siteUrl: site }).html, /Hi &lt;i&gt;/);
});

// ---- the hourly job, with fake storage and fake senders ----

const schedule = {
  timezone: "Australia/Brisbane",
  regular: { weekday: 1, time: "20:00" },
  overrides: [{ date: "2026-11-11", time: "19:00", note: "Wednesday this week" }],
  cancelled: ["2026-11-09"],
  players,
};
const mondays = { timezone: "Australia/Brisbane", regular: { weekday: 1, time: "20:00" }, overrides: [], cancelled: [], players };

function fakeStore(answers) {
  const state = {};
  const of = (date) => (state[date] ||= {});
  return {
    state,
    async getAnswers() {
      return answers;
    },
    async getState(date) {
      const s = state[date] || {};
      return { first: s.first, final: Boolean(s.final), liveAt: s.liveAt, nudges: structuredClone(s.nudges || {}) };
    },
    async markLive(date, when) {
      return (of(date).liveAt ||= when);
    },
    async claim(date, kind) {
      const s = of(date);
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
    async claimNudge(date, name, kind, when) {
      const n = ((of(date).nudges ||= {})[name] ||= {});
      if (n[kind]) return false;
      n[kind] = when.toISOString();
      return true;
    },
    async releaseNudge(date, name, kind) {
      delete state[date].nudges[name][kind];
    },
  };
}

function job({ answers = {}, now, contacts = {}, store = fakeStore(answers), send, sendPlayer, sched = schedule, remindersFrom }) {
  const emails = [];
  const playerEmails = [];
  const clock = { now: at(now) };
  const run = createReminder({
    loadSchedule: async () => sched,
    loadContacts: async () => contacts,
    store,
    send: send || (async (e) => emails.push(e)),
    sendPlayer: sendPlayer || (async (to, e) => playerEmails.push({ to, ...e })),
    now: () => clock.now,
    siteUrl: site,
    remindersFrom,
  });
  return { run, emails, playerEmails, store, clock };
}

test("no emails at all for Wednesday's game; Monday's go as planned", async () => {
  const { run, emails, playerEmails, clock } = job({ contacts: { Danny: "danny@example.com" }, remindersFrom: "2026-11-16", now: "2026-11-07T01:05:00Z" });
  for (let t = at("2026-11-07T01:05:00Z").getTime(); t < at("2026-11-16T10:00:00Z").getTime(); t += H) {
    clock.now = new Date(t);
    await run({});
  }
  assert.deepEqual(playerEmails.map((e) => e.subject), ["Are you in for Monday 16 Nov?", "Are you in for Monday 16 Nov?"]);
  assert.deepEqual(emails.map((e) => e.subject), ["Monday 16 Nov: no replies yet"]);
});

test("even if everyone replies for Wednesday, Matt gets nothing before the start date", async () => {
  const answers = { Danny: "yes", Fraser: "yes", Ryan: "yes", Stefan: "yes" };
  const { run, emails } = job({ answers, remindersFrom: "2026-11-16", now: "2026-11-08T00:05:00Z" });
  assert.deepEqual(await run({}), { sent: null, session: "2026-11-11", reason: "emails start from 2026-11-16" });
  assert.equal(emails.length, 0);
});

test("preview shows what's set up and sends nothing", async () => {
  const { run, emails, playerEmails, store } = job({ contacts: { Danny: "danny@example.com" }, remindersFrom: "2026-11-16", now: "2026-11-07T01:05:00Z" });
  assert.deepEqual(await run({ preview: true }), {
    preview: true,
    session: "2026-11-11",
    emailsOn: false,
    playersWithEmail: ["Danny"],
    summarySubject: "Wednesday 11 Nov: no replies yet",
    playerSubject: "Are you in for Wednesday 11 Nov?",
  });
  assert.equal(emails.length + playerEmails.length, 0);
  assert.equal(store.state["2026-11-11"], undefined);
});

test("player reminder timing for Monday 16 Nov after Wednesday's game: Thursday then Saturday", async () => {
  const sentAt = [];
  const { run, clock } = job({
    contacts: { Danny: "danny@example.com" },
    remindersFrom: "2026-11-16",
    now: "2026-11-07T01:05:00Z",
    sendPlayer: async () => sentAt.push(clock.now.toISOString()),
  });
  for (let t = at("2026-11-07T01:05:00Z").getTime(); t < at("2026-11-16T10:00:00Z").getTime(); t += H) {
    clock.now = new Date(t);
    await run({});
  }
  assert.deepEqual(sentAt, ["2026-11-12T09:05:00.000Z", "2026-11-14T10:05:00.000Z"]); // Thu 7:05 pm, Sat 8:05 pm QLD
});

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
  assert.equal(b.store.state["2026-11-11"].first, undefined);
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

test("a normal week nudges a player who hasn't answered on Tuesday and Saturday, and no one else", async () => {
  const answers = { Fraser: "yes" };
  const contacts = { Danny: "danny@example.com", Fraser: "fraser@example.com" };
  const { run, playerEmails, emails, clock } = job({ answers, contacts, sched: mondays, now: "2026-11-09T10:05:20Z" });
  const runAt = async (iso) => {
    clock.now = at(iso);
    return run({});
  };
  assert.deepEqual(await runAt("2026-11-09T10:05:20Z"), { sent: null, session: "2026-11-16" }); // Mon 8:05 pm: goes live
  assert.deepEqual(await runAt("2026-11-10T09:05:00Z"), { sent: null, session: "2026-11-16" });
  assert.deepEqual(await runAt("2026-11-10T10:05:10Z"), { sent: null, session: "2026-11-16", nudged: ["Danny:first"] }); // Tue 8:05 pm
  assert.deepEqual(await runAt("2026-11-12T10:05:00Z"), { sent: null, session: "2026-11-16" });
  assert.deepEqual(await runAt("2026-11-14T10:05:00Z"), { sent: "48h", session: "2026-11-16", nudged: ["Danny:second"] }); // Sat 8:05 pm
  assert.deepEqual(await runAt("2026-11-15T10:05:00Z"), { sent: null, session: "2026-11-16" });
  assert.deepEqual(playerEmails.map((e) => [e.to, e.subject]), [
    ["danny@example.com", "Are you in for Monday 16 Nov?"],
    ["danny@example.com", "Are you in for Monday 16 Nov?"],
  ]);
  assert.equal(emails.length, 1);
});

test("a player who answers after the first nudge gets no second one", async () => {
  const answers = {};
  const { run, playerEmails, clock } = job({ answers, contacts: { Ryan: "ryan@example.com" }, sched: mondays, now: "2026-11-09T10:05:00Z" });
  await run({});
  clock.now = at("2026-11-10T10:05:00Z");
  assert.deepEqual((await run({})).nudged, ["Ryan:first"]);
  answers.Ryan = "no";
  clock.now = at("2026-11-14T10:05:00Z");
  assert.equal((await run({})).nudged, undefined);
  assert.equal(playerEmails.length, 1);
});

test("a failed player email is retried next run without blocking the others", async () => {
  let fail = true;
  const delivered = [];
  const { run, clock } = job({
    contacts: { Danny: "danny@example.com", Ryan: "ryan@example.com" },
    sched: mondays,
    now: "2026-11-09T10:05:00Z",
    sendPlayer: async (to) => {
      if (fail && to === "danny@example.com") throw new Error("bounce");
      delivered.push(to);
    },
  });
  await run({});
  clock.now = at("2026-11-10T10:05:00Z");
  await assert.rejects(run({}), /bounce/);
  assert.deepEqual(delivered, ["ryan@example.com"]);
  fail = false;
  clock.now = at("2026-11-10T11:05:00Z");
  assert.deepEqual((await run({})).nudged, ["Danny:first"]);
  assert.deepEqual(delivered, ["ryan@example.com", "danny@example.com"]);
});

test("player test mode sends a sample nudge to Matt, never to the player", async () => {
  const { run, emails, playerEmails } = job({ contacts: { Danny: "danny@example.com" }, now: "2026-11-07T00:00:00Z" });
  assert.deepEqual(await run({ test: "player", player: "Danny" }), { sent: "test-player", session: "2026-11-11" });
  assert.equal(playerEmails.length, 0);
  assert.equal(emails[0].subject, "[Test] Are you in for Wednesday 11 Nov?");
  assert.match(emails[0].text, /Hi Danny/);
});
