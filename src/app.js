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
function word(text, status = 'pending') { return { id: id(), text, status, guessed: false }; }
function defaultState() {
  return {
    teams: [{ id: id(), name: 'Team Coral', score: 0 }, { id: id(), name: 'Team Kelp', score: 0 }],
    words: STARTER_WORDS.map((text) => word(text, 'approved')),
    round: 0,
    currentTeam: 0,
    turnSeconds: 60,
    currentWordId: null,
    phase: 'setup',
    showPending: true,
  };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.teams?.length >= 2 && saved?.words?.length) return migrateState(saved);
  } catch (error) {
    console.warn('Ignoring malformed saved game.', error);
  }
  return defaultState();
}
function migrateState(saved) {
  return {
    ...saved,
    showPending: saved.showPending ?? true,
    words: saved.words.map((item) => ({ ...item, status: item.status || 'approved', guessed: Boolean(item.guessed) })),
  };
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setState(patch) { state = { ...state, ...patch }; save(); render(); }
function approvedWords() { return state.words.filter((item) => item.status === 'approved'); }
function playableWords() { return state.words.filter((item) => item.status !== 'removed'); }
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
  const approvedCount = approvedWords().length;
  const pendingWords = state.words.filter((item) => item.status === 'pending');
  const visibleWords = playableWords().filter((item) => state.showPending || item.status !== 'pending');
  document.querySelector('#game-view').innerHTML = `
    <section class="setup-grid">
      <article class="card"><h2>👥 Teams</h2><form id="team-form" class="inline-form"><input id="team-input" placeholder="Add team name" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.teams.map((team) => `<button class="chip" data-remove-team="${team.id}">${escapeHtml(team.name)} ${state.teams.length > 2 ? '×' : ''}</button>`).join('')}</div></article>
      <article class="card moderation-card"><div class="card-heading"><h2>🐠 Topic moderation</h2><span class="count-pill">${approvedCount} approved</span></div><form id="word-form" class="inline-form"><input id="word-input" placeholder="Submit a person, place, or thing" /><button type="submit">＋ Submit</button></form><div class="moderation-toolbar"><button class="ghost" id="toggle-pending">${state.showPending ? 'Hide pending topics' : `Show pending topics (${pendingWords.length})`}</button><span>${pendingWords.length} pending review</span></div><div class="topic-list">${visibleWords.map(renderTopic).join('') || '<p class="empty-state">No visible topics yet.</p>'}</div></article>
      <article class="card rules"><h2>⏱ Rules</h2><ol>${ROUND_NAMES.map((round, index) => `<li><strong>${round}:</strong> ${ROUND_HELP[index]}</li>`).join('')}</ol><label>Turn length <input id="turn-seconds" type="number" min="15" max="180" value="${state.turnSeconds}" /> seconds</label><button id="start-game" ${approvedCount < 3 ? 'disabled' : ''}>Start game with ${approvedCount} approved topics</button></article>
    </section>`;
  document.querySelector('#team-form').addEventListener('submit', addTeam);
  document.querySelector('#word-form').addEventListener('submit', addWord);
  document.querySelector('#toggle-pending').addEventListener('click', () => setState({ showPending: !state.showPending }));
  document.querySelector('#turn-seconds').addEventListener('change', (event) => setState({ turnSeconds: Number(event.target.value) }));
  document.querySelector('#start-game').addEventListener('click', startGame);
  document.querySelectorAll('[data-remove-team]').forEach((button) => button.addEventListener('click', () => removeTeam(button.dataset.removeTeam)));
  document.querySelectorAll('[data-approve-word]').forEach((button) => button.addEventListener('click', () => updateWordStatus(button.dataset.approveWord, 'approved')));
  document.querySelectorAll('[data-edit-word]').forEach((button) => button.addEventListener('click', () => editWord(button.dataset.editWord)));
  document.querySelectorAll('[data-remove-word]').forEach((button) => button.addEventListener('click', () => removeWord(button.dataset.removeWord)));
}
function renderTopic(item) {
  return `<article class="topic-row ${item.status}"><div><strong>${escapeHtml(item.text)}</strong><span>${item.status}</span></div><div class="topic-actions">${item.status === 'pending' ? `<button class="success" data-approve-word="${item.id}">Approve</button>` : ''}<button class="ghost" data-edit-word="${item.id}">Edit typo</button><button class="danger-btn" data-remove-word="${item.id}">Delete</button></div></article>`;
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
function updateWordStatus(wordId, status) { setState({ words: state.words.map((item) => item.id === wordId ? { ...item, status } : item) }); }
function removeWord(wordId) { updateWordStatus(wordId, 'removed'); }
function editWord(wordId) {
  const item = state.words.find((wordItem) => wordItem.id === wordId);
  if (!item) return;
  const text = prompt('Edit typo-only issue:', item.text)?.trim();
  if (text) setState({ words: state.words.map((wordItem) => wordItem.id === wordId ? { ...wordItem, text } : wordItem) });
}
function startGame() {
  const words = shuffle(approvedWords()).map((item) => ({ ...item, guessed: false }));
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
  const words = state.words.map((item) => item.id === activeWord.id ? { ...item, guessed: true, status: 'discussed' } : item);
  const teams = state.teams.map((team, index) => index === state.currentTeam ? { ...team, score: team.score + 1 } : team);
  const nextWords = words.filter((item) => !item.guessed);
  if (nextWords.length === 0) {
    const nextRound = state.round + 1;
    timeLeft = state.turnSeconds;
    setState({ teams, round: nextRound, words: shuffle(words).map((item) => ({ ...item, status: 'approved', guessed: false })), phase: nextRound >= ROUND_NAMES.length ? 'complete' : 'between', currentTeam: (state.currentTeam + 1) % state.teams.length, currentWordId: null });
  } else {
    setState({ teams, words, currentWordId: nextWords[0].id });
  }
}
function pass() {
  const words = remainingWords();
  if (words.length < 2) return;
  const activeWord = currentWord();
  const nextWord = words[(words.findIndex((item) => item.id === activeWord.id) + 1) % words.length];
  setState({ words: state.words.map((item) => item.id === activeWord.id ? { ...item, status: 'skipped' } : item), currentWordId: nextWord.id });
}
function resetGame() { localStorage.removeItem(STORAGE_KEY); state = defaultState(); timeLeft = state.turnSeconds; render(); }

document.querySelector('#reset-button').addEventListener('click', resetGame);
render();
