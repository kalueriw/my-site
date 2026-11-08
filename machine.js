// machine.js — the refund machine.
//
//   Twelve coins. You feed them; the machine returns them. Sixty seconds.
//   The score is the only thing that survives the run.
//
// The board is one small state machine:
//
//   ready ──start──▶ running ──time up──▶ closed ──start──▶ running
//
// While running, one machine timer schedules the next return, and one clock
// interval paints the remaining time. Both are cleared on stop. The player
// only feeds coins; the machine only puts them back.

'use strict';

const coins = Array.from(document.querySelectorAll('.coin'));
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
const panelState = document.getElementById('panel-state');

const timeEl = document.getElementById('time');
const scoreEl = document.getElementById('score');
const comboEl = document.getElementById('combo');
const bestEl = document.getElementById('best');
const timerFill = document.getElementById('timer-fill');

const recordBest = document.getElementById('record-best');
const recordRuns = document.getElementById('record-runs');
const recordCombo = document.getElementById('record-combo');
const scoreList = document.getElementById('score-list');

// -- The record ------------------------------------------------------------

const BEST_KEY = 'refund.best';
const RUNS_KEY = 'refund.runs';
const COMBO_KEY = 'refund.combo';
const TOP_KEY = 'refund.top';

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
let runs = readNumber(RUNS_KEY);
let bestCombo = readNumber(COMBO_KEY);
let scores = readTop();

// -- The run ---------------------------------------------------------------

const RUN_MS = 60000;            // one minute at the machine
const COMBO_WINDOW = 2500;       // time to keep a combo alive
const POINTS_PER_COIN = 10;      // base points for feeding one coin
const FULL_REFUND_BONUS = 100;

let running = false;
let startedAt = 0;
let remaining = RUN_MS;
let score = 0;
let combo = 0;
let lastHitAt = 0;
let fullRefundPending = true;

let machineTimer = null;         // the next return arm
let clockTimer = null;           // the remaining-time interval
const targeting = new Set();     // coin indexes with an arm out

// true = the coin is in the tray; false = it is inside the machine.
const inTray = new Array(coins.length).fill(true);

for (const [index, coin] of coins.entries()) {
  coin.addEventListener('click', () => feedCoin(index));
}

// -- Painting --------------------------------------------------------------

function renderCoin(index) {
  const coin = coins[index];
  const number = index + 1;
  coin.classList.toggle('is-in-tray', inTray[index]);
  coin.setAttribute(
    'aria-label',
    inTray[index]
      ? `Coin ${number}, in the tray. Feed it to the machine.`
      : `Coin ${number}, inside the machine. Waiting for a refund.`
  );
}

function renderBoard() {
  for (let index = 0; index < coins.length; index += 1) {
    renderCoin(index);
  }
}

