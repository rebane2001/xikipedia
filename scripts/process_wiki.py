#!/usr/bin/env python3
"""
Processes WikiMedia XML dumps + SQL pagelinks into a SQLite database.
Adapted from xikipedia's process_data.py with multi-language support.

Usage:
  python scripts/process_wiki.py --lang ru \
    --articles /path/to/ruwiki-latest-pages-articles-multistream.xml.bz2 \
    --pagelinks /path/to/ruwiki-latest-pagelinks.sql.gz \
    --output data/ru.db

  python scripts/process_wiki.py --lang simple \
    --articles /path/to/simplewiki-latest-pages-articles-multistream.xml.bz2 \
    --pagelinks /path/to/simplewiki-latest-pagelinks.sql.gz \
    --output data/simple.db
"""

import argparse
import bz2
import gzip
import json
import os
import re
import resource
import sqlite3
import sys
from collections import defaultdict

import mwparserfromhell
import xmltodict


def _get_memory_mb():
    """Get current process RSS memory in MB (macOS/Linux)."""
    usage = resource.getrusage(resource.RUSAGE_SELF)
    # ru_maxrss is in bytes on macOS, KB on Linux
    if sys.platform == "darwin":
        return usage.ru_maxrss / (1024 * 1024)
    return usage.ru_maxrss / 1024

# ── Language-specific configurations ──────────────────────────────────────────

LANG_CONFIGS = {
    "simple": {
        "redirect_prefixes": ["#REDIRECT"],
        "category_prefix": "[[category:",
        # Only templates placed ON disambiguation pages themselves
        "disambiguation_templates": ["{{disambiguation}}", "{{disambig}}", "{{numberdis}}"],
        "thumbnail_fields": ["logo", "screenshot", "cover", "image", "map"],
        "file_prefixes": ["File"],
        "songs_category": True,
        "strip_infobox_braces": False,
        "strip_accents": False,
        "filter_list_pages": False,
        "total_lines_estimate": 30_000_000,
    },
    "ru": {
        "redirect_prefixes": ["#REDIRECT", "#ПЕРЕНАПРАВЛЕНИЕ", "#перенаправление"],
        "category_prefix": "[[категория:",
        # ONLY templates placed ON disambiguation pages themselves.
        # Do NOT include hatnote templates ({{значения}}, {{другие значения}},
        # {{однофамильцы}}, etc.) — those appear on real articles like Литва,
        # Россия, Великая Отечественная война and would incorrectly filter them.
        "disambiguation_templates": [
            "{{неоднозначность}}", "{{многозначность}}",
            "{{дизамбиг}}", "{{disambiguation}}", "{{disambig}}",
            "{{проверенная неоднозначность}}",
            # Surname/name disambiguation pages
            "{{фамилия}}", "{{имя+фамилия}}",
        ],
        # Ordered by frequency in actual dump data — first match wins
        # Includes numbered variants (image1, изобр1, etc.)
        "thumbnail_fields": [
            "изображение", "герб", "флаг", "на карте", "картинка",
            "логотип", "эмблема", "фото", "портрет", "фотография",
            "карта", "автограф", "лого", "монограмма", "обложка",
            "изобр", "пример", "файл", "arms", "company_logo",
            "image", "logo", "screenshot", "cover", "map", "photo",
        ],
        "file_prefixes": ["Файл", "File", "Image", "Изображение"],
        "songs_category": False,
        "strip_infobox_braces": True,
        "strip_accents": True,
        "filter_list_pages": True,
        "total_lines_estimate": 500_000_000,
    },
}

# ── Globals ───────────────────────────────────────────────────────────────────

all_categories = defaultdict(list)  # category_name -> [page_title, ...]
all_pages = {}                      # title -> page dict
lang_config = None


def strip_accent_marks(text):
    """Remove combining acute accent (U+0301) used for stress marks in Russian Wikipedia.

    E.g. "Кра́сная кни́га" → "Красная книга", "Лингви́стика" → "Лингвистика"
    """
    return text.replace("\u0301", "")


