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
import re
import sqlite3
import sys
from collections import defaultdict

import mwparserfromhell
import xmltodict

# ── Language-specific configurations ──────────────────────────────────────────

LANG_CONFIGS = {
    "simple": {
        "redirect_prefixes": ["#REDIRECT"],
        "category_prefix": "[[category:",
        "disambiguation_templates": ["{{disambiguation}}", "{{disambig}}", "{{numberdis}}"],
        "namespace_prefixes": ["module", "category", "template", "wikimedia", "mediawiki", "wikipedia", "help"],
        "thumbnail_fields": ["logo", "screenshot", "cover", "image", "map"],
        "songs_category": True,
    },
    "ru": {
        "redirect_prefixes": ["#REDIRECT", "#ПЕРЕНАПРАВЛЕНИЕ", "#перенаправление"],
        "category_prefix": "[[категория:",
        "disambiguation_templates": [
            "{{неоднозначность}}", "{{значения}}", "{{disambiguation}}",
            "{{многозначность}}", "{{фамилия}}", "{{дизамбиг}}",
        ],
        "namespace_prefixes": [
            "module", "модуль", "category", "категория", "template", "шаблон",
            "wikipedia", "википедия", "help", "справка", "mediawiki", "медиавики",
            "wikimedia",
        ],
        "thumbnail_fields": [
            "логотип", "изображение", "герб", "флаг", "карта", "фото",
            "logo", "screenshot", "cover", "image", "map",
        ],
        "songs_category": False,
    },
}

# ── Globals ───────────────────────────────────────────────────────────────────

all_categories = defaultdict(list)  # category_name -> [page_title, ...]
all_pages = {}                      # title -> page dict
lang_config = None


def process_page(xml):
    """Parse a single <page> XML block and extract article data."""
    page = xmltodict.parse(xml)["page"]
    title = page["title"]

    try:
        text = page["revision"]["text"]["#text"]
    except (KeyError, TypeError):
        return

    # Skip redirects
    text_upper = text[:30].upper()
    for prefix in lang_config["redirect_prefixes"]:
        if text_upper.startswith(prefix.upper()):
            return

    # Extract plain-text excerpt
    text_toparse = "\n".join(
        x for x in text.split("\n")
        if not x.startswith("thumb|")
        and not x.upper().startswith("__NOTOC__")
        and (len(x) == 0 or x[0] not in "{}[]|&<>-*= ")
    ).strip("\n")
    text_toparse = "\n".join(text_toparse.split("\n\n")[0].split("\n")[:8])

    parsed_text = mwparserfromhell.parse(text_toparse).strip_code().strip()
    while len(parsed_text) > 300 and len(dot_split := parsed_text.split(".")) > 2:
        parsed_text = ".".join(dot_split[:-2]) + "."
    while len(parsed_text) > 300 and len(dot_split := parsed_text.split("\n")) > 2:
        parsed_text = "\n".join(dot_split[:-1])

    # Extract categories
    cat_prefix = lang_config["category_prefix"]
    categories = [
        cat.split("|")[0].split("]")[0].strip()
           .replace("\u200E", "").replace("\u200F", "").replace("_", " ")
        for cat in text.lower().split(cat_prefix)[1:]
    ]

    # Songs category (Simple English only)
    if lang_config["songs_category"] and "{{songs category" in text.lower():
        categories.append(title.lower().replace("category:", "")[:-len(" songs")])

    # Extract thumbnail
    thumb = None
    for field in lang_config["thumbnail_fields"]:
        result = re.search(rf'\| *{field} *=(.+)', text, re.IGNORECASE)
        if result:
            thumb = result.group(1).strip()
            break
    if thumb is None:
        if "[[File:" in text:
            thumb = text.split("[[File:")[1].split("|")[0].split("]")[0].strip()
        elif "[[Файл:" in text:
            thumb = text.split("[[Файл:")[1].split("|")[0].split("]")[0].strip()
    if thumb is not None and len(thumb.strip()) == 0:
        thumb = f"{title}.png"

    # Check disambiguation
    text_lower = text.lower()
    is_disambiguation = any(t in text_lower for t in lang_config["disambiguation_templates"])

    all_pages[title] = {
        "id": int(page["id"]),
        "title": title,
        "text": parsed_text,
        "categories": categories,
        "thumb": thumb,
        "disambiguation": is_disambiguation,
    }

    for category in categories:
        all_categories[category].append(title)


def parse_pagelinks(path):
    """Parse a gzipped MySQL pagelinks dump and return {from_id: [to_id, ...]}."""
    print("Processing pagelinks...")
    links = defaultdict(list)
    INSERT_SYNTAX = "INSERT INTO `pagelinks` VALUES "
    with gzip.open(path, "rt", errors="replace") as f:
        for line in f:
            if line.startswith(INSERT_SYNTAX):
                for v in line[len(INSERT_SYNTAX) + 1:-3].split("),("):
                    parts = v.split(",")
                    a = int(parts[0])
                    b = int(parts[2]) if len(parts) >= 3 else None
                    if b is not None:
                        links[a].append(b)
    print(f"  Found links for {len(links)} pages")
    return links


def parse_articles(path, total_lines_estimate=30_000_000):
    """Stream-parse bz2 XML dump, calling process_page for each <page>."""
    print("Processing articles...")
    current_entry = None
    with bz2.open(path, "rt") as f:
        for i, line in enumerate(f):
            if i % 1_000_000 == 0:
                pct = i / total_lines_estimate * 100
                print(f"  {pct:.1f}% ({i:,} lines, {len(all_pages):,} pages)")
            if line == "  <page>\n":
                current_entry = ""
            if line == "  </page>\n":
                current_entry += "  </page>"
                process_page(current_entry)
                current_entry = None
            if current_entry is None:
                continue
            current_entry += line
    print(f"  Done: {len(all_pages):,} pages total")


