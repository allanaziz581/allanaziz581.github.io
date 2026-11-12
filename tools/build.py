#!/usr/bin/env python3
"""Regenerate every copy of the work entries from content.json.

content.json is the one place to edit. This script rewrites, between build markers:
  index.html  <!-- build:work -->      readable layer articles (screen readers, search, agents)
  index.html  <!-- build:worklist -->  the visible work index buttons
  index.html  <!-- build:ld-work -->   schema.org ItemList (JSON-LD)
  llms.txt    <!-- build:work -->      plain-text profile for AI agents

Standard library only. Usage: python3 tools/build.py [--check]
--check exits 1 if any file would change (for a pre-publish check).
"""
import html
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTENT = os.path.join(ROOT, "content.json")
INDEX = os.path.join(ROOT, "index.html")
LLMS = os.path.join(ROOT, "llms.txt")

KEY_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
RESERVED = {"content", "work", "about", "contact", "home", "studio", "menu", "gl", "scroll-track", "detail",
            "work-h", "about-h", "contact-h", "edit"}
TEXT_FIELDS = ("category", "title", "subtitle", "when", "where", "desc", "summary", "poster", "schemaType")
LIST_FIELDS = ("role", "highlights", "tools")
SCHEMA_TYPES = {"CreativeWork", "SoftwareSourceCode", "VideoGame", "OrganizationRole", "MusicComposition", "Product"}


class ContentError(ValueError):
    pass


def validate(data):
    """Check shape and clean values. Returns the cleaned dict or raises ContentError."""
    if not isinstance(data, dict) or not isinstance(data.get("work"), list):
        raise ContentError("content.json needs a 'work' list")
    if not data["work"]:
        raise ContentError("the work list is empty")
    if len(data["work"]) > 16:
        raise ContentError("at most 16 work entries")
    seen = set()
    clean = []
    for n, p in enumerate(data["work"], 1):
        if not isinstance(p, dict):
            raise ContentError(f"entry {n} is not an object")
        key = str(p.get("key", "")).strip()
        if not KEY_RE.match(key):
            raise ContentError(f"entry {n}: key '{key}' must be lowercase letters, digits and dashes")
        if key in RESERVED:
            raise ContentError(f"entry {n}: key '{key}' is reserved by the page")
        if key in seen:
            raise ContentError(f"entry {n}: key '{key}' is used twice")
        seen.add(key)
        q = {"key": key}
        for f in TEXT_FIELDS:
            v = p.get(f, "")
            if not isinstance(v, str):
                raise ContentError(f"{key}: '{f}' must be text")
            q[f] = v.strip()
        if not q["title"]:
            raise ContentError(f"{key}: title is empty")
        for f in LIST_FIELDS:
            v = p.get(f, [])
            if not isinstance(v, list) or not all(isinstance(x, str) for x in v):
                raise ContentError(f"{key}: '{f}' must be a list of text")
            q[f] = [x.strip() for x in v if x.strip()]
        links = p.get("links", [])
        if not isinstance(links, list):
            raise ContentError(f"{key}: links must be a list")
        q["links"] = []
        for l in links:
            if not isinstance(l, dict):
                raise ContentError(f"{key}: each link needs label and href")
            href = str(l.get("href", "")).strip()
            label = str(l.get("label", "")).strip() or href
            if not re.match(r"^(https://|mailto:)", href):
                raise ContentError(f"{key}: link '{href}' must start with https:// or mailto:")
            q["links"].append({"label": label, "href": href})
        if q["schemaType"] and q["schemaType"] not in SCHEMA_TYPES:
            raise ContentError(f"{key}: schemaType must be one of {sorted(SCHEMA_TYPES)}")
        clean.append(q)
    out = {k: v for k, v in data.items() if k != "work"}
    out["work"] = clean
    return out


def e(s):
    return html.escape(s, quote=True)


def num(i):
    return f"{i + 1:02d}"


def canonical(index_html):
    m = re.search(r'<link rel="canonical" href="([^"]+)"', index_html)
    return m.group(1) if m else "https://example.com/"


def readable_articles(work):
    out = []
    for i, p in enumerate(work):
        head = f"{num(i)}. {e(p['title'])}" + (f": {e(p['subtitle'])}" if p["subtitle"] else "")
        lines = [f'    <article id="{p["key"]}" data-key="project:{p["key"]}" data-category="{e(p["category"])}">',
                 f"      <h3>{head}</h3>"]
        meta = ", ".join(x for x in (p["when"], p["where"]) if x)
        if meta or p["category"]:
            cat = f" Category: {e(p['category'])}." if p["category"] else ""
            lines.append(f"      <p>{e(meta)}{'.' if meta else ''}{cat}</p>")
        if p["summary"] or p["desc"]:
            lines.append(f"      <p>{e(p['summary'] or p['desc'])}</p>")
        if p["highlights"]:
            lines.append('      <ul data-key="highlights">')
            lines += [f"        <li>{e(h)}</li>" for h in p["highlights"]]
            lines.append("      </ul>")
        if p["tools"]:
            lines.append(f"      <p>Tools: {e(', '.join(p['tools']))}.</p>")
        if p["role"]:
            lines.append(f"      <p>Role: {e(', '.join(p['role']))}.</p>")
        for l in p["links"]:
            lines.append(f'      <p><a href="{e(l["href"])}">{e(p["title"])}: {e(l["label"])}</a></p>')
        lines.append("    </article>")
        out.append("\n".join(lines))
    return "\n".join(out)