def extract_excerpt(text):
    """Extract a clean plain-text excerpt from wikitext.

    For languages with complex multi-line infoboxes (Russian), uses brace-depth
    tracking to skip template blocks. Otherwise uses the simpler line-prefix filter.
    """
    if lang_config["strip_infobox_braces"]:
        # Track {{ / }} depth to skip multi-line templates/infoboxes
        result = []
        depth = 0
        for line in text.split("\n"):
            depth += line.count("{{") - line.count("}}")
            if depth > 0:
                continue
            depth = max(depth, 0)
            if line.startswith("thumb|") or line.upper().startswith("__NOTOC__"):
                continue
            if len(line) > 0 and line[0] in "{}[]|&<>-*= ":
                continue
            result.append(line)
        text_toparse = "\n".join(result).strip("\n")
    else:
        text_toparse = "\n".join(
            x for x in text.split("\n")
            if not x.startswith("thumb|")
            and not x.upper().startswith("__NOTOC__")
            and (len(x) == 0 or x[0] not in "{}[]|&<>-*= ")
        ).strip("\n")

    text_toparse = "\n".join(text_toparse.split("\n\n")[0].split("\n")[:8])

    parsed_text = mwparserfromhell.parse(text_toparse).strip_code().strip()

    # Clean up any remaining markup artifacts
    parsed_text = re.sub(r'<ref[^>]*>.*?</ref>', '', parsed_text)  # <ref>...</ref>
    parsed_text = re.sub(r'<ref[^>]*/>', '', parsed_text)  # <ref ... />
    parsed_text = re.sub(r'</?ref[^>]*>', '', parsed_text)  # unclosed/orphan <ref> or </ref>
    parsed_text = re.sub(r'\{\{[^}]*\}\}', '', parsed_text)  # remaining {{...}}
    parsed_text = re.sub(r'[{}]{2,}', '', parsed_text)  # orphaned {{ or }}
    parsed_text = re.sub(r'\[\[[^]]*\]\]', '', parsed_text)  # remaining [[...]]
    parsed_text = re.sub(r'\[\s*\]', '', parsed_text)  # empty []
    parsed_text = re.sub(r'[<>]', '', parsed_text)  # stray angle brackets
    parsed_text = re.sub(r'\(\s*\)', '', parsed_text)  # empty parentheses from stripped templates
    parsed_text = re.sub(r',\s*,', ',', parsed_text)  # double commas from removed content
    parsed_text = re.sub(r'\s{2,}', ' ', parsed_text).strip()  # collapse whitespace

    while len(parsed_text) > 300 and len(dot_split := parsed_text.split(".")) > 2:
        parsed_text = ".".join(dot_split[:-2]) + "."
    while len(parsed_text) > 300 and len(dot_split := parsed_text.split("\n")) > 2:
        parsed_text = "\n".join(dot_split[:-1])

    # Strip stress accent marks for Russian
    if lang_config.get("strip_accents"):
        parsed_text = strip_accent_marks(parsed_text)

    return parsed_text


def _clean_thumb_value(value):
    """Clean a raw thumbnail value extracted from wikitext.

    Handles cases like:
    - "[[файл:Something.svg" → "Something.svg"
    - "Image:Something.png" → "Something.png"
    - "Something.jpg|200px" → "Something.jpg"
    """
    if not value:
        return None

    # Strip [[File: / [[Файл: prefix if present
    for prefix in ["[[файл:", "[[file:", "[[image:", "[[изображение:", "file:", "image:", "файл:", "изображение:"]:
        if value.lower().startswith(prefix):
            value = value[len(prefix):]
            break

    # Strip trailing wikitext noise
    value = re.split(r'[<\|{}\[\]]', value)[0].strip()

    if not value:
        return None
    return value


