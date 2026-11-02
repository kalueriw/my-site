// quotes.js — the "quote of the moment" band on quotes.html.
//
// The twenty quotes live in the HTML, in .quote-grid. This file does not
// contain a single line of quote text: it copies one of those cards into the
// band at the top. That keeps the page as the one place the words are
// written, which is the same idea as nav.html holding the only copy of the nav.

'use strict';

const spotlight = document.getElementById('spotlight');
const reroll = document.getElementById('reroll');

// querySelectorAll returns a NodeList; turn it into a plain array so the
// "which one did I show last time" bookkeeping below is easy to read.
const cards = Array.from(document.querySelectorAll('.quote-grid .quote'));

// The card currently in the band, so "another one" never repeats itself.
let shown = null;

/**
 * Put a copy of `card` into the band, in front of the button.
 * cloneNode(true) copies the elements and their text but not their event
 * listeners or ids — which is exactly what we want: the copy is inert.
 */
function show(card) {
  // Remove the previous copy if there is one.
  const previous = spotlight.querySelector('.quote');
  if (previous) {
    previous.remove();
  }

  spotlight.prepend(card.cloneNode(true));
  shown = card;
}

/** Pick a card at random, never the one already on screen. */
function roll() {
  if (cards.length === 0) {
    return;
  }

  // With one card there is nothing to avoid repeating.
  if (cards.length === 1) {
    show(cards[0]);
    return;
  }

  let index = Math.floor(Math.random() * cards.length);
  while (cards[index] === shown) {
    index = Math.floor(Math.random() * cards.length);
  }

  show(cards[index]);
}

// One on load, and a fresh one on every press of the button.
roll();
reroll.addEventListener('click', roll);
