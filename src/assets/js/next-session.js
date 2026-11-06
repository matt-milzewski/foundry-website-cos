// Fills the next-session banner and tells the RSVP widget which date to use.
import { nextSession, formatSessionTimes, countdownText } from "./lib/schedule.js";

const el = document.getElementById("next-session");

if (el) {
  const schedule = JSON.parse(el.dataset.schedule);
  const when = el.querySelector("[data-when]");
  const times = el.querySelector("[data-times]");
  const note = el.querySelector("[data-note]");
  const countdown = el.querySelector("[data-countdown]");
  let current = null;

  const render = () => {
    const next = nextSession(schedule, new Date());
    if (!next) return;
    if (!current || current.date !== next.date) {
      current = next;
      const t = formatSessionTimes(next.start);
      when.textContent = t.day;
      times.innerHTML = "";
      const q = document.createElement("strong");
      q.textContent = `${t.qld} QLD`;
      const v = document.createElement("strong");
      v.textContent = `${t.vic} VIC`;
      times.append(q, " · ", v);
      note.textContent = next.note || "";
      note.hidden = !next.note;
      el.dataset.session = next.date;
      document.dispatchEvent(new CustomEvent("session:change", { detail: { date: next.date } }));
    }
    countdown.textContent = countdownText(next.start, new Date());
  };

  render();
  setInterval(render, 30_000);
}
