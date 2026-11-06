// machine.js — night shift at the useless machine.
//
//   Twelve switches. The machine turns them off; you turn them back on.
//   Sixty seconds. The score is the only thing that survives the shift.
//
// The board is one small state machine:
//
//   ready ──start──▶ running ──time up──▶ closed ──start──▶ running
//
// While running, one machine timer schedules the next hand, and one clock
// interval paints the remaining time. Both are cleared on stop. The player
// only changes the twelve switch buttons; the machine only changes them back.

'use strict';

const units = Array.from(document.querySelectorAll('.unit'));
const board = document.getElementById('board');
const comboFlash = document.getElementById('combo-flash');
const panel = document.getElementById('panel');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayCopy = document.getElementById('overlay-copy');
const overlayBest = document.getElementById('overlay-best');
const overlayRules = document.getElementById('overlay-rules');
const startBtn = document.getElementById('start');
const statusEl = document.getElementById('status');
const shiftState = document.getElementById('shift-state');

const timeEl = document.getElementById('time');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const bestEl = document.getElementById('best');
const timerFill = document.getElementById('timer-fill');

const recordBest = document.getElementById('record-best');
const recordShifts = document.getElementById('record-shifts');
const recordCombo = document.getElementById('record-combo');
const scoreList = document.getElementById('score-list');

// -- The record ------------------------------------------------------------

const BEST_KEY = 'shift.best';
const SHIFTS_KEY = 'shift.count';
const COMBO_KEY = 'shift.combo';
const TOP_KEY = 'shift.top';

function readNumber(key) {
  try {
    const stored = Number(window.localStorage.getItem(key));
    return Number.isFinite(stored) && stored > 0 ? Math.floor(stored) : 0;
  } catch (error) {
    return 0;
  }
}

function saveNumber(key, value) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch (error) {
    // Private mode: the record lives for this visit only.
  }
}

function readTop() {
  try {
    const stored = JSON.parse(window.localStorage.getItem(TOP_KEY));
    if (!Array.isArray(stored)) {
      return [];
    }
    return stored
      .map(Number)
      .filter((value) => Number.isFinite(value))
      .sort((a, b) => b - a)
      .slice(0, 3);
  } catch (error) {
    return [];
  }
}

function saveTop() {
  try {
    window.localStorage.setItem(TOP_KEY, JSON.stringify(scores));
  } catch (error) {
    // Private mode.
  }
}

let best = readNumber(BEST_KEY);
let shifts = readNumber(SHIFTS_KEY);
let bestCombo = readNumber(COMBO_KEY);
let scores = readTop();

// -- The shift -------------------------------------------------------------

const SHIFT_MS = 60000;          // one minute of night shift
const COMBO_WINDOW = 2500;       // time to keep a combo alive
const POINTS_PER_ON = 10;        // base points for switching one lamp back on
const PERFECT_BONUS = 100;

let running = false;
let startedAt = 0;
let remaining = SHIFT_MS;
let score = 0;
let combo = 0;
let lastHitAt = 0;
let perfectPending = true;

let machineTimer = null;         // the next hand
let clockTimer = null;           // the remaining-time interval
const targeting = new Set();     // switch indexes with a hand out

const states = new Array(units.length).fill(true);

// The twelve switches start on, and the overlay sits over them.

for (const [index, unit] of units.entries()) {
  unit.addEventListener('click', () => pressUnit(index));
}

// -- Painting --------------------------------------------------------------

function renderUnit(index) {
  units[index].classList.toggle('is-on', states[index]);
  units[index].setAttribute('aria-checked', String(states[index]));
}

function renderBoard() {
  for (let index = 0; index < units.length; index += 1) {
    renderUnit(index);
  }
}

function allOn() {
  return states.every(Boolean);
}

function updateHud() {
  scoreEl.textContent = score;
  comboEl.textContent = `×${combo > 1 ? combo : 1}`;
  bestEl.textContent = Math.max(best, score);
}

