export default function (cfg) {
  cfg.setNunjucksEnvironmentOptions({ autoescape: true, throwOnUndefined: false });
  cfg.addPassthroughCopy({ "src/assets/css": "assets/css" });
  cfg.addPassthroughCopy({ "src/assets/js": "assets/js" });
  cfg.addPassthroughCopy({ "src/assets/img/out": "assets/img" });
  cfg.addPassthroughCopy({ "src/assets/img/favicon.svg": "favicon.svg" });
  cfg.addPassthroughCopy({ "src/robots.txt": "robots.txt" });

  // Self-hosted fonts (open licence) from @fontsource
  const fonts = {
    "node_modules/@fontsource/cinzel/files/cinzel-latin-600-normal.woff2": "assets/fonts/cinzel-600.woff2",
    "node_modules/@fontsource/cinzel/files/cinzel-latin-700-normal.woff2": "assets/fonts/cinzel-700.woff2",
    "node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-normal.woff2": "assets/fonts/ebg-400.woff2",
    "node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-400-italic.woff2": "assets/fonts/ebg-400i.woff2",
    "node_modules/@fontsource/eb-garamond/files/eb-garamond-latin-600-normal.woff2": "assets/fonts/ebg-600.woff2",
  };
  cfg.addPassthroughCopy(fonts);

  cfg.addFilter("pad2", (n) => String(n).padStart(2, "0"));
  cfg.addFilter("byStatus", (arr, ...statuses) => (arr || []).filter((c) => statuses.includes(c.status)));
  cfg.addFilter("sessionUrl", (n) => `/chronicle/session-${String(n).padStart(2, "0")}/`);
  cfg.addFilter("initials", (name) =>
    String(name || "?")
      .replace(/^(The|Dawnmaster)\s+/i, "")
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase()
  );
  cfg.addFilter("chunk", (arr, size) => {
    const out = [];
    for (let i = 0; i < (arr || []).length; i += size) out.push(arr.slice(i, i + size));
    return out;
  });
  cfg.addFilter("json", (v) => JSON.stringify(v));
  cfg.addFilter("findBy", (arr, key, value) => (arr || []).find((x) => x[key] === value));

  return {
    dir: { input: "src", output: "_site", includes: "_includes", data: "_data" },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
}
