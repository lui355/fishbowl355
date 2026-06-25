const ROUND_NAMES = ['Taboo', 'Charades', 'One Word'];
const ROUND_HELP = [
  'Describe the word without saying the exact word or obvious variants.',
  'Act it out silently. No speaking, mouthing, or sound effects.',
  'Say exactly one word as the clue. Your team can make unlimited guesses.',
];
const STARTER_WORDS = ['octopus', 'time machine', 'karaoke', 'volcano', 'grandma', 'moonwalk', 'detective', 'pickleball'];
const STORAGE_KEY = 'fishbowl355-state';
const SESSION_PHASES = ['host-setup', 'collecting', 'drawing', 'complete'];
let timerId;
let timeLeft = 60;
let state = loadState();

function id() { return crypto.randomUUID(); }
function shuffle(list) { return [...list].sort(() => Math.random() - 0.5); }
function word(text) { return { id: id(), text, guessed: false }; }
function createSession(overrides = {}) {
  return {
    sessionId: id(),
    topics: [],
    phase: 'host-setup',
    createdAt: new Date().toISOString(),
    allowMultipleSubmissions: true,
    discussionTimeLimit: 60,
    moderationEnabled: false,
    ...overrides,
  };
}
function defaultState() {
  const session = createSession({ topics: STARTER_WORDS });
  return {
    session,
    teams: [{ id: id(), name: 'Team Coral', score: 0 }, { id: id(), name: 'Team Kelp', score: 0 }],
    words: STARTER_WORDS.map(word),
    round: 0,
    currentTeam: 0,
    turnSeconds: session.discussionTimeLimit,
    currentWordId: null,
  };
}
function normalizeState(saved) {
  const session = createSession({
    ...(saved.session || {}),
    topics: saved.session?.topics?.length ? saved.session.topics : saved.words.map((item) => item.text),
    phase: SESSION_PHASES.includes(saved.session?.phase) ? saved.session.phase : phaseFromLegacy(saved.phase),
  });
  return {
    ...saved,
    session,
    turnSeconds: Number(saved.turnSeconds || session.discussionTimeLimit || 60),
    currentTeam: saved.currentTeam || 0,
  };
}
function phaseFromLegacy(phase) {
  if (phase === 'playing') return 'drawing';
  if (phase === 'complete') return 'complete';
  return 'host-setup';
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved?.teams?.length >= 2 && saved?.words?.length) return normalizeState(saved);
  } catch (error) {
    console.warn('Ignoring malformed saved game.', error);
  }
  return defaultState();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setState(patch) { state = { ...state, ...patch }; save(); render(); }
function setSession(patch) { setState({ session: { ...state.session, ...patch } }); }
function remainingWords() { return state.words.filter((item) => !item.guessed); }
function currentWord() { return state.words.find((item) => item.id === state.currentWordId) || remainingWords()[0]; }
function isComplete() { return state.session.phase === 'complete' || state.round >= ROUND_NAMES.length; }
function joinLink() { return `${window.location.origin}${window.location.pathname}?session=${encodeURIComponent(state.session.sessionId)}`; }
function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}
function syncTopics(words) { return words.map((item) => item.text); }

