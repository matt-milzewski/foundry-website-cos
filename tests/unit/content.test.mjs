import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRules, slug } from "../../scripts/content-rules.mjs";

const rules = {
  exclude: ["Jazz", "Natasha", "Lucy"],
  replace: [["Hruket's likeness", "The likeness of Hrulek's master"]],
  removeQuotes: ["A quote to remove"],
};

test("drops excluded characters and players entirely", () => {
  const input = [
    { character: "Lucy", player: "Natasha", one_liner: "x" },
    { character: "Azza", player: "Ryan", one_liner: "A goblin cleric." },
    { player: "Natasha", characters: ["Lucy"] },
  ];
  const { value } = applyRules(input, rules);
  assert.equal(value.length, 1);
  assert.equal(value[0].character, "Azza");
});

test("removes sentences and list items that mention an excluded name", () => {
  const input = {
    recap: "The party crossed the lake. Lucy touched a gem. They found Rudolf.",
    npcs: ["Rudolf", "Lucy", "Jazz's friend"],
  };
  const { value, log } = applyRules(input, rules);
  assert.equal(value.recap, "The party crossed the lake. They found Rudolf.");
  assert.deepEqual(value.npcs, ["Rudolf"]);
  assert.ok(log.length >= 2);
});

test("removes listed quotes and applies replacements", () => {
  const input = { best_quotes: ["Keep me", "A quote to remove"], villain: "Hruket's likeness" };
  const { value } = applyRules(input, rules);
  assert.deepEqual(value.best_quotes, ["Keep me"]);
  assert.equal(value.villain, "The likeness of Hrulek's master");
});

test("does not touch similar names like Lucien", () => {
  const { value } = applyRules({ who: "Father Lucien offered shelter." }, rules);
  assert.equal(value.who, "Father Lucien offered shelter.");
});

test("slug makes safe file names", () => {
  assert.equal(slug("Gurn Ga Dar"), "gurn-ga-dar");
  assert.equal(slug("Selûne's Moon"), "selune-s-moon");
});