def extract_thumbnail(text):
    """Extract the best thumbnail filename from wikitext."""
    thumb = None

    # Try infobox fields (ordered by priority in lang config)
    # Also try numbered variants (image1, изобр1, etc.)
    fields_to_try = list(lang_config["thumbnail_fields"])
    for field in lang_config["thumbnail_fields"]:
        fields_to_try.append(f"{field}1")
    for field in fields_to_try:
        result = re.search(rf'\| *{re.escape(field)} *=(.+)', text, re.IGNORECASE)
        if result:
            value = result.group(1).strip()
            if not value or value.startswith("{{"):
                continue
            thumb = _clean_thumb_value(value)
            if thumb:
                break

    # Fallback: first [[File:...]] or [[Файл:...]] link
    if thumb is None:
        for prefix in lang_config["file_prefixes"]:
            marker = f"[[{prefix}:"
            if marker in text:
                thumb = text.split(marker)[1].split("|")[0].split("]")[0].strip()
                if thumb:
                    break

    if thumb is not None and len(thumb.strip()) == 0:
        thumb = None

    return thumb


def process_page(xml):
    """Parse a single <page> XML block and extract article data.

    Processes ns=0 (main) articles fully. Also extracts category memberships
    from ns=14 (category) pages to build the subcategory tree.
    """
    page = xmltodict.parse(xml)["page"]
    title = page["title"]
    ns = page.get("ns", "0")

    try:
        text = page["revision"]["text"]["#text"]
    except (KeyError, TypeError):
        return

    # Skip redirects
    text_upper = text[:50].upper()
    for prefix in lang_config["redirect_prefixes"]:
        if text_upper.startswith(prefix.upper()):
            return

    # Extract categories (needed for both ns=0 articles and ns=14 category pages)
    cat_prefix = lang_config["category_prefix"]
    categories = [
        cat.split("|")[0].split("]")[0].strip()
           .replace("\u200E", "").replace("\u200F", "").replace("_", " ")
        for cat in text.lower().split(cat_prefix)[1:]
    ]

    # Always register categories (needed for subcategory tree from ns=14 pages)
    for category in categories:
        all_categories[category].append(title)

    # Only fully process main namespace articles
    if ns != "0":
        return

    parsed_text = extract_excerpt(text)

    # Songs category (Simple English only)
    if lang_config["songs_category"] and "{{songs category" in text.lower():
        categories.append(title.lower().replace("category:", "")[:-len(" songs")])

    thumb = extract_thumbnail(text)

    # Check disambiguation — search entire text (templates can appear at end)
    # Match as substrings: {{фамилия|Foo}} should match "{{фамилия"
    text_lower = text.lower()
    is_disambiguation = any(
        t.rstrip("}") in text_lower
        for t in lang_config["disambiguation_templates"]
    )

    all_pages[title] = {
        "id": int(page["id"]),
        "title": title,
        "text": parsed_text,
        "categories": categories,
        "thumb": thumb,
        "disambiguation": is_disambiguation,
    }


def parse_pagelinks(path, keep_ids=None):
    """Parse a gzipped MySQL pagelinks dump and return {from_id: [to_id, ...]}.

    Format: (pl_from, pl_from_namespace, pl_target_id)
    We only keep namespace 0 (main articles) links.
    If keep_ids is provided, only keep links FROM those page IDs (saves memory).
    """
    print("Processing pagelinks...")
    links = defaultdict(list)
    INSERT_SYNTAX = "INSERT INTO `pagelinks` VALUES "
    row_count = 0
    skipped = 0
    with gzip.open(path, "rt", errors="replace") as f:
        for line in f:
            if line.startswith(INSERT_SYNTAX):
                for v in line[len(INSERT_SYNTAX) + 1:-3].split("),("):
                    parts = v.split(",")
                    if len(parts) >= 3:
                        from_id = int(parts[0])
                        namespace = int(parts[1])
                        target_id = int(parts[2])
                        if namespace != 0:
                            continue
                        # Only keep links from articles we'll use
                        if keep_ids is not None and from_id not in keep_ids:
                            skipped += 1
                            continue
                        links[from_id].append(target_id)
                        row_count += 1
    print(f"  Kept {row_count:,} links for {len(links):,} pages")
    if skipped:
        print(f"  Skipped {skipped:,} links (article not in keep set)")
    return links