function render() {
  clearInterval(timerId);
  renderScoreboard();
  if (isComplete()) renderComplete();
  else if (state.session.phase === 'host-setup') renderHostSetup();
  else if (state.session.phase === 'collecting') renderCollecting();
  else renderDrawing();
}
function renderScoreboard() {
  const scoreLabel = state.session.phase === 'drawing' ? 'Up now' : 'Team';
  document.querySelector('#scoreboard').innerHTML = state.teams.map((team, index) => `
    <article class="team-card ${index === state.currentTeam && state.session.phase === 'drawing' ? 'active' : ''}">
      <span>${index === state.currentTeam ? scoreLabel : 'Team'}</span>
      <strong>${escapeHtml(team.name)}</strong>
      <b>${team.score}</b>
    </article>`).join('');
}
function renderHostSetup() {
  document.querySelector('#game-view').innerHTML = `
    <section class="setup-grid">
      <article class="card"><h2>🎛 Host setup</h2><p>Create a session, choose settings, then share the join link when collecting starts.</p><label>Discussion time <input id="discussion-time-limit" type="number" min="15" max="180" value="${state.session.discussionTimeLimit}" /> seconds</label><label><input id="allow-multiple" type="checkbox" ${state.session.allowMultipleSubmissions ? 'checked' : ''} /> Allow multiple submissions</label><label><input id="moderation-enabled" type="checkbox" ${state.session.moderationEnabled ? 'checked' : ''} /> Moderation enabled</label><button id="create-session">Create session</button></article>
      <article class="card"><h2>👥 Teams</h2><form id="team-form" class="inline-form"><input id="team-input" placeholder="Add team name" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.teams.map((team) => `<button class="chip" data-remove-team="${team.id}">${escapeHtml(team.name)} ${state.teams.length > 2 ? '×' : ''}</button>`).join('')}</div></article>
    </section>`;
  document.querySelector('#team-form').addEventListener('submit', addTeam);
  document.querySelector('#discussion-time-limit').addEventListener('change', updateSessionSettings);
  document.querySelector('#allow-multiple').addEventListener('change', updateSessionSettings);
  document.querySelector('#moderation-enabled').addEventListener('change', updateSessionSettings);
  document.querySelector('#create-session').addEventListener('click', createHostedSession);
  document.querySelectorAll('[data-remove-team]').forEach((button) => button.addEventListener('click', () => removeTeam(button.dataset.removeTeam)));
}
function renderCollecting() {
  document.querySelector('#game-view').innerHTML = `
    <section class="setup-grid">
      <article class="card"><h2>🔗 Session ready</h2><p class="eyebrow">${escapeHtml(state.session.sessionId)}</p><p>Share this join link so players can submit topics:</p><input readonly value="${escapeHtml(joinLink())}" /><p>${state.words.length} topics collected · ${state.session.allowMultipleSubmissions ? 'multiple submissions allowed' : 'one submission per player'} · moderation ${state.session.moderationEnabled ? 'on' : 'off'}</p><div class="actions"><button id="start-drawing" ${state.words.length < 3 ? 'disabled' : ''}>Move to drawing</button><button class="danger-btn" id="end-session">End session</button></div></article>
      <article class="card"><h2>🐠 Topics</h2><form id="word-form" class="inline-form"><input id="word-input" placeholder="Add a person, place, or thing" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.words.map((item) => `<button class="chip" data-remove-word="${item.id}">${escapeHtml(item.text)} ×</button>`).join('')}</div></article>
      <article class="card rules"><h2>⏱ Rules</h2><ol>${ROUND_NAMES.map((round, index) => `<li><strong>${round}:</strong> ${ROUND_HELP[index]}</li>`).join('')}</ol><label>Turn length <input id="turn-seconds" type="number" min="15" max="180" value="${state.turnSeconds}" /> seconds</label></article>
    </section>`;
  document.querySelector('#word-form').addEventListener('submit', addWord);
  document.querySelector('#turn-seconds').addEventListener('change', (event) => setState({ turnSeconds: Number(event.target.value), session: { ...state.session, discussionTimeLimit: Number(event.target.value) } }));
  document.querySelector('#start-drawing').addEventListener('click', startGame);
  document.querySelector('#end-session').addEventListener('click', endSession);
  document.querySelectorAll('[data-remove-word]').forEach((button) => button.addEventListener('click', () => removeWord(button.dataset.removeWord)));
}
function renderDrawing() {
  if (state.currentWordId || state.round > 0 || remainingWords().length < state.words.length) renderPlay();
  else renderBetween();
}
function renderBetween() {
  document.querySelector('#game-view').innerHTML = `<section class="card centered"><p class="eyebrow">🔀 Drawing phase</p><h2>${escapeHtml(state.teams[state.currentTeam].name)}, you are up.</h2><p>Round ${state.round + 1}: ${ROUND_NAMES[state.round]}. ${ROUND_HELP[state.round]}</p><div class="actions"><button id="start-turn">Start ${state.turnSeconds}s turn</button><button class="danger-btn" id="end-session">End session</button></div></section>`;
  document.querySelector('#start-turn').addEventListener('click', startTurn);
  document.querySelector('#end-session').addEventListener('click', endSession);
}
function renderComplete() {
  const highScore = Math.max(...state.teams.map((team) => team.score));
  const winners = state.teams.filter((team) => team.score === highScore).map((team) => escapeHtml(team.name)).join(' & ');
  document.querySelector('#game-view').innerHTML = `<section class="card centered"><div class="trophy">🏆</div><p class="eyebrow">Session complete</p><h2>Game over!</h2><p>${winners} won with ${highScore} points.</p><div class="actions"><button id="play-again">Reset session</button><button class="ghost" id="new-session">New host session</button></div></section>`;
  document.querySelector('#play-again').addEventListener('click', resetGame);
  document.querySelector('#new-session').addEventListener('click', () => setState(defaultState()));
}
function renderPlay() {
  const activeWord = currentWord();
  if (!activeWord) return endSession();
  document.querySelector('#game-view').innerHTML = `<section class="card play-card"><div class="round-header"><div><p class="eyebrow">Drawing · Round ${state.round + 1}</p><h2>${ROUND_NAMES[state.round]}</h2><p>${ROUND_HELP[state.round]}</p></div><div class="timer" id="timer">${timeLeft}s</div></div><div class="word-card">${escapeHtml(activeWord.text)}</div><p>${remainingWords().length} words left in this round · ${escapeHtml(state.teams[state.currentTeam].name)} guessing</p><div class="actions"><button class="success" id="guessed">✓ Got it</button><button class="ghost" id="pass">Pass</button><button class="danger-btn" id="end-turn">End turn</button><button class="danger-btn" id="end-session">End session</button></div></section>`;
  document.querySelector('#guessed').addEventListener('click', guessed);
  document.querySelector('#pass').addEventListener('click', pass);
  document.querySelector('#end-turn').addEventListener('click', endTurn);
  document.querySelector('#end-session').addEventListener('click', endSession);
  timerId = setInterval(tick, 1000);
}

