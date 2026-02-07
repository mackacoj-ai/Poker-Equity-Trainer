// ====== Core state ======
const STAGES = ["preflop", "flop", "turn", "river"];
let deck = [];
let holeCards = [];
let boardCards = [];
let currentStageIndex = 0;
let pot = 0;
let toCall = 0;
let scenario = null;
let timerSeconds = 10;
let timerId = null;
let timeLeft = null;
let difficulty = "beginner";
let handHistory = [];
let sessionHistory = [];

// ====== DOM ======
const holeCardsEl = document.getElementById("holeCards");
const boardCardsEl = document.getElementById("boardCards");
const potSizeEl = document.getElementById("potSize");
const toCallEl = document.getElementById("toCall");
const stageLabelEl = document.getElementById("stageLabel");
const scenarioLabelEl = document.getElementById("scenarioLabel");
const timerCountdownEl = document.getElementById("timerCountdown");
const difficultySelect = document.getElementById("difficulty");
const timerRange = document.getElementById("timerRange");
const timerValueEl = document.getElementById("timerValue");
const newHandBtn = document.getElementById("newHandBtn");
const inputForm = document.getElementById("inputForm");
const hintsEl = document.getElementById("hints");
const feedbackEl = document.getElementById("feedback");
const summaryPanel = document.getElementById("summaryPanel");
const summaryContent = document.getElementById("summaryContent");
const downloadCsvBtn = document.getElementById("downloadCsvBtn");
const closeSummaryBtn = document.getElementById("closeSummaryBtn");
const sessionStatsEl = document.getElementById("sessionStats");
const submitStageBtn = document.getElementById("submitStageBtn");
const nextStageBtn = document.getElementById("nextStageBtn");
const resetStatsBtn = document.getElementById("resetStatsBtn");

// ====== New DOM for mobile UX ======
const kpiStageEl = document.getElementById("kpiStage");
const kpiPotEl   = document.getElementById("kpiPot");
const kpiCallEl  = document.getElementById("kpiToCall");
const kpiTimerEl = document.getElementById("kpiTimer");
const bottomBar  = document.getElementById("bottomBar");
const barPotOdds = document.getElementById("barPotOdds");
const barSubmit  = document.getElementById("barSubmitBtn");
const barNext    = document.getElementById("barNextBtn");
const hintDetails = document.getElementById("hintDetails");
const hintsDetailBody = document.getElementById("hintsDetailBody");

