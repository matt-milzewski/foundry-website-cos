// Phone menu toggle
const toggle = document.querySelector("[data-nav-toggle]");
const nav = document.getElementById("site-nav");

if (toggle && nav) {
  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };
  toggle.addEventListener("click", () => {
    const open = !nav.classList.contains("is-open");
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      close();
      toggle.focus();
    }
  });
  nav.addEventListener("click", (e) => {
    if (e.target.closest("a")) close();
  });
}
