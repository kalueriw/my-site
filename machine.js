// machine.js — two machines on machine.html.
//
//   Part A: the eraser. You make a mark; an arm wipes it off.
//   Part B: the game. You try to keep a mark alive while the arm hunts it.
//
// Both are written the same way, and that is the point of the file: each is a
// small STATE MACHINE. One variable says which state we are in, one function
// moves between states, one timer is ever alive, and the page is painted from
// the state rather than edited by hand. That last rule is what makes a double
// click harmless: there is never a half-finished page to clean up.

'use strict';

/* =========================================================================
   PART A — THE ERASER
   =========================================================================

   Four states, and each one is a picture of what you can see:

       blank        card empty      arm parked off the right
         │
         │  you press the button
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

     1. Presses are only accepted in `blank` and `marked`. Once the arm has
        set off, the machine is busy and a press is refused, not queued.
     2. Every timer goes through enter(), which cancels the previous one
        first. There is never more than one alive, so no stale callback can
        fire into a later state.
   ========================================================================= */

const stage = document.getElementById('stage');
const makeBtn = document.getElementById('make');
const readout = document.getElementById('status');
const madeEl = document.getElementById('made');
const oncardEl = document.getElementById('oncard');

// -- Timings, in milliseconds ----------------------------------------------

const WAIT_MIN = 800;      // how long the machine lets the ink sit, at least
const WAIT_MAX = 1400;     // …and at most
const ERASE_MS = 900;      // the arm's whole pass across the card
const RETRACT_MS = 600;    // and its return

// Hand the two durations to CSS, so the transitions and these waits cannot
// describe different amounts of time.
document.documentElement.style.setProperty('--erase', ERASE_MS + 'ms');
document.documentElement.style.setProperty('--retract', RETRACT_MS + 'ms');

// -- State -----------------------------------------------------------------

let state = 'blank';
let timer = null;          // the only live timeout, or null
let made = 0;

/**
 * Paint the page from `state`. This is the ONLY place the stage's classes
 * are set, which is why none of them can be left behind.
 */
function render() {
  stage.classList.toggle('is-marked', state === 'marked');
  stage.classList.toggle('is-erasing', state === 'erasing');
  stage.classList.toggle('is-retracting', state === 'retracting');

  // "On the card" is a fact about the state, not a separate counter that
  // could drift out of step with it.
  oncardEl.textContent = state === 'marked' || state === 'erasing' ? '1' : '0';
}

/**
 * Move to `next`, cancelling whatever was planned. `ms` schedules the next
 * move; leave it out and the machine rests in `next` until a press arrives.
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

/** The one timer callback. It only ever moves the machine one step forward. */
function tick() {
  timer = null;

  if (state === 'marked') {
    enter('erasing', ERASE_MS);
    readout.textContent = 'The arm arrives, and the mark begins to go.';
  } else if (state === 'erasing') {
    enter('retracting', RETRACT_MS);
    readout.textContent = 'Wiped clean. The arm withdraws.';
  } else if (state === 'retracting') {
    enter('blank');
    readout.textContent = 'Blank again, exactly as you found it. Make another.';
  }
}

/** A random pause between WAIT_MIN and WAIT_MAX, in whole milliseconds. */
function randomWait() {
  return Math.round(WAIT_MIN + Math.random() * (WAIT_MAX - WAIT_MIN));
}

// -- The one control -------------------------------------------------------

makeBtn.addEventListener('click', () => {
  // The arm is working. Refuse the press rather than queuing it — a queue is
  // how a machine ends up doing two things at once.
  if (state === 'erasing' || state === 'retracting') {
    readout.textContent = 'The arm is already at work. Let it finish.';
    return;
  }

  made += 1;
  madeEl.textContent = made;

  // Pressing while the ink is still there does not add a second mark — it
  // restarts the wait, which is exactly the machine being patient with you.
  if (state === 'marked') {
    enter('marked', randomWait());
    readout.textContent = 'Another mark, on top of the first. It will not help.';
    return;
  }

  enter('marked', randomWait());
  readout.textContent = 'A mark. The arm is on its way.';
});

// Open in the state the markup already shows.
enter('blank');

/* =========================================================================
   PART B — KEEP IT
   =========================================================================

       idle ──start──▶ running ──arm reaches the mark──▶ wiped
         ▲               │                                │
         │               │ survives eight visits         │
         │               ▼                                │
         │             kept                               │
         └─────── after a beat, back to idle ─────────────┘

   Each visit has two halves: the arm moves to a lane, then a moment later it
   strikes. The pause is what makes the game fair — it is your reaction time.
   A press is only read while `running`, and Start only works from `idle`, so
   pressing everything forty times cannot stack rounds or start two timers.
   ========================================================================= */