def work_list(work):
    return "\n".join(
        f'      <li data-i="{i}" data-key="{p["key"]}"><button type="button" tabindex="-1">[{num(i)}] {e(p["title"].lower())}</button></li>'
        for i, p in enumerate(work))


def ld_work(work, site):
    items = []
    for i, p in enumerate(work):
        t = p["schemaType"] or "CreativeWork"
        item = {"@type": t, "@id": f"{site}#{p['key']}", "name": p["title"] + (f": {p['subtitle']}" if p["subtitle"] else ""),
                "url": f"{site}#{p['key']}", "description": p["summary"] or p["desc"]}
        if t == "OrganizationRole":
            item["roleName"] = p["subtitle"] or p["title"]
        else:
            item["creator"] = {"@id": f"{site}#person"}
        if p["tools"]:
            item["keywords"] = ", ".join(p["tools"])
        repo = next((l["href"] for l in p["links"] if "github.com" in l["href"]), None)
        if t == "SoftwareSourceCode" and repo:
            item["codeRepository"] = repo
        others = [l["href"] for l in p["links"] if l["href"] != repo or t != "SoftwareSourceCode"]
        if others:
            item["sameAs"] = others if len(others) > 1 else others[0]
        items.append({"@type": "ListItem", "position": i + 1, "item": item})
    doc = {"@context": "https://schema.org", "@type": "ItemList", "@id": f"{site}#work-list",
           "name": "Selected work", "itemListOrder": "https://schema.org/ItemListOrderAscending", "itemListElement": items}
    body = json.dumps(doc, indent=2, ensure_ascii=False).replace("</", "<\\/")
    return f'<script type="application/ld+json" id="ld-work">\n{body}\n</script>'


def llms_work(work):
    out = []
    for i, p in enumerate(work):
        head = f"### {num(i)}. {p['title']}" + (f": {p['subtitle']}" if p["subtitle"] else "")
        out.append(head)
        meta = ", ".join(x for x in (p["when"], p["where"]) if x)
        if meta:
            out.append(f"{meta}. Category: {p['category']}." if p["category"] else f"{meta}.")
        out.append("")
        out.append(p["summary"] or p["desc"])
        if p["highlights"]:
            out.append("")
            out += [f"- {h}" for h in p["highlights"]]
        if p["tools"]:
            out.append("")
            out.append(f"Tools: {', '.join(p['tools'])}.")
        for l in p["links"]:
            out.append(f"Link: [{l['label']}]({l['href']})")
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def splice(text, name, body, path):
    start, end = f"<!-- build:{name} -->", f"<!-- /build:{name} -->"
    a, b = text.find(start), text.find(end)
    if a < 0 or b < 0 or b < a:
        raise ContentError(f"{os.path.basename(path)} is missing the {start} ... {end} markers")
    line_start = text.rfind("\n", 0, b) + 1
    indent = text[line_start:b] if text[line_start:b].strip() == "" else ""
    return text[: a + len(start)] + "\n" + body + "\n" + indent + text[b:]


def build(data, check=False):
    """Validate and write every copy. Returns the list of files that changed."""
    data = validate(data)
    work = data["work"]
    with open(INDEX, encoding="utf-8") as f:
        index = f.read()
    with open(LLMS, encoding="utf-8") as f:
        llms = f.read()
    site = canonical(index)
    new_index = splice(index, "work", readable_articles(work), INDEX)
    new_index = splice(new_index, "worklist", work_list(work), INDEX)
    new_index = splice(new_index, "ld-work", ld_work(work, site), INDEX)
    new_llms = splice(llms, "work", llms_work(work), LLMS)
    changed = []
    for path, old, new in ((INDEX, index, new_index), (LLMS, llms, new_llms)):
        if old != new:
            changed.append(os.path.relpath(path, ROOT))
            if not check:
                tmp = path + ".tmp"
                with open(tmp, "w", encoding="utf-8") as f:
                    f.write(new)
                os.replace(tmp, path)
    return changed


def main():
    check = "--check" in sys.argv[1:]
    try:
        with open(CONTENT, encoding="utf-8") as f:
            data = json.load(f)
        changed = build(data, check=check)
    except (ContentError, json.JSONDecodeError) as err:
        print(f"build: {err}", file=sys.stderr)
        return 2
    if check:
        if changed:
            print("build --check: out of date: " + ", ".join(changed))
            return 1
        print("build --check: up to date")
        return 0
    print("build: updated " + (", ".join(changed) if changed else "nothing (already up to date)"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