def parse_articles(path, max_pages=0):
    """Stream-parse bz2 XML dump, calling process_page for each <page>."""
    print("Processing articles...")
    total_lines_estimate = lang_config.get("total_lines_estimate", 30_000_000)
    current_entry = None
    page_count = 0
    with bz2.open(path, "rt") as f:
        for i, line in enumerate(f):
            if i % 1_000_000 == 0:
                pct = min(i / total_lines_estimate * 100, 99.9)
                mem_mb = _get_memory_mb()
                print(f"  ~{pct:.1f}% ({i:,} lines, {len(all_pages):,} pages, {mem_mb:.0f} MB)")
            if line == "  <page>\n":
                current_entry = ""
            if line == "  </page>\n":
                current_entry += "  </page>"
                process_page(current_entry)
                current_entry = None
                page_count += 1
                if max_pages and page_count >= max_pages:
                    print(f"  Reached page limit ({max_pages})")
                    break
            if current_entry is None:
                continue
            current_entry += line
    print(f"  Done: {len(all_pages):,} pages total")


def build_subcategories():
    """Build parent→child category map (subcategory lookup)."""
    print("Building subcategories...")
    sub_categories = defaultdict(list)
    # Both English and Russian category prefixes in page titles
    cat_title_prefixes = ["category:", "категория:"]
    for cat_name, pages in all_categories.items():
        for page_title in pages:
            title_lower = page_title.lower()
            for prefix in cat_title_prefixes:
                if title_lower.startswith(prefix):
                    sub_cat_val = title_lower.split(prefix, 1)[1]
                    sub_categories[sub_cat_val].append(cat_name)
                    break
    print(f"  {len(sub_categories):,} subcategory mappings")
    return sub_categories


def recursive_categories(sub_categories, categories, cache, depth=0, max_depth=15):
    """
    Recursively expand categories through subcategory tree.
    Port of recursiveCategories() from index.html.
    Max depth prevents stack overflow on very deep category chains.
    """
    if depth >= max_depth:
        return set(c.lower() if isinstance(c, str) else c for c in categories)
    all_cats = set(categories)
    for cat in categories:
        cat_lower = cat.lower() if isinstance(cat, str) else cat
        if not cat_lower:
            continue
        subs = sub_categories.get(cat_lower, [])
        if not subs:
            continue
        cache_value = cache.get(cat_lower)
        if cache_value is None:
            cache[cat_lower] = set()  # sentinel for cycle detection
            cache_value = recursive_categories(sub_categories, subs, cache, depth + 1, max_depth)
            cache[cat_lower] = cache_value
        elif not cache_value:
            # cycle detected or empty — recompute
            cache[cat_lower] = set()
            cache_value = recursive_categories(sub_categories, subs, cache, depth + 1, max_depth)
            cache[cat_lower] = cache_value
        all_cats.update(subs)
        all_cats.update(cache_value)
    return {c.lower() if isinstance(c, str) else c for c in all_cats}


_RU_MONTHS = (
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
)


def _is_date_page(title):
    """Check if title is a date/year/calendar page."""
    # English: "1945", "2024", "1990s"
    if re.match(r"^[0-9]{1,4}s?$", title):
        return True
    # Russian decades: "1990-е", "1850-е годы"
    if re.match(r"^[0-9]{1,4}-е( год[ыа])?$", title):
        return True
    # Russian year pages: "1837 год", "997 год до н. э."
    if re.match(r"^[0-9]{1,4} год", title):
        return True
    # Russian century pages: "XX век", "III век до н. э."
    if re.match(r"^[IVXLCDM]+ век", title):
        return True
    # Russian day pages: "25 августа", "1 января"
    parts = title.split()
    if len(parts) == 2 and parts[0].isdigit() and parts[1].lower() in _RU_MONTHS:
        return True
    return False


