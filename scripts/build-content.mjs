// Turns the ChatGPT answers in content-raw/ into the site's data files in src/_data/,
// applying the review rules in content-raw/overrides.json.
// Run: npm run content

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyRules, spoilerFlags, slug } from "./content-rules.mjs";

const RAW = "content-raw";
const OUT = "src/_data";
const PORTRAITS = "src/assets/img/out/portraits";
const read = (f) => JSON.parse(readFileSync(join(RAW, f), "utf8"));
const rules = read("overrides.json");
const allLogs = [];

function clean(name, data) {
  const { value, log } = applyRules(data, rules);
  for (const l of log) allLogs.push(`[${name}] ${l}`);
  return value;
}

const portraitFor = (name) => {
  if (!rules.portraitMap[name]) return null;
  const file = `${slug(name)}.webp`;
  return existsSync(join(PORTRAITS, file)) ? `/assets/img/portraits/${file}` : null;
};

// Characters
const characters = clean("characters", read("part1-characters.json")).map((c) => ({
  ...c,
  slug: slug(c.character),
  portrait: portraitFor(c.character),
}));

// Players: current players first, in roster order
const current = rules.currentPlayers;
const players = clean("players", read("part2-players.json"))
  .map((p) => ({
    ...p,
    current: current.includes(p.player),
    characterCards: (p.characters || []).map((name) => {
      const c = characters.find((x) => x.character === name);
      return { name, status: c?.status ?? "alive", portrait: c?.portrait ?? portraitFor(name), slug: slug(name) };
    }),
  }))
  .sort((a, b) => {
    const ia = current.indexOf(a.player), ib = current.indexOf(b.player);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.player.localeCompare(b.player);
  });

// Records
const records = clean("records", read("part3-records.json"));

// Chronicle: merge all part4 files, drop sessions without notes
const chronicle = readdirSync(RAW)
  .filter((f) => /^part4.*\.json$/.test(f))
  .flatMap((f) => clean("chronicle", read(f)))
  .filter((s) => s.recap && s.title)
  .sort((a, b) => a.session - b.session);

// Codex
const codex = clean("codex", read("part5-codex.json"));
for (const group of ["people", "places", "factions", "lore"]) codex[group] = codex[group] || [];
codex.people.sort((a, b) => (a.first_met ?? 999) - (b.first_met ?? 999));
codex.places.sort((a, b) => (a.first_visited ?? 999) - (b.first_visited ?? 999));
codex.lore.sort((a, b) => (a.session ?? 999) - (b.session ?? 999));
const sessionsWithPages = new Set(chronicle.map((s) => s.session));
codex.hasPage = [...sessionsWithPages];

// Allies we lost (memoriam)
const alliesLost = rules.alliesLost
  .map((n) => codex.people.find((p) => p.name === n))
  .filter(Boolean);

// Campaigns: keep entries that have a blurb (from ChatGPT or overrides)
const campaigns = clean("campaigns", read("part6-campaigns.json"))
  .map((c) => ({ ...c, blurb: c.blurb || rules.campaignBlurbs[c.name] || null }))
  .filter((c) => c.blurb);

const out = { characters, players, records, chronicle, codex, campaigns, alliesLost };
for (const [k, v] of Object.entries(out)) writeFileSync(join(OUT, `${k}.json`), JSON.stringify(v, null, 2) + "\n");

// Report
console.log(`characters ${characters.length}, players ${players.length}, sessions ${chronicle.length}, codex people ${codex.people.length}, places ${codex.places.length}, campaigns ${campaigns.length}`);
console.log(`\nDropped or changed by the exclusion rules (${allLogs.length}):`);
for (const l of allLogs) console.log("  " + l);
const flags = spoilerFlags(out, rules.spoilerWatch);
console.log(`\nWorth a spoiler check (${flags.length}):`);
for (const f of flags) console.log("  " + f);

// Hard stop if an excluded name survived anywhere
const leftover = new RegExp(`\\b(${rules.exclude.join("|")})\\b`, "i");
if (leftover.test(JSON.stringify(out))) {
  console.error("\nERROR: an excluded name is still in the output");
  process.exit(1);
}
