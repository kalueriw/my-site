// nav.js — injects nav.html and footer.html into every page.
//
// The point of this file is that the navigation exists in exactly ONE place:
// nav.html. Add a fifth page there and all five pages show it. Nothing in
// here knows what the links are.
//
// It uses fetch, which only works over http(s). Opened straight from disk
// (file://) the browser blocks the request and fetch throws — that is the
// browser protecting you, not a bug in this code. Use Live Server.

'use strict';

// -- Theme ------------------------------------------------------------------
//
// The palette in style.css has a light half and a dark half, chosen by
// color-scheme. This file only has to set the attribute and remember the
// choice. It does NOT know any colours.
//
// The stored value is deliberately not "which colours are on" but "which
// choice the visitor made", and it is allowed to be absent. Absent means
// "follow the operating system", which is what most people expect and what
// costs them nothing.
const THEME_KEY = 'theme';

function storedTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch (error) {
    // Private mode, or storage disabled. Not worth failing over: the page
    // simply follows the OS for the rest of the visit.
    return null;
  }
}

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/** The theme in force right now, whatever decided it. */
function activeTheme() {
  return document.documentElement.dataset.theme ||
    (systemPrefersDark() ? 'dark' : 'light');
}

function applyTheme(theme) {
  // "auto" is not a third theme — it means "no attribute", so the media query
  // in style.css takes over again.
  if (theme === 'auto') {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = theme;
  }
}

function paintSwitch(button) {
  const dark = activeTheme() === 'dark';
  button.setAttribute('aria-pressed', String(dark));
  // The label names where the button takes you, not where you are: a button
  // that says "Dark" while you are already in dark mode is a dead end.
  button.querySelector('.theme-toggle-text').textContent = dark ? 'Light' : 'Dark';
  button.hidden = false;
}

function startTheme() {
  const button = document.getElementById('theme-toggle');
  if (!button) {
    return;
  }

  paintSwitch(button);

  button.addEventListener('click', () => {
    const next = activeTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch (error) {
      // Choosing within the visit still works; it just will not be remembered.
    }
    paintSwitch(button);
  });

  // If the visitor has expressed no preference, follow the system when it
  // changes mid-visit — someone's laptop switching to dark at sunset should
  // take the page with it.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (!storedTheme()) {
      paintSwitch(button);
    }
  });
}


/**
 * Fetch an HTML fragment and put it inside the element with the given id.
 * Resolves to the fragment's element, or null if the fetch failed.
 */
async function inject(file, targetId) {
  const host = document.getElementById(targetId);
  if (!host) {
    return null;
  }

  try {
    const response = await fetch(file, { cache: 'no-cache' });

    // fetch() only rejects on a network error, not on a 404, so check.
    if (!response.ok) {
      throw new Error(`${file} returned ${response.status}`);
    }

    host.innerHTML = await response.text();
    return host;
  } catch (error) {
    return null;
  }
}

/**
 * The file name of the page we are on, e.g. "quotes.html".
 * "/" and "" both mean the homepage, so both become "index.html" — otherwise
 * the Home link would never light up when the site is served from a root URL.
 */
function currentPage() {
  const name = window.location.pathname.split('/').pop();
  return name === '' || name === undefined ? 'index.html' : name;
}

/**
 * Mark the nav link that points at this page, so a visitor knows where they
 * are — visually, and with aria-current for anyone using a screen reader.
 */
function markCurrentPage(scope) {
  const page = currentPage();

  // Scoped to .nav-links: the Contact pill points at about.html#contact, and
  // on the About page that would match too. aria-current belongs on the page
  // you are on, not on a link to a section of it.
  for (const link of scope.querySelectorAll('.nav-links a')) {
    // link.pathname is absolute and already stripped of ?query and #hash.
    // Comparing only the last segment is what makes "/" and "/index.html"
    // agree, and it works whether the site is served from a root URL or a
    // subdirectory like /my-site/.
    if (link.pathname.split('/').pop() === page) {
      link.setAttribute('aria-current', 'page');
      break;
    }
  }
}

/**
 * The fetch failed. Almost always file://, where CORS blocks it. Say so in
 * words a person can act on, instead of leaving an empty strip where the
 * navigation should be. It deliberately does NOT contain a list of links:
 * copying them here would put the navigation in two files, which is exactly
 * what this whole exercise is trying to avoid.
 */
function explainFailure(host) {
  const notice = document.createElement('p');
  notice.className = 'nav-fallback wrap wrap--wide';
  notice.textContent =
    'Navigation needs a local server. Open this page with Live Server ' +
    '(or run "python -m http.server") instead of double-clicking the file.';
  host.append(notice);
}

async function start() {
  const header = await inject('nav.html', 'site-header');
  const footer = await inject('footer.html', 'site-footer');

  if (header) {
    markCurrentPage(header);
    startTheme();
  } else {
    const host = document.getElementById('site-header');
    if (host) {
      explainFailure(host);
    }
  }

  // The footer failing is cosmetic — one line of small print — so it is left
  // silent rather than lighting the page up with a second warning.
  void footer;
}

// nav.js is loaded at the end of <body>, so the placeholders already exist.
start();