/** Restart a short CSS pulse on a HUD number. */
function bump(element) {
  element.classList.remove('is-bumped');
  void element.offsetWidth;
  element.classList.add('is-bumped');
}

function updateRecord() {
  recordBest.textContent = best;
  recordShifts.textContent = shifts;
  recordCombo.textContent = `×${bestCombo > 1 ? bestCombo : 1}`;
  overlayBest.textContent = best;

  scoreList.replaceChildren();

  if (scores.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'score-empty';
    empty.textContent = 'No finished shifts yet.';
    scoreList.append(empty);
    return;
  }

  scores.forEach((value, index) => {
    const item = document.createElement('li');
    const rank = document.createElement('span');
    rank.className = 'score-rank';
    rank.textContent = `0${index + 1}`;
    const points = document.createElement('span');
    points.className = 'score-value';
    points.textContent = value;
    item.append(rank, points);
    scoreList.append(item);
  });
}

/**
 * A "+N" floats out of the switch. The higher the combo, the bigger the
 * number and the brass combo pill beside it.
 */
function pop(unit, text, comboValue) {
  const bubble = unit.querySelector('.unit-pop');
  bubble.textContent = text;
  bubble.dataset.combo = comboValue > 1 ? `×${comboValue}` : '';
  bubble.classList.toggle('has-combo', comboValue > 1);
  bubble.style.setProperty(
    '--combo-scale',
    String(Math.min(1.7, 1 + comboValue * 0.08))
  );
  bubble.classList.remove('is-popping');
  void bubble.offsetWidth;         // restart the animation
  bubble.classList.add('is-popping');
}

/** A board-sized stamp: "x5" on a combo milestone, "PERFECT" on a full board. */
function flashCombo(text) {
  comboFlash.textContent = text;
  comboFlash.classList.remove('is-showing');
  void comboFlash.offsetWidth;
  comboFlash.classList.add('is-showing');
}

// -- The clock -------------------------------------------------------------

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function tickClock() {
  if (!running) {
    return;
  }

  remaining = Math.max(0, SHIFT_MS - (performance.now() - startedAt));
  timeEl.textContent = formatTime(remaining);
  timerFill.style.width = `${(remaining / SHIFT_MS) * 100}%`;
  panel.classList.toggle('is-final', remaining <= 10000);

  if (remaining === 0) {
    endShift();
  }
}

// -- The machine -----------------------------------------------------------

function progress() {
  return Math.min(1, (performance.now() - startedAt) / SHIFT_MS);
}

function scheduleMachine(delay) {
  window.clearTimeout(machineTimer);
  machineTimer = window.setTimeout(machineStep, delay);
}

function machineStep() {
  machineTimer = null;

  if (!running) {
    return;
  }

  const available = [];
  for (let index = 0; index < states.length; index += 1) {
    if (states[index] && !targeting.has(index)) {
      available.push(index);
    }
  }

  if (available.length === 0) {
    scheduleMachine(260);
    return;
  }

  const p = progress();
  const count = p > 0.5 && available.length > 1 && Math.random() < 0.45 ? 2 : 1;
  const chosen = [];

  for (let n = 0; n < count && available.length > 0; n += 1) {
    const pick = Math.floor(Math.random() * available.length);
    chosen.push(available.splice(pick, 1)[0]);
  }

  for (const index of chosen) {
    targeting.add(index);
    units[index].classList.add('is-targeted');
  }

  const telegraph = Math.round(300 - 150 * p);

  machineTimer = window.setTimeout(() => {
    if (!running) {
      return;
    }

    for (const index of chosen) {
      targeting.delete(index);
      units[index].classList.remove('is-targeted');
      units[index].classList.add('is-flipping');

      states[index] = false;
      renderUnit(index);
      perfectPending = true;         // the next all-on board can pay again

      window.setTimeout(() => {
        units[index].classList.remove('is-flipping');
      }, 120);
    }

    const delay = Math.round(950 - 600 * p + Math.random() * 160);
    scheduleMachine(delay);
  }, telegraph);
}