// ====== Utility: deck & cards ======
const SUITS = ["\u2660", "\u2665", "\u2666", "\u2663"];
const RANKS = ["2", "3", "4", "5", "6", "7", "8", "9", "T", "J", "Q", "K", "A"];
const RANK_TO_VAL = { '2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'T':10,'J':11,'Q':12,'K':13,'A':14 };

function createDeck() {
  const d = [];
  for (let s = 0; s < SUITS.length; s++) {
    for (let r = 0; r < RANKS.length; r++) {
      d.push({ rank: RANKS[r], suit: SUITS[s] });
    }
  }
  return d;
}
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
function dealCard() { return deck.pop(); }

// ====== Betting normalization (5-quid chunks) ======
function toStep5(value) { return Math.round((Number(value) ?? 0) / 5) * 5; }
function clampNonNegative(v) { return Math.max(0, Number.isFinite(v) ? v : 0); }
function computeRoundedBetAndPot(potBefore, factor) {
  const rawBet = clampNonNegative(potBefore * factor);
  let bet = toStep5(rawBet);
  if (bet === 0 && rawBet > 0) bet = 5;
  const newPot = toStep5(potBefore + bet);
  return { bet, newPot };
}

// ====== Rendering ======
function renderCards() {
  holeCardsEl.innerHTML = "";
  boardCardsEl.innerHTML = "";
  holeCards.forEach(card => { holeCardsEl.appendChild(createCardEl(card)); });
  boardCards.forEach(card => { boardCardsEl.appendChild(createCardEl(card)); });
}
function createCardEl(card) {
  const div = document.createElement("div");
  div.className = "card";
  if (card.suit === "\u2665" || card.suit === "\u2666") div.classList.add("red");
  const rankTop = document.createElement("div"); rankTop.className = "rank"; rankTop.textContent = card.rank;
  const suitMid = document.createElement("div"); suitMid.className = "suit"; suitMid.textContent = card.suit;
  const rankBottom = document.createElement("div"); rankBottom.className = "rank"; rankBottom.textContent = card.rank;
  div.append(rankTop, suitMid, rankBottom);
  return div;
}
function updatePotInfo() {
  pot = toStep5(pot);
  toCall = toStep5(toCall);
  const stageName = STAGES[currentStageIndex].toUpperCase();

  // Desktop labels
  if (potSizeEl) potSizeEl.textContent = pot.toFixed(0);
  if (toCallEl) toCallEl.textContent = toCall.toFixed(0);
  if (stageLabelEl) stageLabelEl.textContent = stageName;
  if (scenarioLabelEl) scenarioLabelEl.textContent = scenario ? scenario.label : "—";

  // Sticky KPI bar
  kpiStageEl.textContent = `Stage: ${stageName}`;
  kpiPotEl.textContent   = `Pot: £${pot.toFixed(0)}`;
  kpiCallEl.textContent  = `To Call: £${toCall.toFixed(0)}`;
  const tl = (timeLeft==null) ? "—" : `${Math.max(0,timeLeft)}s`;
  kpiTimerEl.textContent = `Time: ${tl}`;

  // Bottom quick pot-odds snippet
  const pOdds = computePotOdds(pot, toCall);
  barPotOdds.textContent = isFinite(pOdds) ? `Pot odds ${pOdds.toFixed(1)}%` : 'Pot odds —';
}

// ====== Timer ======
function startTimer() {
  clearTimer();
  timeLeft = timerSeconds;
  if (timerCountdownEl) timerCountdownEl.textContent = `${timeLeft}s`;
  kpiTimerEl.textContent = `Time: ${Math.max(0,timeLeft)}s`;
  timerId = setInterval(() => {
    timeLeft -= 1;
    if (timeLeft <= 0) {
      if (timerCountdownEl) timerCountdownEl.textContent = "0s";
      clearInterval(timerId);
      timerId = null;
    } else {
      if (timerCountdownEl) timerCountdownEl.textContent = `${timeLeft}s`;
    }
    kpiTimerEl.textContent = `Time: ${Math.max(0,timeLeft)}s`;
  }, 1000);
}
function clearTimer() {
  if (timerId) { clearInterval(timerId); timerId = null; }
  if (timerCountdownEl) timerCountdownEl.textContent = "—";
  kpiTimerEl.textContent = "Time: —";
}
function maybeStartTimer() {
  if (difficulty === "beginner") {
    clearTimer();
    if (timerCountdownEl) timerCountdownEl.textContent = "No timer in Beginner Mode";
  } else {
    startTimer();
  }
}

// ====== Board texture & tags (BOARD-ONLY connectedness) ======
function analyzeBoard(board, hole) {
  function longestBoardRunRanks(boardCards) {
    const idxs = [...new Set(boardCards.map(c => RANKS.indexOf(c.rank)))].sort((a,b)=>a-b);
    if (idxs.length === 0) return 0;
    let run = 1, best = 1;
    for (let i=1;i<idxs.length;i++){
      if (idxs[i] === idxs[i-1]) continue;
      if (idxs[i] === idxs[i-1] + 1) { run++; best = Math.max(best, run); }
      else { run = 1; }
    }
    return best;
  }

  const boardRanksCount = {};
  const boardSuitsCount = {};
  board.forEach(c => {
    boardRanksCount[c.rank] = (boardRanksCount[c.rank] ?? 0) + 1;
    boardSuitsCount[c.suit] = (boardSuitsCount[c.suit] ?? 0) + 1;
  });

  const paired = Object.values(boardRanksCount).some(v => v >= 2);

  const suitCounts = Object.values(boardSuitsCount);
  const maxSuitOnBoard = suitCounts.length ? Math.max(...suitCounts) : 0;
  const suitKinds = Object.keys(boardSuitsCount).length;
  const mono = maxSuitOnBoard >= 3;
  const twoTone = (board.length >= 3 && suitKinds === 2 && !mono);
  const rainbow = (board.length >= 3 && suitKinds >= 3 && !mono);

  const boardRun = longestBoardRunRanks(board);
  const isFlop = board.length === 3;
  const isTurn = board.length === 4;
  const isRiver = board.length === 5;

  let connected = false;
  let semiConnected = false;
  let fourToStraight = false;
  let straightOnBoard = false;

  if (isFlop) {
    connected = (boardRun >= 3);
    if (!connected) {
      const vals = [...new Set(board.map(c => RANKS.indexOf(c.rank)))].sort((a,b)=>a-b);
      if (vals.length === 3) {
        const gaps = [vals[1]-vals[0], vals[2]-vals[1]];
        semiConnected = (gaps.includes(2) && gaps.includes(1));
      }
    }
  } else {
    const rv = new Set(board.map(c => RANK_TO_VAL[c.rank]));
    if (rv.has(14)) rv.add(1);
    const ordered = [...rv].sort((a,b)=>a-b);
    let run=1, maxRun=1;
    for (let i=1;i<ordered.length;i++){
      if (ordered[i] === ordered[i-1]) continue;
      if (ordered[i] === ordered[i-1]+1) { run++; maxRun = Math.max(maxRun, run); }
      else { run = 1; }
    }
    straightOnBoard = (isRiver && maxRun >= 5);
    run=1; maxRun=1;
    for (let i=1;i<ordered.length;i++){
      if (ordered[i] === ordered[i-1]+1) { run++; maxRun = Math.max(maxRun, run); }
      else if (ordered[i] !== ordered[i-1]) { run = 1; }
    }
    fourToStraight = (maxRun >= 4);
    connected = (!isRiver && (fourToStraight || boardRun >= 3));
  }

  const all = [...board, ...hole];
  const heroSuitCounts = {};
  all.forEach(c => { heroSuitCounts[c.suit] = (heroSuitCounts[c.suit] ?? 0) + 1; });
  const heroFlushDraw = Object.values(heroSuitCounts).some(v => v === 4);

  const tags
