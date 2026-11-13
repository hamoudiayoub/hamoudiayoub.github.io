# Ayoub Hamoudi · Portfolio

A static, dependency-free portfolio: HTML, CSS and vanilla JS.

- **Art direction:** two-color risograph (Majorelle blue + vermilion on warm paper). The illustrations were generated with Higgsfield (Seedream 5.0 Flash).
- **Interactive pieces:**
  - a live Raft cluster in the hero: click a node to crash it and watch a new leader get elected;
  - an interactive DistDB architecture diagram;
  - a `distdb=>` shell (press `/`) that answers a few SQL queries about my experience and projects.
- **Light and dark** themes, responsive down to 320 px, and `prefers-reduced-motion` support.

## Run locally

```bash
python -m http.server 5500
```

Then open http://localhost:5500.

## Structure

```
index.html          the whole page
css/style.css       design tokens, layout, themes
js/main.js          theme, reveal, Raft simulation, architecture panel, counters, shell
assets/img/         optimized illustrations (JPEG) + original avatar
```

When you change `css/style.css` or `js/main.js`, bump the `?v=` query in `index.html` so browsers reload them.

## Deploy

Live at **https://hamoudiayoub.github.io/** (GitHub Pages, served from the `main` branch of the `hamoudiayoub.github.io` repository). Every push to `main` redeploys the site in about a minute.
