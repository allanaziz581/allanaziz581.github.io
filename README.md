# Allan Aziz, portfolio

Live at **https://allanaziz.com/** (also reachable at https://allanaziz581.github.io/, which redirects there).

Personal site for Allan Aziz: engineering and music. Plain HTML, CSS and JavaScript with Three.js from a CDN. No build step.

## Run it locally

```bash
python3 tools/serve.py
```

Then open http://127.0.0.1:5178 (or http://127.0.0.1:5178/?edit to edit). It has to be served over HTTP (not opened as a file) because the scripts are ES modules. `tools/serve.py` listens on 127.0.0.1 only; any static server works for viewing.

## How the page is built

Two layers in `index.html`:

1. **Readable layer** (`main#content`, class `sr-layer`). Visually hidden, but it is the real page for screen readers, search engines and AI agents: headings, one `article` per project, experience, skills, contact. Each block has a `data-key` (`identity`, `quick-facts`, `work`, `project:<slug>`, `about`, `contact`) and schema.org microdata. Keyboard users who tab into it see it as a text panel. If WebGL is missing or JavaScript is off, this layer becomes the visible page.
2. **Visual layer**: the WebGL canvas and the overlays on top of it, all `aria-hidden`. Only the header (name, sound, let's talk, menu) and the menu are real, focusable controls.

Also for machines: JSON-LD in the `<head>` (Person, ProfilePage, ItemList of the work), `llms.txt` (plain-text profile for AI agents), `robots.txt`, `sitemap.xml`, Open Graph and Twitter tags, `assets/og.jpg`.

## Scroll sequence

| Screens scrolled | Scene | File |
|---|---|---|
| 0 to 1 | Hero: Allan's photo as pixel blocks on a curved grid on a near-black sky with streetlight orange along his outline (no purple); scrolling pixelates it away (2, 4, then 8 blocks per pixel) and scatters it | `js/hero.js` |
| 1.55 onward, one screen per entry | Selected work: one CRT screen per entry in `content.json` | `js/work.js`, `js/posters.js` |
| then about 3.3 | About: corridor of robot arms, circuit board and mixing-desk faders | `js/tunnel.js` |
| last 1.4 | Contact | `js/tunnel.js` |

`js/main.js` maps scroll to scenes (`scrollMap()` sizes everything from the number of entries), `js/post.js` is the CRT look, `js/sound.js` the optional ambient pad, `js/detail.js` the project detail view and the editor.

## Project details

Click the front screen (or `> open project`, or the active row in the list) and the camera dives into that screen; a panel opens with the summary, highlights, tools, role and links. `close - x`, Escape, or scrolling outwards closes it: the wheel (or a swipe) on the scene pulls the camera back, and past about a third of the way the project closes and the page stays on that screen; stop sooner and it settles back in. Over the panel the wheel scrolls the text first. On a phone, dragging the sheet down from its top does the same. The arrow keys or `< prev` / `next >` change project. Every entry has a shareable address: `#tesla` scrolls to it, `#tesla/details` opens it.

## Editing content

All work entries live in **`content.json`**, in site order (Tesla and music first). Each entry is one screen, one row in the work list, one detail page, one article in the readable layer, one JSON-LD item and one section of `llms.txt`.

Two ways to edit:

1. **In the browser**: run `tools/serve.py`, open `/?edit`, click a screen. The detail panel becomes a form (title, subtitle, category, dates, short text, summary, highlights one per line, tools, role, links as `label | https://...`, screen artwork, web address). `save` writes `content.json` (the old one is kept as `content.json.bak`), rebuilds the page and reloads. `+ add project`, `move up`, `move down` and `delete` are there too. On a host without `serve.py`, `save` downloads `content.json` instead.
2. **By hand**: edit `content.json`, then run `python3 tools/build.py`. It checks the file (unique keys, https links, field types) and rewrites the generated parts of `index.html` (between `<!-- build:... -->` markers) and `llms.txt`. `python3 tools/build.py --check` exits 1 if they are out of date.

Screen artwork is picked by `poster` (`tesla`, `studio`, `headset`, `thinkfree`, `pwm`, `dsp`, `brute`, in `js/posters.js`); an entry without one gets a title card. The `poster` key also picks the project's three colours (`TINTS` in `js/posters.js`): `main` for the big heading beside the screen and the faint wall words, `room` for the pale background shade of the room while that screen is in front (rose for Tesla, light blue for music, blue for the headset, mint for ThinkFree), and `pop`, a contrasting colour for the hard shadow behind the heading, the project number, the marker on the selected row and `> open project`. Every heading starts at Tesla's size; `fitTitle()` in `js/main.js` shrinks a long one only until it fits the column in two lines. Coming from the hero, the room starts dark with only the screens lit and its lights fade up over about half a screen of scrolling (`roomLight()` in `js/main.js`), so there is no white flash. Outside the work room the accent is streetlight orange (`--street` in `css/style.css`), with studio pink (`--studio`) for the music side. Tesla's name, on its screen and in the heading beside it, is in the Tesla logo red (#e82127) and the site's pixel font.

Lettering: headings use Pixelify Sans, except the capitals Z, L and C, which come from Silkscreen (a Google Fonts request with `text=ZLC`, listed first in `--font-pix`) because Pixelify draws them like a backwards S, a curled L and an O. To swap another letter, add it to that `text=` list.

## Portrait

The hero is one photo: Allan cut out of the night-street picture (`IMG_2108`), with everyone else in it removed. `assets/portrait.png` is the cut-out and `assets/portrait.json` its face box; `PORTRAIT` in `js/content.js` sets how much of it shows (`bottom`), its size and position, and the colour fix. The photo was taken under street lights, so each colour channel gets a small curve that turns the white T-shirt neutral and brings the cheeks to Allan's skin colour as measured on a daylight photo (`skinTarget`). In the browser it becomes a grid of blocks (128 across, 96 on phones; `COLS` in `photoModel()` in `js/hero.js`), slightly thicker towards the middle so it has depth when it turns towards the pointer; the bottom rows dissolve. To make a new cut-out (macOS 14 or later, uses Apple Vision; the output carries no location or camera metadata):

```bash
swift tools/portrait/cutout.swift <photo> assets [bottom 0-1] [width px]
```

It keeps the person with the largest face. If you change photos, update `white` (a box on something white in the new picture) and check `bottom`, `height` and `yOffset`. Set `PORTRAIT = null` to fall back to the drawn figure.

`assets/og.jpg` (the link preview) is a 1200x630 capture of the hero; retake it after changing the portrait.

## Hosting

The site is served by GitHub Pages straight from the `main` branch of this repository (no build step, no workflow). Push to `main` and Pages republishes in a minute or two.

Before pushing a content change, run `python3 tools/build.py --check`. Leave out `content.json.bak` and anything listed in `.gitignore`. `?edit` is harmless on a static host: without `serve.py` it can only download a copy.

The canonical URL, Open Graph URLs, JSON-LD ids, `llms.txt`, `robots.txt` and the sitemap use `https://allanaziz.com/`. The `CNAME` file in the root holds the custom domain; don't delete it, or Pages falls back to the github.io address.

### Domain and HTTPS

allanaziz.com is registered at Cloudflare. Its DNS points at GitHub Pages, every record set to "DNS only" (grey cloud) so GitHub can issue and renew its Let's Encrypt certificate:

- `A` for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- `AAAA` for `@`: `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
- `CNAME` for `www`: `allanaziz581.github.io` (Pages redirects www to the apex)

"Enforce HTTPS" is on under Settings, Pages, so http:// visits are redirected to https://. Everything the page loads (fonts, Three.js, images) comes over https, so browsers show no mixed-content warning. Don't turn on the orange-cloud proxy for these records: GitHub's certificate renewal needs to reach Pages directly.

The `MX`, `TXT` and `sig1._domainkey` records belong to the email address and are separate from the website.
