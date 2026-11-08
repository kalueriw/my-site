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
| `machine.html` | A 60-second game: twelve coins, one refund slot, a local high score |
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

The site has a **light and a dark theme**, switched from the nav on any page.
The palette is written once, in `:root`, with every colour as
`light-dark(light, dark)`; `color-scheme` decides which half is used. So the
theme is one attribute on `<html>`, and no component rule knows a theme
exists. Precedence: the visitor's stored choice beats the operating system,
and with no choice stored the page follows the OS — including when the OS
changes mid-visit. A two-line inline script in each `<head>` reads the stored
choice before first paint, so a returning dark-mode visitor never sees a
flash of cream paper. Contrast was measured in both themes against the
actual rendered pixels (the text is hidden, the background is sampled): every
text node on all five pages clears 4.5:1, or 3:1 where it is large.

**5b · Focus containment.** The start/end ticket is `role="dialog"
aria-modal="true"`, so it has to behave like one. When it opens, everything
outside it gets `inert`: one attribute takes the header, footer, receipt and
coin board out of the tab order, out of hit-testing and out of the
accessibility tree together. Browsers without `inert` fall back to a Tab trap
on the dialog, which is enough because the dialog holds a single control.

**5c · The last-ten-seconds warning.** `.refund-panel.is-final` recolours and
pulses the time dial. It read `.panel.is-final` for a while, which matches
nothing — the class is on `.refund-panel` — so the warning never appeared.
Worth keeping as a note on how quietly a selector can be wrong.

The words inside a card are set in the serif at a slightly larger size than
body text, so a quotation reads as a different kind of writing from the page
around it. The cards are laid out in CSS columns rather than grid rows: a grid
row either stretches "This is for everyone." into a half-empty box or leaves a
hole beneath it, while columns let every card take the height its words need
and still pack tight.

**6 · The useless machine.** A green-enamel vending machine with twelve brass
coins and one return arm. Every shelf is sold out, so when the visitor feeds a
coin the machine checks, finds nothing, and gives the coin back. A run is sixty
seconds, the arm gets faster, and in the second half it can return two coins at
once. Each coin fed is worth 10 points, multiplied by the combo; feeding a coin
within 2.5 seconds of the last one keeps the chain alive. Getting all twelve
coins inside the machine at once pays a 100-point "full refund" bonus. The
receipt beside the board keeps the best run, the number of runs, the longest
combo and the top three scores in `localStorage`.
Minsky described the useless machine in 1952; Shannon built the switch version
in 1950.

The board is drawn as a glass tray rather than a keypad: no cell frames, a
milled rim on each coin, and a recess that stays warm after a coin goes in. The
coin's artwork lives in a clipping stage (`.coin-stage`), so the return arm
cannot slide over its neighbours or out into the receipt column — a bug the
first version of this panel had. The coin fades in place when fed, because
sliding it downward let the tray's edge cut it into a half-moon mid-animation.

**7 · No runaway state.** The board is one state machine: `ready` → `running`
→ `closed`. While running, exactly one machine timer schedules the next return
and one clock interval paints the remaining time; both are cleared on end and
on restart. The twelve coins are real buttons with a label that says whether
the coin is in the tray or inside the machine; the player only feeds coins, and
the machine only puts them back. Verified:

- start → 60 seconds → `closed` once, with the result overlay and score
- a coin fed during the return arm's telegraph keeps the arm's target, and its
  class and label agree
- rapid clicks do not start a second run or stack machine timers
- best run, runs, longest combo and the top three scores survive a reload

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
  macOS and Android. That is expected. Every declared family was checked as
  installed and rendering (Georgia measures wider than Times, which is how the
  probe proved it was not silently falling back). The quotation cards were
  being drawn in the sans at one point while the spotlight copy of the same
  quote drew in the serif; both are now set from one rule.
- The record, best run and top scores use `localStorage`. In a private window
  they work for the visit and disappear with the tab.
- The run is designed for pointer and touch. Every coin is a keyboard button as
  well, but sixty seconds of twelve coins is a fast game.
- The theme switch stores its choice in `localStorage`. In a private window the
  choice holds for the visit and is forgotten with the tab; the page then falls
  back to following the operating system, which is the same behaviour as a
  first-time visitor.
