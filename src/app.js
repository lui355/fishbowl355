const ROUND_NAMES = ['Taboo', 'Charades', 'One Word'];
const ROUND_HELP = [
  'Describe the word without saying the exact word or obvious variants.',
  'Act it out silently. No speaking, mouthing, or sound effects.',
  'Say exactly one word as the clue. Your team can make unlimited guesses.',
];
const STARTER_WORDS = ['octopus', 'time machine', 'karaoke', 'volcano', 'grandma', 'moonwalk', 'detective', 'pickleball'];
const STORAGE_KEY = 'fishbowl355-state';
let timerId;
let timeLeft = 60;
let state = loadState();

function id() { return crypto.randomUUID(); }
function shuffle(list) { return [...list].sort(() => Math.random() - 0.5); }
function word(text) { return { id: id(), text, guessed: false }; }
function getSessionId() { return new URLSearchParams(window.location.search).get('session'); }
function createSessionId() { return getSessionId() || id(); }
function joinUrl() {
  const url = new URL(window.location.origin);
  url.searchParams.set('session', state.sessionId);
  return url.toString();
}
function defaultState() {
  return {
    teams: [{ id: id(), name: 'Team Coral', score: 0 }, { id: id(), name: 'Team Kelp', score: 0 }],
    words: STARTER_WORDS.map(word),
    round: 0,
    currentTeam: 0,
    turnSeconds: 60,
    currentWordId: null,
    phase: 'setup',
    sessionId: createSessionId(),
  };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.teams?.length >= 2 && saved?.words?.length) {
      return { ...saved, sessionId: getSessionId() || saved.sessionId || id() };
    }
  } catch (error) {
    console.warn('Ignoring malformed saved game.', error);
  }
  return defaultState();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setState(patch) { state = { ...state, ...patch }; save(); render(); }
function remainingWords() { return state.words.filter((item) => !item.guessed); }
function currentWord() { return state.words.find((item) => item.id === state.currentWordId) || remainingWords()[0]; }
function isComplete() { return state.phase === 'complete' || state.round >= ROUND_NAMES.length; }
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}

function render() {
  clearInterval(timerId);
  renderScoreboard();
  if (isComplete()) renderComplete();
  else if (state.phase === 'setup') renderSetup();
  else if (state.phase === 'between') renderBetween();
  else renderPlay();
}
function renderScoreboard() {
  document.querySelector('#scoreboard').innerHTML = state.teams.map((team, index) => `
    <article class="team-card ${index === state.currentTeam ? 'active' : ''}">
      <span>${index === state.currentTeam ? 'Up now' : 'Team'}</span>
      <strong>${escapeHtml(team.name)}</strong>
      <b>${team.score}</b>
    </article>`).join('');
}
function renderSetup() {
  const url = joinUrl();
  document.querySelector('#game-view').innerHTML = `
    <section class="setup-grid">
      <article class="card join-card"><h2>📱 Join this bowl</h2><p>Share this link with players so they can join this session from their phones.</p><input id="join-url" class="join-url" value="${escapeHtml(url)}" readonly /><div id="join-qr" class="join-qr" aria-label="QR code for ${escapeHtml(url)}"></div><button id="copy-link" type="button">Copy link</button></article>
      <article class="card"><h2>👥 Teams</h2><form id="team-form" class="inline-form"><input id="team-input" placeholder="Add team name" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.teams.map((team) => `<button class="chip" data-remove-team="${team.id}">${escapeHtml(team.name)} ${state.teams.length > 2 ? '×' : ''}</button>`).join('')}</div></article>
      <article class="card"><h2>🐠 Bowl words</h2><form id="word-form" class="inline-form"><input id="word-input" placeholder="Add a person, place, or thing" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.words.map((item) => `<button class="chip" data-remove-word="${item.id}">${escapeHtml(item.text)} ×</button>`).join('')}</div></article>
      <article class="card rules"><h2>⏱ Rules</h2><ol>${ROUND_NAMES.map((round, index) => `<li><strong>${round}:</strong> ${ROUND_HELP[index]}</li>`).join('')}</ol><label>Turn length <input id="turn-seconds" type="number" min="15" max="180" value="${state.turnSeconds}" /> seconds</label><button id="start-game" ${state.words.length < 3 ? 'disabled' : ''}>Start game</button></article>
    </section>`;
  renderQrCode(url);
  document.querySelector('#copy-link').addEventListener('click', copyJoinLink);
  document.querySelector('#team-form').addEventListener('submit', addTeam);
  document.querySelector('#word-form').addEventListener('submit', addWord);
  document.querySelector('#turn-seconds').addEventListener('change', (event) => setState({ turnSeconds: Number(event.target.value) }));
  document.querySelector('#start-game').addEventListener('click', startGame);
  document.querySelectorAll('[data-remove-team]').forEach((button) => button.addEventListener('click', () => removeTeam(button.dataset.removeTeam)));
  document.querySelectorAll('[data-remove-word]').forEach((button) => button.addEventListener('click', () => removeWord(button.dataset.removeWord)));
}
function renderQrCode(url) {
  const container = document.querySelector('#join-qr');
  if (!container) return;
  container.innerHTML = '';
  if (window.QRCode) {
    new window.QRCode(container, { text: url, width: 180, height: 180, correctLevel: window.QRCode.CorrectLevel.M });
  } else {
    container.textContent = 'QR code unavailable. Copy the link instead.';
  }
}
async function copyJoinLink() {
  const input = document.querySelector('#join-url');
  input.select();
  input.setSelectionRange(0, input.value.length);
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(input.value);
  } else {
    document.execCommand('copy');
  }
  document.querySelector('#copy-link').textContent = 'Copied!';
}
function renderBetween() {
  document.querySelector('#game-view').innerHTML = `<section class="card centered"><p class="eyebrow">🔀 Next turn</p><h2>${escapeHtml(state.teams[state.currentTeam].name)}, you are up.</h2><p>Round ${state.round + 1}: ${ROUND_NAMES[state.round]}. ${ROUND_HELP[state.round]}</p><button id="start-turn">Start ${state.turnSeconds}s turn</button></section>`;
  document.querySelector('#start-turn').addEventListener('click', startTurn);
}
function renderComplete() {
  const highScore = Math.max(...state.teams.map((team) => team.score));
  const winners = state.teams.filter((team) => team.score === highScore).map((team) => escapeHtml(team.name)).join(' & ');
  document.querySelector('#game-view').innerHTML = `<section class="card centered"><div class="trophy">🏆</div><h2>Game over!</h2><p>${winners} won with ${highScore} points.</p><button id="play-again">Play again</button></section>`;
  document.querySelector('#play-again').addEventListener('click', resetGame);
}
function renderPlay() {
  const word = currentWord();
  document.querySelector('#game-view').innerHTML = `<section class="card play-card"><div class="round-header"><div><p class="eyebrow">Round ${state.round + 1}</p><h2>${ROUND_NAMES[state.round]}</h2><p>${ROUND_HELP[state.round]}</p></div><div class="timer" id="timer">${timeLeft}s</div></div><div class="word-card">${escapeHtml(word.text)}</div><p>${remainingWords().length} words left in this round · ${escapeHtml(state.teams[state.currentTeam].name)} guessing</p><div class="actions"><button class="success" id="guessed">✓ Got it</button><button class="ghost" id="pass">Pass</button><button class="danger-btn" id="end-turn">End turn</button></div></section>`;
  document.querySelector('#guessed').addEventListener('click', guessed);
  document.querySelector('#pass').addEventListener('click', pass);
  document.querySelector('#end-turn').addEventListener('click', endTurn);
  timerId = setInterval(tick, 1000);
}

