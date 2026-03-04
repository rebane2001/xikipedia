# Wikiquiz: Multi-Language Wikipedia Feed

## Goal

Build a server-backed fork of Xikipedia (<https://github.com/rebane2001/xikipedia>) that serves Wikipedia articles as a social media-style doomscroll feed. The original loads everything into the browser — we need a server because full-language Wikipedia dumps are too large for that approach.

The purpose is pub quiz preparation — browse random Wikipedia articles with an algorithm that learns what you engage with. Start with Russian, but the architecture must support adding more languages later (Polish is next).

## Reference Implementation

Clone <https://github.com/rebane2001/xikipedia> and study it thoroughly before writing any code. The key files are:

- `process_data.py` — Python script that parses WikiMedia XML dumps + SQL pagelinks into a JSON data file. This is the data pipeline you need to adapt.
- `index.html` — The entire frontend + algorithm in one file (~1286 lines). Contains the feed algorithm (`getNextPost` function around line 1075), engagement scoring (`engagePost` around line 1006), recursive category resolution (around line 974), post rendering, profile management, and all UI.

Understand every part of the original before implementing anything. The algorithm, the data structures, the scoring — all of it.

## Input Data

Russian Wikipedia dumps are already downloaded:

- Articles: `/Users/uladzislau/Downloads/ruwiki-latest-pages-articles-multistream.xml.bz2` (~5.5 GB compressed, ~33 GB uncompressed XML)
- Pagelinks: `/Users/uladzislau/Downloads/ruwiki-latest-pagelinks.sql.gz` (~few hundred MB)

These are standard WikiMedia dump formats — same structure as the Simple English dumps the original `process_data.py` expects, but with Russian-specific wikitext conventions.

## Tech Stack

- **Runtime**: Bun
- **HTTP framework**: Hono
- **Database**: SQLite via `bun:sqlite`
- **Data pipeline**: Python (adapt the original `process_data.py`)
- **Frontend**: Fork of the original vanilla HTML/JS from Xikipedia
- **Testing**: Use Playwright to verify the frontend works end-to-end

## Architecture

### Data Pipeline (Python)

A Python script that reads the Wikipedia dumps and produces a SQLite database per language. The original `process_data.py` outputs a single JSON file — we output SQLite instead because the data is too large to fit in browser memory.

Key adaptations needed for Russian:

- Redirect syntax: Russian Wikipedia uses `#ПЕРЕНАПРАВЛЕНИЕ` in addition to `#REDIRECT`
- Category prefix: `[[Категория:` instead of `[[Category:`
- Disambiguation templates: `{{Неоднозначность}}`, `{{Значения}}` instead of `{{disambiguation}}`
- Namespace prefixes for filtering: модуль, категория, шаблон, википедия, справка, медиавики
- Infobox thumbnail fields: логотип, изображение, герб, флаг, карта, фото (in addition to English ones like image, logo, map)
- The `{{songs category}}` template doesn't exist in Russian wiki — skip that logic

The language-specific config should be a dictionary/map so adding Polish later is just adding another entry.

The SQLite schema should use integer IDs for categories (map category strings to ints during import) to keep the in-memory index compact. Pre-compute the recursive category tree per article during import (the original does this at load time in the browser — too slow for 2M articles at runtime).

Memory consideration: the original `process_data.py` uses `xmltodict.parse()` per `<page>` element. Each page is small (10-50 KB) so this should work even for 2M articles, but monitor memory. The line-by-line bz2 reading (original lines 79-91) is already streaming. If `xmltodict` is too slow, consider `lxml.etree.fromstring()`.

The pagelinks SQL parsing (original lines 66-76) reads a gzipped MySQL dump and extracts `(from_page_id, to_page_id)` pairs. This logic is language-agnostic and should work as-is.

### Server (Bun + Hono)

A Bun server that:

1. On startup, loads each language's SQLite database and builds in-memory indexes:
   - An array of all article IDs (for fast random sampling — the algorithm picks 10,000 random articles per feed request)
   - A map of `article_id → category_id[]` (the pre-computed `allCategories` from the pipeline)
   - A set of article IDs that have images (for the +5 base score)
   - Category name ↔ ID bidirectional lookup

2. Serves a REST API with language as a path parameter:
   - `POST /api/:lang/feed` — accepts `{ scores: Record<string, number>, seen: number[], batchSize?: number }`, returns a batch of scored articles. This is where the `getNextPost` algorithm runs server-side.
   - `GET /api/:lang/categories/search?q=...` — autocomplete for the start screen category picker
   - `GET /api/:lang/categories/popular` — default categories for the start screen

3. Serves the frontend as static files

The feed algorithm is a direct port of the original `getNextPost()` (index.html ~line 1075):

- Sample 10,000 random articles from the ID array
- Score each one: base score (has image? +5, seen before? heavy penalty) + sum of category scores from client's `scores` map
- Selection: 40% chance weighted random, 42% highest score, 18% pure random
- Return the selected article's data (title, excerpt, thumbnail filename, categories)

The client sends category score names as strings. The server maps them to integer IDs for the actual scoring computation, then maps back for the response. The `p:{pageId}` pseudo-categories (for pagelink boosting) stay as strings.

Article detail (title, excerpt, thumb) comes from SQLite on demand — only the category index needs to be in memory.

### Frontend

Fork the original `index.html` with these changes:

- Remove all data loading code (the `getFileWithProgress` function, service worker data caching, the `pagesArr` in-memory array, the `smoldata.json` fetching)
- Remove the recursive category computation (it's pre-computed on the server now)
- Replace `getNextPost()` with a fetch to `POST /api/:lang/feed`, sending `categoryScores` and recent `seenPosts`
- Replace single-post rendering with batch rendering (fetch 20 posts at a time, render them, fetch more on scroll)
- Replace `getArticleLink()` to use the correct Wikipedia domain per language (`ru.wikipedia.org`, `pl.wikipedia.org`)
- Replace the default category list with language-appropriate categories
- Wire the category search input to `/api/:lang/categories/search` instead of local filtering
- Read the language from the URL path (e.g., `/ru/` or `/pl/`)
- Keep ALL client-side state: `categoryScores`, `seenPosts`, `likedPosts`, profiles, settings — these stay in localStorage
- Keep the `engagePost()` function client-side — it updates `categoryScores` locally, which get sent with the next feed request
- Keep the full UI: like button, image viewer, profiles, stats, settings, theme switcher

The "Open links in English Wikipedia" setting should be adapted — for Russian it could offer "Open in English Wikipedia" as an option, for Polish likewise.

## Multi-Language Design

The architecture must be language-agnostic. Adding a new language should require only:

1. A new language config entry in the pipeline (redirect prefixes, category prefix, disambiguation templates, namespace prefixes, thumbnail fields)
2. A new language config entry on the server (default categories for the start screen, Wikipedia domain for article links, UI strings if you want localization)
3. Running the pipeline on the new language's dumps
4. Dropping the new `.db` file into the data directory

The server auto-discovers available languages by scanning for `*.db` files in the data directory at startup.

A landing page at `/` should list available languages and link to each one.

## Project Structure

```
wikiquiz/
├── src/
│   ├── index.ts                # Hono app, static file serving, startup
│   ├── routes/
│   │   └── feed.ts             # API route handlers
│   ├── services/
│   │   ├── feed-service.ts     # Algorithm port (scoring, selection)
│   │   └── wiki-store.ts       # Per-language SQLite + in-memory indexes
│   ├── config/
│   │   └── languages.ts        # Per-language frontend config (default cats, wiki URLs)
│   └── types.ts
├── web/                         # Static frontend
│   ├── index.html              # Modified Xikipedia frontend
│   └── favicon.ico
├── scripts/
│   ├── process_wiki.py         # Data pipeline (language-agnostic with config)
│   └── requirements.txt        # xmltodict, mwparserfromhell
├── data/                        # SQLite databases go here (gitignored)
├── tests/
│   └── e2e.spec.ts             # Playwright tests
├── package.json
├── tsconfig.json
└── .gitignore
```

## Git Discipline

- Commit regularly with meaningful messages
- **NEVER commit Wikipedia data** — the `.gitignore` must exclude: `data/*.db`, `*.xml.bz2`, `*.sql.gz`, `*.json.br`, `smoldata.json`, and any other large data files
- Commit the pipeline script, server code, frontend, configs, and tests

## Testing Strategy

Use Playwright to verify the full flow works:

1. Start the Bun server
2. Navigate to the app in a browser
3. Verify the start screen loads with category pickers
4. Select some categories and click continue
5. Verify posts appear in the feed
6. Verify scrolling loads more posts
7. Verify like button works (visual state change)
8. Verify clicking a post opens the correct Wikipedia article link (ru.wikipedia.org for Russian)
9. Verify category search returns results

Run the pipeline on a small sample first if the full dump takes too long during development — you can create a test fixture by extracting the first few thousand pages from the dump.

## Development Order

1. Study the reference implementation thoroughly
2. Set up the project (bun init, dependencies, gitignore, initial commit)
3. Build the data pipeline — adapt `process_data.py` for Russian, output SQLite. Run it on the actual dump.
4. Build the server — WikiStore (data loading + in-memory indexes), feed algorithm, API routes
5. Build the frontend — fork and modify the original `index.html`
6. Integration test — run server, open in browser, verify the feed works
7. Add Playwright e2e tests
8. Research for more "Infobox thumbnail fields", "Category prefix", "Disambiguation templates" in the russian dataset to improve data pipeline for russian language
9. Polish and iterate until it's done

The pipeline (step 3) will take hours to run on the full Russian dump. Start it early and work on the server/frontend in parallel using a small test database.

## Performance Notes

- The hot path is scoring 10,000 random candidates per feed request. With in-memory data this should be sub-millisecond per candidate, so <10ms total per request.
- Use `Int32Array` for the article ID list and category ID arrays where possible — typed arrays are faster for numeric operations in JS.
- SQLite reads for article details (title, excerpt, thumb) should use prepared statements.
- `bun:sqlite` is synchronous by design and very fast for read-only workloads. No need for async DB access.
- For the random sampling, pre-load all article IDs into an array at startup and sample from it directly — don't use `ORDER BY RANDOM()` in SQLite.
