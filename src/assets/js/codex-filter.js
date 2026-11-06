// Codex filter buttons and search. Without JS, every entry shows under its heading.
const root = document.getElementById("codex");

if (root) {
  const buttons = [...root.querySelectorAll("[data-filter]")];
  const search = root.querySelector("[data-search]");
  const groups = [...root.querySelectorAll(".codex-group")];
  const empty = root.querySelector("[data-empty]");
  let type = "all";

  root.querySelector(".filters").hidden = false;
  search.hidden = false;

  function apply() {
    const q = search.value.trim().toLowerCase();
    let shown = 0;
    for (const g of groups) {
      const groupMatch = type === "all" || g.dataset.type === type;
      let groupShown = 0;
      for (const item of g.querySelectorAll(".codex-item")) {
        const ok = groupMatch && (!q || item.textContent.toLowerCase().includes(q));
        item.hidden = !ok;
        if (ok) groupShown++;
      }
      g.hidden = groupShown === 0;
      shown += groupShown;
    }
    empty.hidden = shown !== 0;
  }

  for (const b of buttons) {
    b.addEventListener("click", () => {
      type = b.dataset.filter;
      for (const o of buttons) o.setAttribute("aria-pressed", String(o === b));
      apply();
    });
  }
  search.addEventListener("input", apply);
}