def build_subcategories():
    """Build parent→child category map (subcategory lookup)."""
    print("Building subcategories...")
    sub_categories = defaultdict(list)
    for cat_name, pages in all_categories.items():
        for page_title in pages:
            if not page_title.lower().startswith("category:"):
                continue
            sub_cat_val = page_title.lower().split("category:", 1)[1]
            sub_categories[sub_cat_val].append(cat_name)
    print(f"  {len(sub_categories):,} subcategory mappings")
    return sub_categories


def recursive_categories(sub_categories, categories, cache):
    """
    Recursively expand categories through subcategory tree.
    Port of recursiveCategories() from index.html.
    """
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
            cache_value = recursive_categories(sub_categories, subs, cache)
            cache[cat_lower] = cache_value
        elif not cache_value:
            # cycle detected or empty — recompute
            cache[cat_lower] = set()
            cache_value = recursive_categories(sub_categories, subs, cache)
            cache[cat_lower] = cache_value
        all_cats.update(subs)
        all_cats.update(cache_value)
    return {c.lower() if isinstance(c, str) else c for c in all_cats}


def filter_pages(links):
    """Filter out disambiguation pages, empty pages, date pages, namespace pages."""
    print("Filtering pages...")
    namespace_prefixes = lang_config["namespace_prefixes"]
    filtered = []
    no_page_maps = {}

    for page in all_pages.values():
        text_stripped = re.sub(r"[\s0-9]{2,4}", "", page["text"])
        title_lower = page["title"].lower()
        is_namespace = ":" in page["title"] and title_lower.split(":")[0] in namespace_prefixes
        is_date = bool(re.match(r"^[0-9]{2,4}s?$", page["title"]))

        if page["disambiguation"] or len(text_stripped) == 0 or is_date or is_namespace:
            no_page_maps[page["id"]] = page["title"]
            continue

        page_links = links.get(page["id"], [])
        filtered.append((page, page_links))

    print(f"  Kept {len(filtered):,} articles, filtered {len(no_page_maps):,}")
    return filtered, no_page_maps


def write_sqlite(filtered_pages, sub_categories, output_path):
    """Write all data to SQLite database."""
    print(f"Writing SQLite database to {output_path}...")

    # Pre-compute recursive categories for each article
    print("  Pre-computing recursive categories...")
    cache = {}
    article_recursive_cats = {}
    for i, (page, page_links) in enumerate(filtered_pages):
        if i % 10_000 == 0 and i > 0:
            print(f"    {i:,}/{len(filtered_pages):,} articles processed")
        expanded = recursive_categories(sub_categories, list(page["categories"]), cache)
        article_recursive_cats[page["id"]] = expanded

    # Build category name → integer ID mapping
    print("  Building category ID map...")
    all_cat_names = set()
    for cats in article_recursive_cats.values():
        all_cat_names.update(cats)
    cat_name_to_id = {}
    for idx, name in enumerate(sorted(all_cat_names)):
        cat_name_to_id[name] = idx

    print(f"  {len(cat_name_to_id):,} unique categories")

    # Write to SQLite
    conn = sqlite3.connect(output_path)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=OFF")

    conn.executescript("""
        CREATE TABLE IF NOT EXISTS articles (
            id INTEGER PRIMARY KEY,
            title TEXT NOT NULL,
            excerpt TEXT,
            thumb TEXT
        );
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY,
            name TEXT UNIQUE NOT NULL
        );
        CREATE TABLE IF NOT EXISTS article_categories (
            article_id INTEGER NOT NULL,
            category_id INTEGER NOT NULL,
            PRIMARY KEY (article_id, category_id)
        );
        CREATE TABLE IF NOT EXISTS article_links (
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

    # Insert articles
    print("  Inserting articles...")
    conn.executemany(
        "INSERT INTO articles (id, title, excerpt, thumb) VALUES (?, ?, ?, ?)",
        [(page["id"], page["title"], page["text"], page["thumb"]) for page, _ in filtered_pages]
    )

    # Insert article_categories
    print("  Inserting article categories...")
    cat_rows = []
    for page, _ in filtered_pages:
        page_id = page["id"]
        for cat_name in article_recursive_cats.get(page_id, set()):
            if cat_name in cat_name_to_id:
                cat_rows.append((page_id, cat_name_to_id[cat_name]))
    conn.executemany(
        "INSERT OR IGNORE INTO article_categories (article_id, category_id) VALUES (?, ?)",
        cat_rows
    )
    print(f"    {len(cat_rows):,} article-category pairs")

    # Insert article_links
    print("  Inserting article links...")
    link_rows = []
    for page, page_links in filtered_pages:
        for target_id in page_links:
            link_rows.append((page["id"], target_id))
    conn.executemany(
        "INSERT OR IGNORE INTO article_links (article_id, target_page_id) VALUES (?, ?)",
        link_rows
    )
    print(f"    {len(link_rows):,} article-link pairs")

    # Create indexes
    print("  Creating indexes...")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ac_article ON article_categories(article_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_ac_category ON article_categories(category_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_al_article ON article_links(article_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cat_name ON categories(name)")

    conn.commit()
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
    args = parser.parse_args()

    lang_config = LANG_CONFIGS[args.lang]

    links = parse_pagelinks(args.pagelinks)
    parse_articles(args.articles)
    sub_categories = build_subcategories()
    filtered_pages, _ = filter_pages(links)
    write_sqlite(filtered_pages, sub_categories, args.output)

    print(f"\nDatabase written to {args.output}")


if __name__ == "__main__":
    main()