function updateSessionSettings() {
  const discussionTimeLimit = Number(document.querySelector('#discussion-time-limit')?.value || state.session.discussionTimeLimit);
  setState({
    turnSeconds: discussionTimeLimit,
    session: {
      ...state.session,
      discussionTimeLimit,
      allowMultipleSubmissions: Boolean(document.querySelector('#allow-multiple')?.checked),
      moderationEnabled: Boolean(document.querySelector('#moderation-enabled')?.checked),
    },
  });
}
function createHostedSession() {
  const currentSettings = {
    allowMultipleSubmissions: state.session.allowMultipleSubmissions,
    discussionTimeLimit: state.session.discussionTimeLimit,
    moderationEnabled: state.session.moderationEnabled,
  };
  setState({ session: createSession({ ...currentSettings, topics: syncTopics(state.words), phase: 'collecting' }), turnSeconds: currentSettings.discussionTimeLimit });
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
  if (text) {
    const words = [...state.words, word(text)];
    setState({ words, session: { ...state.session, topics: syncTopics(words) } });
  }
}
function removeTeam(teamId) { if (state.teams.length > 2) setState({ teams: state.teams.filter((team) => team.id !== teamId), currentTeam: 0 }); }
function removeWord(wordId) {
  const words = state.words.filter((item) => item.id !== wordId);
  setState({ words, session: { ...state.session, topics: syncTopics(words) } });
}
function startGame() {
  const words = shuffle(state.words).map((item) => ({ ...item, guessed: false }));
  timeLeft = state.turnSeconds;
  setState({ session: { ...state.session, phase: 'drawing', topics: syncTopics(words) }, words, round: 0, currentTeam: 0, currentWordId: null });
}
function startTurn() { timeLeft = state.turnSeconds; setState({ currentWordId: remainingWords()[0]?.id }); }
function endTurn() { timeLeft = state.turnSeconds; setState({ currentWordId: null, currentTeam: (state.currentTeam + 1) % state.teams.length }); }
function endSession() { timeLeft = state.turnSeconds; setSession({ phase: 'complete' }); }
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
    setState({ teams, round: nextRound, words: shuffle(words).map((item) => ({ ...item, guessed: false })), session: { ...state.session, phase: nextRound >= ROUND_NAMES.length ? 'complete' : 'drawing' }, currentTeam: (state.currentTeam + 1) % state.teams.length, currentWordId: null });
  } else {
    setState({ teams, words, session: { ...state.session, topics: syncTopics(words) }, currentWordId: nextWords[0].id });
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
