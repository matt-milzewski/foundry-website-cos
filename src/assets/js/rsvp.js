// Thumbs up / down for the next session. No login: anyone can set anyone's answer,
// the server only accepts the four roster names and yes / no / clear.

const root = document.getElementById("rsvp");

if (root) {
  const api = root.dataset.api;
  const players = JSON.parse(root.dataset.players);
  const list = root.querySelector(".rsvp");
  const summary = root.querySelector("[data-summary]");
  const errorEl = root.querySelector("[data-error]");
  let session = document.getElementById("next-session")?.dataset.session || null;
  let answers = {};
  let busy = false;

  const label = { yes: "In", no: "Out" };

  function render() {
    for (const p of players) {
      const row = list.querySelector(`[data-player="${p}"]`);
      const a = answers[p] || null;
      row.querySelector(".rsvp__state").textContent = a ? label[a] : "Waiting";
      for (const btn of row.querySelectorAll(".rsvp__btn")) {
        btn.setAttribute("aria-pressed", String(btn.dataset.answer === a));
        btn.disabled = busy;
      }
    }
    const ins = players.filter((p) => answers[p] === "yes").length;
    const outs = players.filter((p) => answers[p] === "no").length;
    summary.textContent = `${ins} in · ${outs} out · ${players.length - ins - outs} waiting`;
  }

  function build() {
    list.innerHTML = "";
    for (const p of players) {
      const li = document.createElement("li");
      li.className = "rsvp__row";
      li.dataset.player = p;
      const name = document.createElement("span");
      name.className = "rsvp__name";
      name.textContent = p;
      const state = document.createElement("span");
      state.className = "rsvp__state";
      state.setAttribute("aria-live", "polite");
      li.append(name, state);
      for (const [answer, emoji, verb] of [["yes", "👍", "is in"], ["no", "👎", "is out"]]) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "rsvp__btn";
        b.dataset.answer = answer;
        b.setAttribute("aria-label", `${p} ${verb}`);
        b.setAttribute("aria-pressed", "false");
        b.textContent = emoji;
        b.addEventListener("click", () => choose(p, answer));
        li.append(b);
      }
      list.append(li);
    }
  }

  async function load() {
    if (!session) return;
    try {
      const r = await fetch(`${api}/rsvp?session=${encodeURIComponent(session)}`, { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      if (data.session === session && !busy) {
        answers = data.answers || {};
        render();
      }
      errorEl.textContent = "";
    } catch {
      errorEl.textContent = "Couldn't load who's coming. It'll retry in a minute.";
    }
  }

  async function choose(player, answer) {
    if (!session || busy) return;
    const previous = { ...answers };
    const send = answers[player] === answer ? "clear" : answer;
    if (send === "clear") delete answers[player];
    else answers[player] = send;
    busy = true;
    render();
    try {
      const r = await fetch(`${api}/rsvp`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ session, player, answer: send }),
      });
      if (!r.ok) throw new Error(String(r.status));
      const data = await r.json();
      answers = data.answers || {};
      errorEl.textContent = "";
    } catch {
      answers = previous;
      errorEl.textContent = "Couldn't save that, try again.";
    } finally {
      busy = false;
      render();
    }
  }

  build();
  render();
  document.addEventListener("session:change", (e) => {
    session = e.detail.date;
    answers = {};
    render();
    load();
  });
  load();
  setInterval(() => {
    if (document.visibilityState === "visible") load();
  }, 60_000);
}
