// machine.js — the eraser.
//
//   You write a word; the arm wipes it off. The ledger keeps the record.
//
// It is written as a small STATE MACHINE. One variable says which state we
// are in, one function moves between states, one timer is ever alive, and the
// page is painted from the state rather than edited by hand. That last rule
// is what makes a double click harmless: there is never a half-finished page
// to clean up.

'use strict';

/* =========================================================================
   PART A — THE ERASER
   =========================================================================

   Four states, and each one is a picture of what you can see:

       blank        card empty      arm parked off the right
         │
         │  you submit the form
         ▼
       marked       ink showing     arm parked          ── after a wait ──┐
         │                                                              │
         │  the arm sets off                                            │
         ▼                                                              │
       erasing      ink wiping      arm crossing the card               │
         │                                                              │
         │  the ink is gone                                             │
         ▼                                                              │
       retracting   card empty      arm sliding back out                 │
         │                                                              │
         └──────────────────────────────────────────────────────────────┘
                                 back to blank

   Two rules make the machine impossible to break:

     1. Submissions are only accepted in `blank` and `marked`. Once the arm
        has set off, the machine is busy and a press is refused, not queued.
     2. Every timer goes through enter(), which cancels the previous one
        first. There is never more than one alive, so no stale callback can
        fire into a later state.
   ========================================================================= */

const stage = document.getElementById('stage');
const paper = document.getElementById('paper');
const markBox = document.getElementById('mark');
const markWord = document.getElementById('mark-word');
const markForm = document.getElementById('mark-form');
const markInput = document.getElementById('mark-text');
const readout = document.getElementById('status');
const erasedEl = document.getElementById('erased');
const oncardEl = document.getElementById('oncard');
const ledgerList = document.getElementById('ledger-list');
const ledgerEmpty = document.getElementById('ledger-empty');
const milestones = Array.from(document.querySelectorAll('.milestone'));

// -- Timings, in milliseconds ----------------------------------------------

const WAIT_MIN = 800;      // how long the machine lets the ink sit, at least
const WAIT_MAX = 1400;     // …and at most
const ERASE_MS = 900;      // the arm's whole pass across the card
const RETRACT_MS = 600;    // and its return

// Hand the two durations to CSS, so the transitions and these waits cannot
// describe different amounts of time.
document.documentElement.style.setProperty('--erase', ERASE_MS + 'ms');
document.documentElement.style.setProperty('--retract', RETRACT_MS + 'ms');

// -- The all-time count ----------------------------------------------------
// The number survives a reload, which is the small reason to come back: the
// machine remembers that you were here even though the card never does.

const ERASED_KEY = 'eraser.marks';
const WORDS_KEY = 'eraser.words';
const MAX_WORD = 24;
const MAX_LEDGER = 8;

function readErased() {
  try {
    const stored = Number(window.localStorage.getItem(ERASED_KEY));
    return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  } catch (error) {
    return 0;                    // storage can be blocked; the count still works
  }
}

function saveErased(n) {
  try {
    window.localStorage.setItem(ERASED_KEY, String(n));
  } catch (error) {
    // Private mode: the count is correct for this visit and gone next time.
  }
}

function readWords() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(WORDS_KEY));
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored
      .filter((word) => typeof word === 'string')
      .slice(0, MAX_LEDGER);
  } catch (error) {
    return [];
  }
}

function saveWords() {
  try {
    window.localStorage.setItem(WORDS_KEY, JSON.stringify(words));
  } catch (error) {
    // Private mode: the ledger lives for this visit only.
  }
}

// -- State -----------------------------------------------------------------

let state = 'blank';
let timer = null;          // the only live timeout, or null
let erased = readErased();
let words = readWords();
let lastWord = '';         // what the arm is taking back this cycle

erasedEl.textContent = erased;

/** The ledger: newest first, with the most recent marked "just now". */
function renderLedger() {
  ledgerList.replaceChildren(...words.map((word, index) => {
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'ledger-word';
    label.textContent = word;

    const tag = document.createElement('span');
    tag.className = 'ledger-tag';
    tag.textContent = index === 0 ? 'just now' : 'taken';

    item.append(label, tag);
    return item;
  }));

  ledgerEmpty.hidden = words.length > 0;
}

/** The record is the reward: each milestone stays lit once it is reached. */
function renderMilestones() {
  for (const milestone of milestones) {
    milestone.classList.toggle(
      'is-earned',
      erased >= Number(milestone.dataset.at)
    );
  }
}

renderLedger();
renderMilestones();

/**
 * Paint the page from `state`. This is the ONLY place the stage's classes
 * are set, which is why none of them can be left behind.
 */
function render() {
  stage.classList.toggle('is-marked', state === 'marked');
  stage.classList.toggle('is-erasing', state === 'erasing');
  stage.classList.toggle('is-retracting', state === 'retracting');
  stage.classList.toggle(
    'is-writing',
    state === 'blank' && markInput.value.trim() !== ''
  );

  // "On the card" follows what is visible: a mark being erased, or the word
  // waiting in the field as a preview.
  const onCard = state === 'marked' || state === 'erasing'
    || (state === 'blank' && markInput.value.trim() !== '');
  oncardEl.textContent = onCard ? '1' : '0';
}