function addTeam(event) {
  event.preventDefault();
  const input = document.querySelector('#team-input');
  const name = input.value.trim();
  if (name) setState({ teams: [...state.teams, { id: id(), name, score: 0 }] });
}
function addWord(event) {
  event.preventDefault();
  const input = document.querySelector('#word-input');
  const text = input.value.trim();
  if (text) setState({ words: [...state.words, word(text)] });
}
function removeTeam(teamId) { if (state.teams.length > 2) setState({ teams: state.teams.filter((team) => team.id !== teamId), currentTeam: 0 }); }
function removeWord(wordId) { setState({ words: state.words.filter((item) => item.id !== wordId) }); }
function startGame() {
  const words = shuffle(state.words).map((item) => ({ ...item, guessed: false }));
  timeLeft = state.turnSeconds;
  setState({ phase: 'playing', words, round: 0, currentTeam: 0, currentWordId: words[0].id });
}
function startTurn() { timeLeft = state.turnSeconds; setState({ phase: 'playing', currentWordId: remainingWords()[0]?.id }); }
function endTurn() { timeLeft = state.turnSeconds; setState({ phase: 'between', currentTeam: (state.currentTeam + 1) % state.teams.length }); }
function tick() {
  timeLeft -= 1;
  const timer = document.querySelector('#timer');
  if (timer) {
    timer.textContent = `${timeLeft}s`;
    timer.classList.toggle('danger', timeLeft <= 10);
  }
  if (timeLeft <= 0) endTurn();
}
function guessed() {
  const activeWord = currentWord();
  const words = state.words.map((item) => item.id === activeWord.id ? { ...item, guessed: true } : item);
  const teams = state.teams.map((team, index) => index === state.currentTeam ? { ...team, score: team.score + 1 } : team);
  const nextWords = words.filter((item) => !item.guessed);
  if (nextWords.length === 0) {
    const nextRound = state.round + 1;
    timeLeft = state.turnSeconds;
    setState({ teams, round: nextRound, words: shuffle(words).map((item) => ({ ...item, guessed: false })), phase: nextRound >= ROUND_NAMES.length ? 'complete' : 'between', currentTeam: (state.currentTeam + 1) % state.teams.length, currentWordId: null });
  } else {
    setState({ teams, words, currentWordId: nextWords[0].id });
  }
}
function pass() {
  const words = remainingWords();
  if (words.length < 2) return;
  const index = words.findIndex((item) => item.id === currentWord().id);
  setState({ currentWordId: words[(index + 1) % words.length].id });
}
function resetGame() { localStorage.removeItem(STORAGE_KEY); state = defaultState(); timeLeft = state.turnSeconds; render(); }

document.querySelector('#reset-button').addEventListener('click', resetGame);
render();