// -- The player ------------------------------------------------------------

function pressUnit(index) {
  if (!running || states[index]) {
    return;
  }

  states[index] = true;
  renderUnit(index);

  const unit = units[index];
  unit.classList.remove('is-hit');
  void unit.offsetWidth;             // restart the press animation
  unit.classList.add('is-hit');

  const now = Date.now();
  combo = now - lastHitAt < COMBO_WINDOW ? combo + 1 : 1;
  lastHitAt = now;
  bestCombo = Math.max(bestCombo, combo);

  const points = POINTS_PER_ON * combo;
  const perfect = allOn() && perfectPending;

  score += points;

  if (perfect) {
    perfectPending = false;
    score += PERFECT_BONUS;
    board.classList.add('is-perfect');
    window.setTimeout(() => board.classList.remove('is-perfect'), 520);
    statusEl.textContent = `Perfect panel. +${PERFECT_BONUS}.`;
  } else if (combo >= 3 && combo % 3 === 0) {
    flashCombo(`×${combo}`);
  }

  // The perfect bonus rides on the same floating number instead of a
  // board-wide stamp that would cover the switches.
  pop(
    units[index],
    `+${points + (perfect ? PERFECT_BONUS : 0)}`,
    combo
  );

  updateHud();
  bump(scoreEl);

  if (combo > 1) {
    bump(comboEl);
  }
}

// -- Start and end ---------------------------------------------------------

function rank(value) {
  if (value >= 1500) return "The machine's equal";
  if (value >= 900) return 'Night manager';
  if (value >= 450) return 'Operator';
  if (value >= 150) return 'Trainee';
  return 'Visitor';
}

function startShift() {
  if (running) {
    return;
  }

  window.clearTimeout(machineTimer);
  window.clearInterval(clockTimer);
  machineTimer = null;
  clockTimer = null;
  targeting.clear();

  score = 0;
  combo = 0;
  lastHitAt = 0;
  perfectPending = true;
  states.fill(true);
  renderBoard();

  running = true;
  startedAt = performance.now();
  remaining = SHIFT_MS;
  panel.classList.remove('is-final');
  board.classList.remove('is-perfect');

  overlay.hidden = true;
  shiftState.textContent = 'Live';
  statusEl.textContent = 'Shift started. Keep the switches on.';
  updateHud();
  tickClock();

  clockTimer = window.setInterval(tickClock, 100);
  scheduleMachine(750);

  board.focus({ preventScroll: true });
}

function endShift() {
  if (!running) {
    return;
  }

  running = false;
  window.clearTimeout(machineTimer);
  window.clearInterval(clockTimer);
  machineTimer = null;
  clockTimer = null;

  for (const index of targeting) {
    units[index].classList.remove('is-targeted');
    units[index].classList.remove('is-flipping');
  }
  targeting.clear();

  remaining = 0;
  timeEl.textContent = '0:00';
  timerFill.style.width = '0%';
  panel.classList.remove('is-final');

  shifts += 1;
  saveNumber(SHIFTS_KEY, shifts);

  if (score > best) {
    best = score;
    saveNumber(BEST_KEY, best);
  }

  if (bestCombo > 0) {
    saveNumber(COMBO_KEY, bestCombo);
  }

  scores = [...scores, score].sort((a, b) => b - a).slice(0, 3);
  saveTop();

  updateHud();
  updateRecord();

  overlayRules.hidden = true;
  overlayTitle.textContent = 'Shift over.';
  overlayCopy.textContent =
    `${rank(score)} — ${score} points. The machine turned the board off again; you kept the score.`;
  startBtn.textContent = 'One more shift';
  overlay.hidden = false;
  shiftState.textContent = 'Closed';

  statusEl.textContent =
    `Shift over. ${score} points. The machine always gets the board.`;

  startBtn.focus();
}

// -- First paint -----------------------------------------------------------

startBtn.addEventListener('click', startShift);

renderBoard();
updateHud();
updateRecord();
startBtn.focus({ preventScroll: true });