def filter_pages():
    """Filter out disambiguation pages, empty pages, date pages, list pages.

    Returns (kept_pages list, filtered_ids set).
    """
    print("Filtering pages...")
    kept = []
    filtered_ids = set()
    filter_list = lang_config.get("filter_list_pages", False)

    stats = {"disambig": 0, "disambig_title": 0, "empty": 0, "date": 0, "list": 0, "short": 0}

    for page in all_pages.values():
        text_stripped = re.sub(r"[\s0-9]{2,4}", "", page["text"])
        title = page["title"]
        title_lower = title.lower()
        is_date = _is_date_page(title)

        # Additional disambig detection: title ends with "(значения)" or similar
        is_disambig_title = title_lower.endswith("(значения)") or title_lower.endswith("(disambiguation)")

        # Filter pages with very short excerpts (likely disambig/list/stub pages)
        is_too_short = len(page["text"].strip()) < 40

        # Filter "Список ..." pages (Russian list articles)
        is_list = filter_list and title.startswith("Список ")

        skip = False
        if page["disambiguation"]:
            stats["disambig"] += 1; skip = True
        elif is_disambig_title:
            stats["disambig_title"] += 1; skip = True
        elif len(text_stripped) == 0:
            stats["empty"] += 1; skip = True
        elif is_date:
            stats["date"] += 1; skip = True
        elif is_list:
            stats["list"] += 1; skip = True
        elif is_too_short:
            stats["short"] += 1; skip = True

        if skip:
            filtered_ids.add(page["id"])
            continue

        kept.append(page)

    print(f"  Kept {len(kept):,} articles, filtered {len(filtered_ids):,}")
    for reason, count in stats.items():
        if count > 0:
            print(f"    {reason}: {count:,}")
    return kept, filtered_ids