/**
 * Move to `next`, cancelling whatever was planned. `ms` schedules the next
 * move; leave it out and the machine rests in `next` until a submission.
 */
function enter(next, ms) {
  window.clearTimeout(timer);
  timer = null;

  state = next;
  render();

  if (ms !== undefined) {
    timer = window.setTimeout(tick, ms);
  }
}

const AFTER_ERASE = [
  'Blank again, exactly as you found it. Make another.',
  'Gone. The machine looks pleased with itself.',
  'Un-made, carefully, and without haste.',
  'The card is clean. You are not the first to try.',
  'It does not remember the mark. It remembers the motion.'
];

/**
 * The machine gets a little more familiar with every mark. These lines are
 * the reward for staying past the first press.
 */
function completionLine(n) {
  if (n === 1) {
    return 'Blank again, exactly as you found it. Make another.';
  }
  if (n === 5) {
    return 'Five. It is getting good at this. You are getting predictable.';
  }
  if (n === 10) {
    return 'Ten marks, every one erased. The machine is warmed up.';
  }
  if (n === 25) {
    return 'Twenty-five. The arm could do this all day.';
  }
  if (n === 50) {
    return 'Fifty. Nobody is counting. Except the machine.';
  }
  if (n === 100) {
    return 'One hundred marks. Neither of you can stop now.';
  }
  return AFTER_ERASE[n % AFTER_ERASE.length];
}

/** The one timer callback. It only ever moves the machine one step forward. */
function tick() {
  timer = null;

  if (state === 'marked') {
    erased += 1;
    erasedEl.textContent = erased;
    saveErased(erased);
    renderMilestones();

    // The card loses the mark; the ledger gains it.
    words.unshift(lastWord || 'a squiggle');
    words = words.slice(0, MAX_LEDGER);
    saveWords();
    renderLedger();

    enter('erasing', ERASE_MS);
    readout.textContent = 'The arm arrives, and the mark begins to go.';
  } else if (state === 'erasing') {
    enter('retracting', RETRACT_MS);
    readout.textContent = 'Wiped clean. The arm withdraws.';
  } else if (state === 'retracting') {
    enter('blank');

    // Clear the field only if it still holds the word just erased. If the
    // visitor started typing the next one mid-erase, put that word on the
    // card instead.
    if (readWord() === lastWord) {
      markInput.value = '';
      showWord('');
    } else {
      showWord(readWord());
    }

    render();
    readout.textContent = completionLine(erased);
  }
}

/** A random pause between WAIT_MIN and WAIT_MAX, in whole milliseconds. */
function randomWait() {
  return Math.round(WAIT_MIN + Math.random() * (WAIT_MAX - WAIT_MIN));
}

/**
 * Put the typed word on the card, or put the default squiggle back if the
 * field is empty. textContent, never innerHTML: the word is the visitor's.
 */
function readWord() {
  return markInput.value.trim().slice(0, MAX_WORD);
}

function showWord(word) {
  if (word === '') {
    markWord.textContent = '';
    markBox.classList.remove('has-word');
    return;
  }

  markWord.textContent = word;
  markBox.classList.add('has-word');
}

// A few words get a reply. They are small rewards for trying things.
const REACTIONS = {
  stop: 'It has heard that before.',
  hello: 'It does not say hello back.',
  again: 'That word keeps coming back.',
  erase: 'That is the job.',
  remember: 'It will not.',
  why: 'It does not explain itself.'
};

// Live preview: the word appears on the card as it is typed. While the arm
// is working, the field holds the next word without disturbing the mark
// being erased.
markInput.addEventListener('input', () => {
  if (state === 'blank') {
    const word = readWord();
    showWord(word);
    render();
    readout.textContent = word === ''
      ? 'Blank. Write a word, then make a mark.'
      : `“${word}” is on the card. Press the button when you are ready.`;
  }
});

// The paper is the obvious place to click if you want to write on it.
paper.addEventListener('click', () => markInput.focus());

// -- The one control -------------------------------------------------------

markForm.addEventListener('submit', (event) => {
  event.preventDefault();

  // The arm is working. Refuse the press rather than queuing it — a queue is
  // how a machine ends up doing two things at once.
  if (state === 'erasing' || state === 'retracting') {
    readout.textContent = 'The arm is already at work. Let it finish.';
    return;
  }

  const word = readWord();
  showWord(word);
  lastWord = word;

  const reaction = REACTIONS[word.toLowerCase()];

  // Submitting while the ink is still there does not add a second mark — it
  // restarts the wait, which is exactly the machine being patient with you.
  if (state === 'marked') {
    enter('marked', randomWait());
    readout.textContent = reaction || (word === ''
      ? 'Another mark, on top of the first. It will not help.'
      : `“${word}” replaces the first mark. It will not help.`);
    return;
  }

  enter('marked', randomWait());
  readout.textContent = reaction || (word === ''
    ? 'A mark. The arm is on its way.'
    : `“${word}” — the arm will take it back.`);
});

// Open in the state the markup already shows. A returning visitor gets a
// line that notices them; a first visitor gets the instructions.
if (erased > 0) {
  readout.textContent = 'The card is blank, as always. Write something.';
}
enter('blank');

