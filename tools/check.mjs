// tools/check.mjs — the requirement-8 checklist, as a command.
//
// Run from the project root:   node tools/check.mjs
// Exits 1 if anything is wrong, so it can be used as a gate.
//
// It is not loaded by any page. It only reads the files.

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// The five real pages. nav.html and footer.html are fragments and are never
// checked as documents — they have no doctype or <head> by design.
const PAGES = [
  'index.html',
  'quotes.html',
  'project.html',
  'machine.html',
  'about.html',
];

const problems = [];
const notes = [];

function fail(where, message) {
  problems.push(`${where}: ${message}`);
}

/** Every file under ROOT, as a set of exact-case relative paths. */
function listFiles(dir, prefix = '') {
  const out = new Set();
  for (const entry of readdirSync(dir)) {
    if (entry === '.git' || entry === 'node_modules' || entry === 'tools') {
      continue;
    }
    const full = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    out.add(rel);
    if (statSync(full).isDirectory()) {
      for (const child of listFiles(full, rel)) {
        out.add(child);
      }
    }
  }
  return out;
}

const files = listFiles(ROOT);

/**
 * Windows will happily open "Hero.jpg" when the file is "hero.jpg"; a Linux
 * server will not. So resolve the exact string, never the case-insensitive
 * filesystem.
 */
function resolveExact(reference, fromFile) {
  const base = dirname(join(ROOT, fromFile));
  const target = resolve(base, reference);
  const rel = target.slice(ROOT.length + 1).split(sep).join('/');
  return files.has(rel) ? rel : null;
}

for (const page of PAGES) {
  if (!files.has(page)) {
    fail(page, 'page is listed but missing');
    continue;
  }

  const html = readFileSync(join(ROOT, page), 'utf8');
  const where = page;

  // -- structure ----------------------------------------------------------
  if (!html.startsWith('<!DOCTYPE html>')) {
    fail(where, 'does not start with <!DOCTYPE html>');
  }
  if (!/<html lang="[a-z-]+">/i.test(html)) {
    fail(where, '<html> has no lang attribute');
  }
  if (!/<meta name="viewport" content="width=device-width, initial-scale=1.0">/.test(html)) {
    fail(where, 'missing the viewport meta tag');
  }
  if (!/<header id="site-header"><\/header>/.test(html)) {
    fail(where, 'missing the empty <header id="site-header"> placeholder');
  }
  if (!/<footer id="site-footer"><\/footer>/.test(html)) {
    fail(where, 'missing the empty <footer id="site-footer"> placeholder');
  }
  if (!/<script src="nav\.js"><\/script>/.test(html)) {
    fail(where, 'does not load nav.js');
  }

  // -- DRY: no navigation may be duplicated into a page -------------------
  if (/<nav[\s>]/.test(html)) {
    fail(where, 'contains a <nav>; navigation belongs only in nav.html');
  }

  // -- placeholders -------------------------------------------------------
  for (const [word, re] of [
    ['lorem ipsum', /lorem ipsum/i],
    ['TODO', /\bTODO\b/],
    ['href="#"', /href="#"/],
  ]) {
    if (re.test(html)) {
      fail(where, `contains ${word}`);
    }
  }

  // -- links and sources --------------------------------------------------
  const refs = [...html.matchAll(/\b(?:href|src)="([^"]*)"/g)].map(m => m[1]);

  for (const ref of refs) {
    if (ref === '' || ref.startsWith('http://') || ref.startsWith('https://')) {
      continue;
    }
    if (ref.startsWith('mailto:') || ref.startsWith('tel:')) {
      continue;
    }

    const [path, hash] = ref.split('#');

    // A bare "#" is a placeholder and is caught above; "#contact" is fine.
    if (path === '') {
      if (hash && !html.includes(`id="${hash}"`)) {
        fail(where, `anchor "#${hash}" has no matching id on this page`);
      }
      continue;
    }

    const found = resolveExact(path, page);
    if (!found) {
      fail(where, `broken reference "${ref}" (not found, or wrong case)`);
      continue;
    }

    // A link to another page with an anchor: that page must have the id.
    if (hash && found !== page && PAGES.includes(found)) {
      const other = readFileSync(join(ROOT, found), 'utf8');
      if (!other.includes(`id="${hash}"`)) {
        fail(where, `"${ref}" points at #${hash}, which ${found} does not have`);
      }
    }
  }

  // -- images -------------------------------------------------------------
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\balt="/.test(tag)) {
      fail(where, `<img> without an alt attribute: ${tag.slice(0, 70)}`);
    }
    if (!/\bwidth="/.test(tag) || !/\bheight="/.test(tag)) {
      fail(where, `<img> without width and height: ${tag.slice(0, 70)}`);
    }
  }

  // -- quotes: text, author and source, all three -------------------------
  if (page === 'quotes.html') {
    const cards = [...html.matchAll(/<article class="quote">([\s\S]*?)<\/article>/g)];

    if (cards.length < 15) {
      fail(where, `only ${cards.length} quote cards; the pass mark is 15`);
    }
    notes.push(`quotes.html has ${cards.length} quote cards`);

    cards.forEach((card, i) => {
      const body = card[1];
      const n = i + 1;

      if (!/<blockquote>[\s\S]*?<p\b[^>]*>\s*\S/.test(body)) {
        fail(where, `quote ${n} has no text in <blockquote>`);
      }
      if (!/<cite>\s*\S/.test(body)) {
        fail(where, `quote ${n} has no <cite> author`);
      }
      if (!/<span class="source">\s*\S/.test(body)) {
        fail(where, `quote ${n} has no <span class="source">`);
      }

      // Every non-English original must carry a lang and be followed by a
      // translation.
      const foreign = [...body.matchAll(/<p lang="((?!en)[^"]+)"[^>]*>([\s\S]*?)<\/p>/g)];
      for (const [, lang] of foreign) {
        if (!/<p class="translation" lang="en">/.test(body)) {
          fail(where, `quote ${n} has a ${lang} original but no English translation`);
        }
      }
    });
  }
}

// -- project page ----------------------------------------------------------
if (files.has('project.html')) {
  const html = readFileSync(join(ROOT, 'project.html'), 'utf8');

  (() => {
    const ul = html.match(/<ul class="idea-list">([\s\S]*?)<\/ul>/);
    if (!ul) {
      fail('project.html', 'no <ul class="idea-list">');
      return;
    }
    const ideas = (ul[1].match(/<span class="idea-name">/g) || []).length;
    if (ideas < 5) {
      fail('project.html', `only ${ideas} ideas; at least 5 are required`);
    }
    notes.push(`project.html has ${ideas} ideas`);
  })();

  (() => {
    const dl = html.match(/<dl class="audience">([\s\S]*?)<\/dl>/);
    if (!dl) {
      fail('project.html', 'no <dl class="audience">');
      return;
    }
    const dts = (dl[1].match(/<dt>/g) || []).length;
    const dds = (dl[1].match(/<dd>/g) || []).length;
    if (dts === 0 || dts !== dds) {
      fail('project.html', `<dl> has ${dts} <dt> and ${dds} <dd>; they must pair up`);
    }
  })();

  if (!/<ol class="steps">/.test(html)) {
    fail('project.html', 'no ordered list of steps');
  }
}

// -- report ----------------------------------------------------------------
for (const note of notes) {
  console.log(`  ok  ${note}`);
}

if (problems.length === 0) {
  console.log(`\nAll ${PAGES.length} pages pass.`);
  process.exit(0);
}

console.log('');
for (const problem of problems) {
  console.log(`  FAIL  ${problem}`);
}
console.log(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}.`);
process.exit(1);