def write_sqlite(kept_pages, links, sub_categories, output_path, max_depth=5):
    """Write all data to SQLite database.

    Uses two-pass approach for category expansion to avoid OOM:
    1. First pass: warm up the recursive category cache (touching all subcategories)
    2. Collect all unique category names from cache for ID mapping
    3. Second pass: expand per-article and write to DB in batches
    """
    print(f"Writing SQLite database to {output_path} (max_depth={max_depth})...")

    # Warm up the recursive category cache by expanding all subcategory keys.
    # This populates the cache so per-article lookups are O(1).
    print("  Warming recursive category cache...")
    cache = {}
    for i, key in enumerate(sub_categories):
        if i % 50_000 == 0 and i > 0:
            print(f"    {i:,}/{len(sub_categories):,} subcats cached ({_get_memory_mb():.0f} MB)")
        recursive_categories(sub_categories, [key], cache, max_depth=max_depth)
    print(f"    Cache warmed: {len(cache):,} entries ({_get_memory_mb():.0f} MB)")

    # Collect all unique category names from the cache
    print("  Building category ID map...")
    all_cat_names = set()
    for cached_cats in cache.values():
        all_cat_names.update(cached_cats)
    # Also add direct category names from articles
    for page in kept_pages:
        for c in page["categories"]:
            all_cat_names.add(c.lower() if isinstance(c, str) else c)

    cat_name_to_id = {}
    for idx, name in enumerate(sorted(all_cat_names)):
        cat_name_to_id[name] = idx
    print(f"  {len(cat_name_to_id):,} unique categories")

    # Write to SQLite
    conn = sqlite3.connect(output_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=OFF")

    conn.executescript("""
        DROP TABLE IF EXISTS articles;
        DROP TABLE IF EXISTS categories;
        DROP TABLE IF EXISTS article_categories;
        DROP TABLE IF EXISTS article_links;

        CREATE TABLE articles (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            excerpt TEXT,
            thumb TEXT
        );
        CREATE TABLE categories (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE article_categories (
            article_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            PRIMARY KEY (article_id, category_id)
        );
        CREATE TABLE article_links (
            article_id INTEGER NOT NULL,
            target_page_id INTEGER NOT NULL,
            PRIMARY KEY (article_id, target_page_id)
        );
    """)

    # Insert categories
    print("  Inserting categories...")
    conn.executemany(
        "INSERT INTO categories (id, name) VALUES (?, ?)",
        [(cid, name) for name, cid in cat_name_to_id.items()]
    )

    # Insert articles + categories in batches to control memory
    print("  Inserting articles + categories (batched)...")
    BATCH = 50_000
    total_cat_rows = 0
    for batch_start in range(0, len(kept_pages), BATCH):
        batch = kept_pages[batch_start:batch_start + BATCH]

        # Insert articles
        conn.executemany(
            "INSERT INTO articles (id, title, excerpt, thumb) VALUES (?, ?, ?, ?)",
            [(p["id"], p["title"], p["text"], p["thumb"]) for p in batch]
        )

        # Expand categories and insert (using cache — fast lookups)
        cat_rows = []
        for page in batch:
            expanded = recursive_categories(sub_categories, list(page["categories"]), cache, max_depth=max_depth)
            for cat_name in expanded:
                cid = cat_name_to_id.get(cat_name)
                if cid is not None:
                    cat_rows.append((page["id"], cid))
        conn.executemany(
            "INSERT OR IGNORE INTO article_categories (article_id, category_id) VALUES (?, ?)",
            cat_rows
        )
        total_cat_rows += len(cat_rows)

        if batch_start % (BATCH * 4) == 0:
            conn.commit()  # Periodic commit to flush WAL
            print(f"    {batch_start + len(batch):,}/{len(kept_pages):,} "
                  f"({total_cat_rows:,} cat pairs, {_get_memory_mb():.0f} MB)")

    conn.commit()
    print(f"    {total_cat_rows:,} article-category pairs total")

    # Insert article_links (batched to avoid OOM with 100M+ links)
    print("  Inserting article links...")
    total_link_rows = 0
    link_batch = []
    for page in kept_pages:
        page_links = links.get(page["id"], [])
        for target_id in page_links:
            link_batch.append((page["id"], target_id))
        if len(link_batch) >= 500_000:
            conn.executemany(
                "INSERT OR IGNORE INTO article_links (article_id, target_page_id) VALUES (?, ?)",
                link_batch
            )
            total_link_rows += len(link_batch)
            link_batch = []
    if link_batch:
        conn.executemany(
            "INSERT OR IGNORE INTO article_links (article_id, target_page_id) VALUES (?, ?)",
            link_batch
        )
        total_link_rows += len(link_batch)
    print(f"    {total_link_rows:,} article-link pairs")

    # Create indexes
    print("  Creating indexes...")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ac_article ON article_categories(article_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ac_category ON article_categories(category_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_al_article ON article_links(article_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cat_name ON categories(name)")

    conn.commit()

    # VACUUM to compact the database (important after batch inserts)
    print("  Running VACUUM...")
    conn.execute("PRAGMA journal_mode=DELETE")  # WAL doesn't support VACUUM
    conn.execute("VACUUM")
    conn.close()
    print("  Done!")


def main():
    global lang_config

    parser = argparse.ArgumentParser(description="Process Wikipedia dumps into SQLite")
    parser.add_argument("--lang", required=True, choices=list(LANG_CONFIGS.keys()),
                        help="Language code")
    parser.add_argument("--articles", required=True, help="Path to articles XML bz2 dump")
    parser.add_argument("--pagelinks", required=True, help="Path to pagelinks SQL gz dump")
    parser.add_argument("--output", required=True, help="Output SQLite database path")
    parser.add_argument("--limit", type=int, default=0,
                        help="Max pages to process (0 = all, useful for testing)")
    parser.add_argument("--max-depth", type=int, default=5,
                        help="Max recursion depth for category expansion (default: 5)")
    args = parser.parse_args()

    lang_config = LANG_CONFIGS[args.lang]
    sys.setrecursionlimit(5000)

    # Step 1: Parse articles (builds all_pages + all_categories)
    parse_articles(args.articles, max_pages=args.limit)
    print(f"  Memory after articles: {_get_memory_mb():.0f} MB")

    # Step 2: Build subcategory tree and filter articles
    sub_categories = build_subcategories()
    kept_pages, filtered_ids = filter_pages()

    # Free all_pages to reclaim memory before loading pagelinks
    kept_ids = {p["id"] for p in kept_pages}
    all_pages.clear()
    all_categories.clear()
    print(f"  Memory after clearing: {_get_memory_mb():.0f} MB")

    # Step 3: Parse pagelinks (only for kept articles — saves ~60% memory)
    links = parse_pagelinks(args.pagelinks, keep_ids=kept_ids)
    print(f"  Memory after pagelinks: {_get_memory_mb():.0f} MB")

    # Step 4: Write SQLite database
    write_sqlite(kept_pages, links, sub_categories, args.output, max_depth=args.max_depth)

    print(f"\nDatabase written to {args.output}")
    print(f"Peak memory: {_get_memory_mb():.0f} MB")


if __name__ == "__main__":
    main()
