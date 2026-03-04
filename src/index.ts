import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { readdirSync } from "fs";
import { WikiStore } from "./services/wiki-store";
import { createFeedRoutes } from "./routes/feed";
import { LANGUAGE_CONFIGS } from "./config/languages";

const app = new Hono();
const stores = new Map<string, WikiStore>();

// Auto-discover languages by scanning data/*.db
const dataDir = new URL("../data", import.meta.url).pathname;
try {
  const files = readdirSync(dataDir);
  for (const file of files) {
    if (!file.endsWith(".db")) continue;
    const lang = file.replace(".db", "");
    console.log(`Loading ${lang} database...`);
    stores.set(lang, new WikiStore(`${dataDir}/${file}`));
    console.log(`  ${lang} ready`);
  }
} catch {
  console.log("No data directory found or no .db files. Start the pipeline first.");
}

// API routes
const feedRoutes = createFeedRoutes(stores);
app.route("/api", feedRoutes);

// GET /api/languages
app.get("/api/languages", (c) => {
  const languages = Array.from(stores.keys()).map((code) => {
    const config = LANGUAGE_CONFIGS[code];
    return {
      code,
      name: config?.name ?? code,
      nativeName: config?.nativeName ?? code,
      defaultCategories: config?.defaultCategories ?? [],
    };
  });
  return c.json({ languages });
});

// Landing page listing available languages
app.get("/", (c) => {
  const langs = Array.from(stores.keys());
  if (langs.length === 1) {
    return c.redirect(`/${langs[0]}/`);
  }
  const links = langs
    .map((code) => {
      const config = LANGUAGE_CONFIGS[code];
      const name = config?.nativeName ?? code;
      return `<a href="/${code}/" style="display:block;padding:16px;margin:8px 0;border:1px solid #38444D;border-radius:8px;text-decoration:none;color:inherit;font-size:18px">${name}</a>`;
    })
    .join("");
  return c.html(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Wikiquiz</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 600px; margin: 40px auto; padding: 0 16px; background: #15202B; color: #FFF; }
    h1 { text-align: center; }
    a:hover { background: #1a2a3a; }
  </style>
</head>
<body>
  <h1>Wikiquiz</h1>
  <p style="text-align:center;opacity:0.7">Choose a language</p>
  ${links}
</body>
</html>`);
});

// Serve static files from web/
app.use("/:lang/*", async (c, next) => {
  const lang = c.req.param("lang");
  const path = c.req.path;

  // Serve index.html for /:lang/ route
  if (path === `/${lang}/` || path === `/${lang}`) {
    return serveStatic({ path: "./web/index.html" })(c, next);
  }

  // Serve other static files from web/
  const filePath = path.replace(`/${lang}/`, "");
  return serveStatic({ path: `./web/${filePath}` })(c, next);
});

const port = parseInt(process.env.PORT ?? "3000");
console.log(`\nServer running at http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
};
