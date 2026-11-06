// Live Foundry badge, from Foundry's public /api/status endpoint.
const el = document.getElementById("foundry-status");

if (el) {
  const url = el.dataset.url;
  const worlds = JSON.parse(el.dataset.worlds || "{}");
  const text = el.querySelector("[data-text]");

  const set = (state, msg) => {
    el.dataset.state = state;
    text.textContent = msg;
  };

  async function check() {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      if (!r.ok) throw new Error(String(r.status));
      const s = await r.json();
      if (s.active && s.world) {
        const name = worlds[s.world] || s.world;
        const n = Number(s.users) || 0;
        set("online", `Online · ${name} · ${n} ${n === 1 ? "player" : "players"} connected`);
      } else {
        set("idle", "Online · no world running");
      }
    } catch {
      set("offline", "Offline");
    } finally {
      clearTimeout(timer);
    }
  }

  check();
  setInterval(() => {
    if (document.visibilityState === "visible") check();
  }, 60_000);
}
