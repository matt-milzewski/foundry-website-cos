// Works out the next session night. Shared by the browser and the unit tests.
// Sessions are scheduled in Queensland time (UTC+10, no daylight saving).

const QLD_OFFSET_H = 10;
const HOUR = 3600e3;
const DAY = 24 * HOUR;
const LINGER_MS = 4 * HOUR; // a session stays "next" until 4 hours after it starts

function qldToUtc(dateStr, time) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - QLD_OFFSET_H, mm));
}

function qldDateStr(instant) {
  return new Date(instant.getTime() + QLD_OFFSET_H * HOUR).toISOString().slice(0, 10);
}

/**
 * @param {{regular:{weekday:number,time:string}, overrides?:{date:string,time:string,note?:string}[], cancelled?:string[]}} schedule
 * @param {Date} now
 * @returns {{date:string, start:Date, note:string|null} | null}
 */
export function nextSession(schedule, now = new Date()) {
  const cutoff = now.getTime() - LINGER_MS;
  const cancelled = new Set(schedule.cancelled || []);
  const overrides = schedule.overrides || [];
  const overrideDates = new Set(overrides.map((o) => o.date));
  const candidates = [];

  for (const o of overrides) {
    const start = qldToUtc(o.date, o.time);
    if (start.getTime() >= cutoff && !cancelled.has(o.date)) {
      candidates.push({ date: o.date, start, note: o.note ?? null });
    }
  }

  let dayStart = qldToUtc(qldDateStr(new Date(cutoff)), "00:00");
  for (let i = 0; i < 62; i++) {
    const ds = qldDateStr(new Date(dayStart.getTime() + 12 * HOUR));
    const weekday = new Date(ds + "T00:00:00Z").getUTCDay();
    if (weekday === schedule.regular.weekday && !cancelled.has(ds) && !overrideDates.has(ds)) {
      const start = qldToUtc(ds, schedule.regular.time);
      if (start.getTime() >= cutoff) {
        candidates.push({ date: ds, start, note: null });
        break;
      }
    }
    dayStart = new Date(dayStart.getTime() + DAY);
  }

  candidates.sort((a, b) => a.start - b.start);
  return candidates[0] ?? null;
}

const fmt = (timeZone, opts) => new Intl.DateTimeFormat("en-AU", { timeZone, ...opts });

function clockTime(start, timeZone) {
  return fmt(timeZone, { hour: "numeric", minute: "2-digit", hour12: true })
    .format(start)
    .replace(/[  ]/g, " ")
    .replace(/\s*([ap])\.?\s?m\.?$/i, " $1m")
    .toLowerCase();
}

/** @returns {{day:string, qld:string, vic:string}} e.g. { day: "Sunday 8 Nov", qld: "8:00 pm", vic: "9:00 pm" } */
export function formatSessionTimes(start) {
  const parts = fmt("Australia/Brisbane", { weekday: "long", day: "numeric", month: "short" }).formatToParts(start);
  const get = (type) => (parts.find((p) => p.type === type)?.value || "").replace(/\.$/, "");
  return {
    day: `${get("weekday")} ${get("day")} ${get("month")}`,
    qld: clockTime(start, "Australia/Brisbane"),
    vic: clockTime(start, "Australia/Melbourne"),
  };
}

/** Countdown text like "in 1 day 3 hrs", "in 45 mins", or "Happening now". */
export function countdownText(start, now = new Date()) {
  const diff = start.getTime() - now.getTime();
  if (diff <= 0) return diff > -LINGER_MS ? "Happening now" : "";
  const mins = Math.round(diff / 60e3);
  const days = Math.floor(mins / 1440);
  const hrs = Math.floor((mins % 1440) / 60);
  const rem = mins % 60;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (days > 0) return `in ${plural(days, "day")}${hrs ? " " + plural(hrs, "hr") : ""}`;
  if (hrs > 0) return `in ${plural(hrs, "hr")}${rem ? " " + plural(rem, "min") : ""}`;
  return `in ${plural(Math.max(rem, 1), "min")}`;
}
