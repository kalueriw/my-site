# my-site

Qiao Yi's hand-written site for Web Technologies 2026. Five pages, one
stylesheet, one navigation, and no framework.

## Run it

**It has to be served, not opened from disk.** The navigation is fetched from
`nav.html`, and browsers block `fetch` on `file://` URLs. Double-clicking
`index.html` will show the nav warning instead of the menu — that is the
browser's CORS rule, not a broken page.

From this folder, either:

- open it in VS Code and press **Go Live** (Live Server), or
- run `python -m http.server 8000` and visit <http://localhost:8000/>.

## Pages

| File | What it is |
|---|---|
| `index.html` | Hero image, site title, one sentence, and the three entries |
| `quotes.html` | 20 quotes in English; one picked at random on load |
| `project.html` | 5 project ideas, each with the person it is for |
| `machine.html` | One useless machine: write a word, watch it erased, keep the record |
| `about.html` | Who I am, what I am learning, and `#contact` |

`nav.html` and `footer.html` are **fragments**, not pages: no `<!DOCTYPE>`,
no `<html>`, no `<head>`. `nav.js` fetches them into
`<header id="site-header">` and `<footer id="site-footer">` on every page.
Validate the five real pages at <https://validator.w3.org>; validating a
fragment on its own will always fail, by design.

## The rules this site is built to

**1 · Hero.** A real `<img>` in a fixed-height box, `width: 100%` with
`object-fit: cover`, so the picture is cropped rather than squashed. The
illustration is `images/hero.svg`: a `1600 × 900` viewBox, which is why it
stays sharp on any screen and weighs 8 KB instead of several megabytes.

**2 · Quotes.** Twenty entries, each with the text, the author and the
source. All twenty are in English, so no entry needs a language marker or a
translation — a quotation is only missing something if it is not in English
and has no translation beside it.

**3 · DRY navigation.** The `<nav>` exists only in `nav.html`. Adding a sixth
page means editing that one file. `nav.js` also marks the current page with
`aria-current="page"`, and explains itself in the header if the fetch fails.

**4 · Projects.** Five ideas, and each of the three list types doing its own
job: `<ul>` for the unordered ideas, `<dl>` for idea → audience pairs,
`<ol>` for the build order.

**5 · One rule, twenty cards.** The `.quote` class sets padding, border,
radius, background and max-width once; all twenty cards obey. The site
footer is `#site-footer` — an **id**, not a `footer` tag selector — because
every quote card contains a `<footer>` of its own.

**6 · The useless machine.** One card, one brass arm, and a field for writing
the mark. Typing previews the word on the card; pressing the button commits
it, the arm wipes it away, the arm withdraws, and the card is blank again. It
is in four states: `blank`, `marked`, `erasing`, `retracting`. The ledger
beside the machine keeps the last eight words it has taken, the all-time
count, and milestones at 1, 10, 25 and 50 — all in `localStorage`, so the
record survives a reload even though the card never does. The status line
changes at 1, 5, 10, 25, 50 and 100 marks. Minsky described the idea in 1952;
Shannon built the switch version in 1950. This one is the same joke reversed:
it does not switch itself back on, it undoes what you did.

**7 · No state bugs.** The machine is a state machine. One variable holds the
state, one function paints the page from it, and one timer is ever alive.
Classes are never removed "somewhere else" — `render()` derives them every
time, so nothing can be left behind. Pressing the button while the arm is
working is refused, not queued. Verified by hammering it:

- 30 rapid presses, then settle → back to `blank`, no `is-*` class left
- a press mid-`erasing` → refused, the cycle still completes

**8 · Final pass.** `node tools/check.mjs` checks every link and image with
exact-case matching (so `Hero.jpg` vs `hero.jpg` cannot slip through), plus
placeholders, empty `alt`, and quote completeness.

```bash
node tools/check.mjs      # exits 1 on any problem
```

## Files

```
index.html  quotes.html  project.html  machine.html  about.html
nav.html    footer.html              ← fragments, one copy of each
style.css   machine.css              ← site-wide, and machine-only
nav.js      quotes.js   machine.js
images/hero.svg   favicon.svg
tools/check.mjs                      ← not loaded by any page
```

## Known limitations

- The fonts are system fonts plus Georgia, so there is nothing to download and
  nothing to fail — but the exact rendering differs a little between Windows,
  macOS and Android. That is expected.
- The ledger and the all-time count use `localStorage`. In a private window
  they work for the visit and disappear with the tab.