function allFed() {
  return inTray.every((value) => !value);
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
  recordRuns.textContent = runs;
  recordCombo.textContent = `×${bestCombo > 1 ? bestCombo : 1}`;
  overlayBest.textContent = best;

  scoreList.replaceChildren();

  if (scores.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'score-empty';
    empty.textContent = 'No finished runs yet.';
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
 * A "+N" floats out of the coin. The higher the combo, the bigger the number
 * and the brass combo pill beside it.
 */
function pop(coin, text, comboValue) {
  const bubble = coin.querySelector('.coin-pop');
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

/** A board-sized stamp: "x5" on a combo milestone, "FULL REFUND" on twelve. */
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

  remaining = Math.max(0, RUN_MS - (performance.now() - startedAt));
  timeEl.textContent = formatTime(remaining);
  timerFill.style.width = `${(remaining / RUN_MS) * 100}%`;
  panel.classList.toggle('is-final', remaining <= 10000);

  if (remaining === 0) {
    endRun();
  }
}

// -- The machine -----------------------------------------------------------

function progress() {
  return Math.min(1, (performance.now() - startedAt) / RUN_MS);
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
  for (let index = 0; index < inTray.length; index += 1) {
    if (!inTray[index] && !targeting.has(index)) {
      available.push(index);
    }
  }

  if (available.length === 0) {
    scheduleMachine(260);
    return;
  }

  const p = progress();
  const count = p > 0.35 && available.length > 1 && Math.random() < 0.45 ? 2 : 1;
  const chosen = [];

  for (let n = 0; n < count && available.length > 0; n += 1) {
    const pick = Math.floor(Math.random() * available.length);
    chosen.push(available.splice(pick, 1)[0]);
  }

  for (const index of chosen) {
    targeting.add(index);
    coins[index].classList.add('is-targeted');
  }

  const telegraph = Math.round(240 - 110 * p);

  machineTimer = window.setTimeout(() => {
    if (!running) {
      return;
    }

    for (const index of chosen) {
      targeting.delete(index);
      coins[index].classList.remove('is-targeted');
      coins[index].classList.add('is-returning');

      inTray[index] = true;
      renderCoin(index);
      fullRefundPending = true;    // the next full board can pay again

      window.setTimeout(() => {
        coins[index].classList.remove('is-returning');
      }, 420);
    }

    const delay = Math.round(680 - 400 * p + Math.random() * 140);
    scheduleMachine(delay);
  }, telegraph);
}

// -- The player ------------------------------------------------------------

function feedCoin(index) {
  if (!running || !inTray[index]) {
    return;
  }

  inTray[index] = false;
  renderCoin(index);

  const coin = coins[index];
  coin.classList.remove('is-fed-now');
  void coin.offsetWidth;             // restart the drop animation
  coin.classList.add('is-fed-now');
  window.setTimeout(() => coin.classList.remove('is-fed-now'), 300);

  const now = Date.now();
  combo = now - lastHitAt < COMBO_WINDOW ? combo + 1 : 1;
  lastHitAt = now;
  bestCombo = Math.max(bestCombo, combo);

  const points = POINTS_PER_COIN * combo;
  const full = allFed() && fullRefundPending;

  score += points;

  if (full) {
    fullRefundPending = false;
    score += FULL_REFUND_BONUS;
    board.classList.add('is-full');
    window.setTimeout(() => board.classList.remove('is-full'), 550);
    statusEl.textContent = `Full refund. +${FULL_REFUND_BONUS}.`;
    flashCombo('FULL REFUND');
  } else if (combo >= 3 && combo % 3 === 0) {
    flashCombo(`×${combo}`);
  }

  // The full-refund bonus rides on the same floating number instead of a
  // board-wide stamp that would cover the coins.
  pop(
    coins[index],
    `+${points + (full ? FULL_REFUND_BONUS : 0)}`,
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
  if (value >= 900) return 'Regular customer';
  if (value >= 450) return 'Window shopper';
  if (value >= 150) return 'First-timer';
  return 'Bystander';
}

function startRun() {
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
  fullRefundPending = true;
  inTray.fill(true);
  renderBoard();

  running = true;
  startedAt = performance.now();
  remaining = RUN_MS;
  panel.classList.remove('is-final');
  board.classList.remove('is-full');

  overlay.hidden = true;
  panelState.textContent = 'Open';
  statusEl.textContent = 'The machine is open. Feed it a coin.';
  updateHud();
  tickClock();

  clockTimer = window.setInterval(tickClock, 100);
  scheduleMachine(500);

  board.focus({ preventScroll: true });
}

function endRun() {
  if (!running) {
    return;
  }

  running = false;
  window.clearTimeout(machineTimer);
  window.clearInterval(clockTimer);
  machineTimer = null;
  clockTimer = null;

  for (const index of targeting) {
    coins[index].classList.remove('is-targeted');
    coins[index].classList.remove('is-returning');
  }
  targeting.clear();

  // It keeps nothing: every coin ends the run back in the tray.
  inTray.fill(true);
  renderBoard();

  remaining = 0;
  timeEl.textContent = '0:00';
  timerFill.style.width = '0%';
  panel.classList.remove('is-final');

  runs += 1;
  saveNumber(RUNS_KEY, runs);

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
  overlayTitle.textContent = 'Machine closed.';
  overlayCopy.textContent =
    `${rank(score)} — ${score} points. Nothing was sold, and every coin came back.`;
  startBtn.textContent = 'One more refund';
  overlay.hidden = false;
  panelState.textContent = 'Closed';

  statusEl.textContent =
    `Run over. ${score} points. Every coin came back.`;

  startBtn.focus();
}

// -- First paint -----------------------------------------------------------

startBtn.addEventListener('click', startRun);

renderBoard();
updateHud();
updateRecord();
startBtn.focus({ preventScroll: true });
