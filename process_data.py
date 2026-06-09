import json, xmltodict
import mwparserfromhell
import gzip
import bz2
import re

DUMP_ARTICLES = "simplewiki-20260101-pages-articles-multistream.xml.bz2"
DUMP_PAGELINKS = "simplewiki-20260101-pagelinks.sql.gz"
OUT_JSON = "smoldata.json"

all_categories = {}
all_pages = {}

def process_page(xml):
    page = xmltodict.parse(xml)["page"]
    title = page["title"]
    try:
        text = page["revision"]["text"]["#text"]
    except KeyError:
        return
    if text.upper().startswith("#REDIRECT"):
        return
    text_toparse = text
    #text_toparse = re.sub('\\[\\[File:[^\\]]+\\]\\]\\n?', '', text_toparse)
    #text_toparse = re.sub('{{Infobox(?:[^{}]+(?:{{(?:[^{}]+(?:{{[^}]+}}|}))+}|}))+}', '', text_toparse, flags=re.MULTILINE)
    text_toparse = "\n".join(x for x in text_toparse.split("\n") if not x.startswith("thumb|") if not x.upper().startswith("__NOTOC__") and (len(x) == 0 or not x[0] in "{}[]|!&<>-*= ")).strip("\n")
    text_toparse = re.sub(r'<ref[^>]*>.*?</ref>', '', text_toparse, flags=re.DOTALL)
    text_toparse = "\n".join(text_toparse.split("\n\n")[0].split("\n")[:8])
    #print(f"< {title} >")
    parsed_text = mwparserfromhell.parse(text_toparse).strip_code().strip()
    while len(parsed_text) > 300 and len(dot_split:=parsed_text.split(".")) > 2:
        parsed_text = ".".join(dot_split[:-2]) + "."
    while len(parsed_text) > 300 and len(dot_split:=parsed_text.split("\n")) > 2:
        parsed_text = "\n".join(dot_split[:-1])
    #print(parsed_text)
    categories = [cat.split("|")[0].split("]")[0].strip().replace(u"\u200E","").replace(u"\u200F","").replace("_", " ") for cat in text.lower().split("[[category:")[1:]]
    # categories += [cat.split("|")[0].split("}")[0].strip().replace(u"\u200E","").replace(u"\u200F","").replace("_", " ")+" (musician)" for cat in text.lower().split("{{songs category|display=")[1:]]
    if "{{songs category" in text.lower():
        categories.append(title.lower().replace("category:", "")[:-len(" songs")])

    thumb = None
    for thumbptrnword in ["logo", "screenshot", "cover", "image", "map"]:
        result = re.search(f'\\| *{thumbptrnword} *=(.+)', text, re.IGNORECASE)
        if result:
            thumb = result.group(1).strip()
            break
    if thumb is None:
        if "[[File:" in text:
            thumb = text.split("[[File:")[1].split("|")[0].split("]")[0].strip()
    if thumb is not None and len(thumb.strip()) == 0:
        thumb = f"{title}.png"

    all_pages[title] = {
        "id": int(page["id"]),
        "title": title,
        "text": parsed_text,
        "categories": categories,
        "thumb": thumb,
        "disambiguation": "{{disambiguation}}" in text.lower() or "{{disambig}}" in text.lower() or "{{numberdis}}" in text.lower(),
    }

    for category in categories:
        if category not in all_categories:
            all_categories[category] = []
        all_categories[category].append(title)

print("Processing links...")
links = {}
INSERT_SYNTAX = "INSERT INTO `pagelinks` VALUES "
with gzip.open(DUMP_PAGELINKS, "rt") as f:
    for l in f:
        if l.startswith(INSERT_SYNTAX):
            for v in l[len(INSERT_SYNTAX)+1:-3].split("),("):
                a,_,b = v.split(",")
                if int(a) not in links:
                    links[int(a)] = []    
                links[int(a)].append(int(b))

current_entry = None
with bz2.open(DUMP_ARTICLES, "rt") as f:
    for i,l in enumerate(f):
        if i % 1000000 == 0:
            print(f"{i/30_093_139*100:.02f}%")
        if l == "  <page>\n":
            current_entry = ""
        if l == "  </page>\n":
            current_entry += "  </page>"
            process_page(current_entry)
            current_entry = None
        if current_entry == None:
            continue
        current_entry += l

print("Subcategories...")
subCategories = {}
for k,v in all_categories.items():
    for subCat in v:
        if not subCat.lower().startswith("category:"):
            continue
        subCatVal = subCat.lower().split("category:")[1]
        if subCatVal not in subCategories:
            subCategories[subCatVal] = []
        subCategories[subCatVal].append(k)

print("Final version...")
pages2 = []
noPageMaps = {}
for page in all_pages.values():
    if page["disambiguation"] or len(re.sub("[\\s0-9]{2,4}", "", page["text"])) == 0 or re.match("^[0-9]{2,4}s?$", page["title"]) or (":" in page["title"] and page["title"].lower().split(":")[0] in ["module","category","template","wikimedia","mediawiki","wikipedia","help"]):
        noPageMaps[page["id"]] = page["title"]
        continue
    pages2.append([page["title"],page["id"],page["text"],page["thumb"],page["categories"],links[page["id"]] if page["id"] in links else []])
# pages2.sort(key=lambda x:x[0])

with open(OUT_JSON, "w") as f:
    json.dump({"pages": pages2, "noPageMaps": noPageMaps, "subCategories": subCategories}, f, separators=(',', ':'))
