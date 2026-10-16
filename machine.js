// machine.js — the useless light switch on machine.html.
// One rule: the light wants to stay on. Turn it off and a hand comes out of
// the dark to turn it back on — after a while, and a different while every
// time. Every fifth press, though, the light fights back first.


// -- 1 · The elements the script talks to ------------------------------------

// The switch — a real <input type="checkbox">. Checked means the light is on.
const lever = document.getElementById('light');

// The wall plate. The hand is parked inside its clipping box, out of sight.
const unit = document.getElementById('unit');

// The sentence under the switch. It carries role="status" in the HTML, so a
// screen reader announces every change, and everyone gets the same story.
const readout = document.getElementById('status');

// The span holding the tally under that sentence. It sits outside the
// role="status" paragraph, so this number is never read out on every press.
const counter = document.getElementById('counter');


// -- 2 · The numbers ---------------------------------------------------------

// How long the light flickers before it gives up, in milliseconds.
// (CSS reads the same number through the --flicker property.)
const FLICKER_TIME = 1000;

// How long the light stays off — measured from the press to the moment the
// switch comes back on, the hand's travel included. A fresh random number
// every press, between these two, in milliseconds: 0.3 s up to 1 s.
const MIN_WAIT = 300;
const MAX_WAIT = 1000;

// After a flicker the light stays off for this fixed, longer time instead —
// again measured up to the moment it comes back on.
const DARK_AFTER_FLICKER = 3000;

// The hand: how long it takes to slide in, and how long it rests on the
// switch before sliding back out. CSS matches the first with its own
// transition on the hand's `left`. It must stay below MIN_WAIT: the slide-in
// happens inside the wait above, so a longer reach than MIN_WAIT would leave
// no time for it and the hand would arrive after the switch had flipped.
const HAND_REACH = 280;
const HAND_HOLD = 350;

// Every fifth press is a special one.
const SPECIAL_EVERY = 5;

// Hand the flicker length to CSS, so the animation lasts exactly as long as
// the pause this script waits before the room goes dark.
document.documentElement.style.setProperty('--flicker', FLICKER_TIME + 'ms');


// -- 3 · The machine's memory ------------------------------------------------

// How many times the visitor has turned the light off since the page loaded.
let presses = 0;

// The timer of the next thing the machine plans to do.
// null means nothing is planned.
let pending = null;


// -- 4 · Two small helpers ---------------------------------------------------

// Replace the text of the status line.
function say(sentence) {
  readout.textContent = sentence;
}

// Do one step of the show after `ms` milliseconds, and remember its timer, so
// that a visitor who reaches the switch first can cancel whatever is planned.
// Every step the machine performs is scheduled through here.
function after(ms, step) {
  pending = window.setTimeout(step, ms);
}


// -- 5 · How long to wait ----------------------------------------------------

// A random number of milliseconds from MIN_WAIT up to MAX_WAIT.
function randomWait() {
  // Math.random() gives 0 up to (but never) 1.
  // Multiply by the width of the range, then slide the result up by MIN_WAIT.
  // Math.round() turns it into a whole number of milliseconds.
  return Math.round(MIN_WAIT + Math.random() * (MAX_WAIT - MIN_WAIT));
}


// -- 6 · The one thing the machine does --------------------------------------

// Go dark — and then have the switch back on `wait` milliseconds after the
// press, no matter how long the hand takes to get there.
// Leave `wait` out and it is a fresh random number: `= randomWait()` is a
// default value, worked out again on every call that does not pass one in.
function goDark(wait = randomWait()) {
  document.body.classList.add('is-dark');
  say('Off. The room is dark…');

  // Step 1 — the hand slides in, and the last HAND_REACH milliseconds of the
  // wait belong to that slide: it arrives exactly as `wait` runs out, so the
  // light comes back on the moment the number promised.
  after(wait - HAND_REACH, function () {
    unit.classList.add('is-hand');
    say('A hand comes out of the dark…');

    // Step 2 — it has arrived: the switch is pushed over, and the room lights
    // up. The lever turning is CSS (it follows the checkbox); this line only
    // sets the checkbox.
    after(HAND_REACH, function () {
      lever.checked = true;
      document.body.classList.remove('is-dark');
      say('Click — the switch turned itself back on. Bright again.');

      // Step 3 — the hand lets go and slides back out of sight.
      after(HAND_HOLD, function () {
        unit.classList.remove('is-hand');
        pending = null;
      });
    });
  });
}


// -- 7 · The switch ----------------------------------------------------------

// "change" fires when the visitor flips the switch — mouse, finger or
// space bar. The browser has already updated lever.checked by now.
lever.addEventListener('change', function () {

  // The light just came ON: the visitor beat the machine to it.
  if (lever.checked) {
    // Cancel whatever the machine had planned and stand down. Sending the
    // hand home is part of that: it may be halfway in.
    clearTimeout(pending);
    pending = null;
    document.body.classList.remove('is-dark');
    document.body.classList.remove('is-flickering');
    unit.classList.remove('is-hand');
    say('Bright again. The switch wants it that way.');
    return;
  }

  // The light just went OFF. Count the press.
  presses = presses + 1;

  // Show the new tally. Assigning a number to textContent turns it into a
  // string on the way in, so no String() call is needed.
  counter.textContent = presses;

  // Every fifth press the light refuses to go quietly. `%` is the remainder:
  // presses % 5 is 0 exactly at 5, 10, 15 — the multiples of five.
  if (presses % SPECIAL_EVERY === 0) {
    document.body.classList.add('is-flickering');
    say('Off… but something is wrong with the light.');

    // A second of flicker (all of it CSS), then dark — but this time for a
    // long, fixed three seconds rather than the short random wait. The hand
    // comes at the end of it either way.
    after(FLICKER_TIME, function () {
      document.body.classList.remove('is-flickering');
      goDark(DARK_AFTER_FLICKER);
    });
    return;
  }

  // Any other press: straight to the dark.
  goDark();
});
