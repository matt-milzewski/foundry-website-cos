// Pure content rules, shared by build-content.mjs and the unit tests.

export const slug = (s) =>
  String(s)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function excludeRegex(names) {
  if (!names.length) return null;
  const esc = names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(`\\b(${esc.join("|")})\\b`, "i");
}

/**
 * Walks any JSON value and applies: exact replacements, quote removals,
 * then exclusion (drops array items or sentences that mention an excluded name).
 * Returns { value, log } where log lists everything dropped.
 */
export function applyRules(input, rules) {
  const re = excludeRegex(rules.exclude || []);
  const removeQuotes = new Set(rules.removeQuotes || []);
  const log = [];

  const fixString = (s, path) => {
    let out = s;
    for (const [find, rep] of rules.replace || []) out = out.split(find).join(rep);
    if (re && re.test(out)) {
      const sentences = out.split(/(?<=[.!?])\s+/);
      const kept = sentences.filter((x) => !re.test(x));
      log.push(`sentence dropped at ${path}: "${sentences.filter((x) => re.test(x)).join(" ")}"`);
      out = kept.join(" ");
    }
    return out;
  };

  const mentions = (v) => re && re.test(JSON.stringify(v));

  const walk = (v, path) => {
    if (typeof v === "string") return fixString(v, path);
    if (Array.isArray(v)) {
      const out = [];
      v.forEach((item, i) => {
        if (typeof item === "string" && removeQuotes.has(item)) {
          log.push(`quote removed at ${path}[${i}]`);
          return;
        }
        if (item && typeof item === "object" && isPersonRecord(item) && mentions(identity(item))) {
          log.push(`entry dropped at ${path}[${i}]: ${identity(item).join(" / ")}`);
          return;
        }
        if (typeof item === "string" && re && re.test(applyReplacements(item, rules))) {
          log.push(`item dropped at ${path}[${i}]: "${item}"`);
          return;
        }
        out.push(walk(item, `${path}[${i}]`));
      });
      return out;
    }
    if (v && typeof v === "object") {
      const out = {};
      for (const [k, val] of Object.entries(v)) out[k] = walk(val, `${path}.${k}`);
      return out;
    }
    return v;
  };

  return { value: walk(input, "$"), log };
}

function applyReplacements(s, rules) {
  let out = s;
  for (const [find, rep] of rules.replace || []) out = out.split(find).join(rep);
  return out;
}

// Records whose identity fields name a person or character: dropped whole if they match.
const isPersonRecord = (o) => "character" in o || "player" in o || ("name" in o && ("who" in o || "status" in o));
const identity = (o) => [o.character, o.player, o.name].filter(Boolean);

/** Finds strings that might be DM-only knowledge, for a human to review. */
export function spoilerFlags(input, words) {
  const flags = [];
  const re = new RegExp(`\\b(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "i");
  const walk = (v, path) => {
    if (typeof v === "string" && re.test(v)) flags.push(`${path}: ${v}`);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(input, "$");
  return flags;
}