const gameBox = document.getElementById('game-box');
const gameMark = document.getElementById('game-mark');
const gameEraser = document.getElementById('game-eraser');
const gameStatus = document.getElementById('game-status');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const startBtn = document.getElementById('start');
const moveBtn = document.getElementById('move');
const resetBtn = document.getElementById('reset');

const LANES = 3;
const NAMES = ['left', 'centre', 'right'];

const FIRST_VISIT_MS = 600;   // grace before the arm starts hunting
const STRIKE_MS = 380;        // time to react once the arm has arrived
const GAP_MS = 240;           // pause between visits
const VISITS_TO_KEEP = 8;     // survive this many and the round is won
const NEXT_ROUND_MS = 1100;   // how long the result stays on screen

let gameState = 'idle';       // idle | running | kept | wiped
let gameTimer = null;
let markLane = 1;             // where the player's mark is
let armLane = -1;             // where the arm is; -1 is off the board
let visits = 0;
let score = 0;
let best = 0;

/** Paint the board from the state. Same rule as render() above. */
function paint(next) {
  gameState = next;
  gameBox.classList.toggle('is-running', next === 'running');
  gameBox.classList.toggle('is-kept', next === 'kept');
  gameBox.classList.toggle('is-wiped', next === 'wiped');
}

/** Put a piece in a lane. The CSS does the positioning from this one number. */
function placeMark(lane) {
  markLane = lane;
  gameMark.style.setProperty('--lane', lane);
}

function placeArm(lane) {
  armLane = lane;
  gameEraser.style.setProperty('--lane', lane);
}

/** The one way a round ends, or the pause between one round and the next. */
function stop() {
  window.clearTimeout(gameTimer);
  gameTimer = null;
}

/** Show a result, then clear the board so it can be played again. */
function settle(result, message) {
  stop();
  paint(result);
  gameStatus.textContent = message;

  gameTimer = window.setTimeout(() => {
    paint('idle');
    gameTimer = null;
    gameStatus.textContent = 'Ready. Press Start, then keep your mark moving.';
  }, NEXT_ROUND_MS);
}

/** Half one of a visit: send the arm to a lane and give the player a moment. */
function visit() {
  gameTimer = null;

  const lane = Math.floor(Math.random() * LANES);
  placeArm(lane);
  gameStatus.textContent = `The arm moves to the ${NAMES[lane]} lane.`;

  gameTimer = window.setTimeout(strike, STRIKE_MS);
}

/** Half two: the arm comes down, and then it is too late to move. */
function strike() {
  gameTimer = null;

  if (armLane === markLane) {
    settle('wiped', `It came down on the ${NAMES[armLane]} lane, where your mark was.`);
    return;
  }

  visits += 1;

  if (visits >= VISITS_TO_KEEP) {
    score += 1;
    best = Math.max(best, score);
    scoreEl.textContent = score;
    bestEl.textContent = best;
    settle('kept', 'It left without your mark. Point to you.');
    return;
  }

  gameTimer = window.setTimeout(visit, GAP_MS);
}

function startRound() {
  // Start only means something from a resting board. Pressing it mid-round
  // is ignored, not queued — a queued round is how a game ends up running
  // two timers at once.
  if (gameState !== 'idle') {
    return;
  }

  stop();
  visits = 0;
  placeMark(1);
  placeArm(-1);
  paint('running');
  gameStatus.textContent = 'Round started. The arm is coming.';

  gameTimer = window.setTimeout(visit, FIRST_VISIT_MS);
}

startBtn.addEventListener('click', startRound);

moveBtn.addEventListener('click', () => {
  if (gameState !== 'running') {
    return;
  }

  placeMark((markLane + 1) % LANES);
  gameStatus.textContent = `Your mark moves to the ${NAMES[markLane]} lane.`;
});

resetBtn.addEventListener('click', () => {
  stop();
  score = 0;
  best = 0;
  visits = 0;
  placeMark(1);
  placeArm(-1);
  paint('idle');
  scoreEl.textContent = '0';
  bestEl.textContent = '0';
  gameStatus.textContent = 'Back to the start. Ready when you are.';
});

// Open on a resting board.
paint('idle');
