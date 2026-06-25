const ROUND_NAMES = ['Taboo', 'Charades', 'One Word'];
const ROUND_HELP = [
  'Describe the word without saying the exact word or obvious variants.',
  'Act it out silently. No speaking, mouthing, or sound effects.',
  'Say exactly one word as the clue. Your team can make unlimited guesses.',
];
const STARTER_WORDS = ['octopus', 'time machine', 'karaoke', 'volcano', 'grandma', 'moonwalk', 'detective', 'pickleball'];
const STORAGE_KEY = 'fishbowl355-state';
const DEFAULT_SETTINGS = {
  sessionTitle: 'Fishbowl party game',
  participantInstructions: 'Add a person, place, thing, or phrase for the bowl.',
  maxTopicLength: 40,
  allowMultipleSubmissions: true,
  showSubmittedTopics: true,
  discussionTimerDuration: 60,
  anonymousSubmissionNotice: 'Submissions are anonymous. Keep topics friendly and fun.',
};
let timerId;
let timeLeft = DEFAULT_SETTINGS.discussionTimerDuration;
let state = loadState();

function id() { return crypto.randomUUID(); }
function shuffle(list) { return [...list].sort(() => Math.random() - 0.5); }
function word(text, submittedByParticipant = false) { return { id: id(), text, guessed: false, submittedByParticipant }; }
function defaultState() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    teams: [{ id: id(), name: 'Team Coral', score: 0 }, { id: id(), name: 'Team Kelp', score: 0 }],
    words: STARTER_WORDS.map((text) => word(text, false)),
    round: 0,
    currentTeam: 0,
    currentWordId: null,
    phase: 'setup',
  };
}
function normalizeState(saved) {
  const settings = { ...DEFAULT_SETTINGS, ...(saved.settings || {}) };
  if (saved.turnSeconds) settings.discussionTimerDuration = saved.turnSeconds;
  settings.maxTopicLength = clampNumber(settings.maxTopicLength, 10, 120, DEFAULT_SETTINGS.maxTopicLength);
  settings.discussionTimerDuration = clampNumber(settings.discussionTimerDuration, 15, 300, DEFAULT_SETTINGS.discussionTimerDuration);
  return {
    ...saved,
    settings,
    words: saved.words.map((item) => ({ submittedByParticipant: false, ...item })),
    phase: saved.phase || 'setup',
  };
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
function setSettings(patch) { setState({ settings: { ...state.settings, ...patch } }); }
function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
function remainingWords() { return state.words.filter((item) => !item.guessed); }
function currentWord() { return state.words.find((item) => item.id === state.currentWordId) || remainingWords()[0]; }
function isComplete() { return state.phase === 'complete' || state.round >= ROUND_NAMES.length; }
function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}
function submittedTopicCount() { return state.words.filter((item) => item.submittedByParticipant).length; }
function canSubmitTopic() { return state.settings.allowMultipleSubmissions || submittedTopicCount() === 0; }
function topicList(items = state.words, honorVisibilitySetting = true) {
  if (honorVisibilitySetting && !state.settings.showSubmittedTopics) return '<p class="muted hidden-topics">Submitted topics are hidden until drawing starts.</p>';
  return `<div class="chip-list">${items.map((item) => `<button class="chip" data-remove-word="${item.id}">${escapeHtml(item.text)} ×</button>`).join('')}</div>`;
}

function render() {
  clearInterval(timerId);
  document.querySelector('h1').textContent = state.settings.sessionTitle;
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
  const submitDisabled = !canSubmitTopic();
  document.querySelector('#game-view').innerHTML = `
    <section class="setup-grid">
      <article class="card"><h2>👥 Teams</h2><form id="team-form" class="inline-form"><input id="team-input" placeholder="Add team name" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.teams.map((team) => `<button class="chip" data-remove-team="${team.id}">${escapeHtml(team.name)} ${state.teams.length > 2 ? '×' : ''}</button>`).join('')}</div></article>
      <article class="card participant-card"><h2>🐠 Participant topics</h2><p class="muted">${escapeHtml(state.settings.participantInstructions)}</p><p class="notice">${escapeHtml(state.settings.anonymousSubmissionNotice)}</p><form id="word-form" class="inline-form"><input id="word-input" placeholder="Add a person, place, or thing" maxlength="${state.settings.maxTopicLength}" ${submitDisabled ? 'disabled' : ''} /><button type="submit" ${submitDisabled ? 'disabled' : ''}>＋ Submit</button></form><p class="field-help">Maximum ${state.settings.maxTopicLength} characters${state.settings.allowMultipleSubmissions ? '' : ' · one submission per session'}.</p>${topicList()}</article>
      <article class="card settings-card"><h2>⚙️ Host settings</h2><div class="settings-grid"><label>Session title <input id="session-title" value="${escapeHtml(state.settings.sessionTitle)}" /></label><label>Participant instructions <textarea id="participant-instructions" maxlength="240">${escapeHtml(state.settings.participantInstructions)}</textarea></label><label>Anonymous submission notice <textarea id="anonymous-notice" maxlength="180">${escapeHtml(state.settings.anonymousSubmissionNotice)}</textarea></label><label>Maximum topic length <input id="max-topic-length" type="number" min="10" max="120" value="${state.settings.maxTopicLength}" /></label><label>Discussion timer duration <input id="timer-duration" type="number" min="15" max="300" value="${state.settings.discussionTimerDuration}" /> seconds</label><label class="check-label"><input id="allow-multiple" type="checkbox" ${state.settings.allowMultipleSubmissions ? 'checked' : ''} /> Allow multiple submissions</label><label class="check-label"><input id="show-topics" type="checkbox" ${state.settings.showSubmittedTopics ? 'checked' : ''} /> Show submitted topics before drawing</label></div><button id="start-game" ${state.words.length < 3 ? 'disabled' : ''}>Start game</button></article>
      <article class="card rules"><h2>⏱ Rules</h2><ol>${ROUND_NAMES.map((round, index) => `<li><strong>${round}:</strong> ${ROUND_HELP[index]}</li>`).join('')}</ol></article>
    </section>`;
  document.querySelector('#team-form').addEventListener('submit', addTeam);
  document.querySelector('#word-form').addEventListener('submit', addWord);
  document.querySelector('#start-game').addEventListener('click', startGame);
  document.querySelectorAll('[data-remove-team]').forEach((button) => button.addEventListener('click', () => removeTeam(button.dataset.removeTeam)));
  document.querySelectorAll('[data-remove-word]').forEach((button) => button.addEventListener('click', () => removeWord(button.dataset.removeWord)));
  bindSettings();
}
function bindSettings() {
  document.querySelector('#session-title').addEventListener('change', (event) => setSettings({ sessionTitle: event.target.value.trim() || DEFAULT_SETTINGS.sessionTitle }));
  document.querySelector('#participant-instructions').addEventListener('change', (event) => setSettings({ participantInstructions: event.target.value.trim() }));
  document.querySelector('#anonymous-notice').addEventListener('change', (event) => setSettings({ anonymousSubmissionNotice: event.target.value.trim() }));
  document.querySelector('#max-topic-length').addEventListener('change', (event) => setSettings({ maxTopicLength: clampNumber(event.target.value, 10, 120, DEFAULT_SETTINGS.maxTopicLength) }));
  document.querySelector('#timer-duration').addEventListener('change', (event) => setSettings({ discussionTimerDuration: clampNumber(event.target.value, 15, 300, DEFAULT_SETTINGS.discussionTimerDuration) }));
  document.querySelector('#allow-multiple').addEventListener('change', (event) => setSettings({ allowMultipleSubmissions: event.target.checked }));
  document.querySelector('#show-topics').addEventListener('change', (event) => setSettings({ showSubmittedTopics: event.target.checked }));
}
function renderBetween() {
  document.querySelector('#game-view').innerHTML = `<section class="card centered"><p class="eyebrow">🔀 Next turn</p><h2>${escapeHtml(state.teams[state.currentTeam].name)}, you are up.</h2><p>Round ${state.round + 1}: ${ROUND_NAMES[state.round]}. ${ROUND_HELP[state.round]}</p><p class="muted">${remainingWords().length} topics remain in the bowl.</p><button id="start-turn">Start ${state.settings.discussionTimerDuration}s turn</button></section>`;
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
  document.querySelector('#game-view').innerHTML = `<section class="card play-card"><div class="round-header"><div><p class="eyebrow">Round ${state.round + 1}</p><h2>${ROUND_NAMES[state.round]}</h2><p>${ROUND_HELP[state.round]}</p></div><div class="timer" id="timer">${timeLeft}s</div></div><div class="word-card">${escapeHtml(word.text)}</div><p>${remainingWords().length} topics left in this round · ${escapeHtml(state.teams[state.currentTeam].name)} guessing</p><details class="host-drawer"><summary>Host topic queue</summary>${topicList(remainingWords(), false)}</details><div class="actions"><button class="success" id="guessed">✓ Got it</button><button class="ghost" id="pass">Pass</button><button class="danger-btn" id="end-turn">End turn</button></div></section>`;
  document.querySelector('#guessed').addEventListener('click', guessed);
  document.querySelector('#pass').addEventListener('click', pass);
  document.querySelector('#end-turn').addEventListener('click', endTurn);
  document.querySelectorAll('[data-remove-word]').forEach((button) => button.addEventListener('click', () => removeWord(button.dataset.removeWord)));
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
  if (!canSubmitTopic()) return;
  const input = document.querySelector('#word-input');
  const text = input.value.trim().slice(0, state.settings.maxTopicLength);
  if (text) setState({ words: [...state.words, word(text, true)] });
}
function removeTeam(teamId) { if (state.teams.length > 2) setState({ teams: state.teams.filter((team) => team.id !== teamId), currentTeam: 0 }); }
function removeWord(wordId) { setState({ words: state.words.filter((item) => item.id !== wordId) }); }
function startGame() {
  const words = shuffle(state.words).map((item) => ({ ...item, guessed: false }));
  timeLeft = state.settings.discussionTimerDuration;
  setState({ phase: 'playing', words, round: 0, currentTeam: 0, currentWordId: words[0].id });
}
function startTurn() { timeLeft = state.settings.discussionTimerDuration; setState({ phase: 'playing', currentWordId: remainingWords()[0]?.id }); }
function endTurn() { timeLeft = state.settings.discussionTimerDuration; setState({ phase: 'between', currentTeam: (state.currentTeam + 1) % state.teams.length }); }
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
    timeLeft = state.settings.discussionTimerDuration;
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
function resetGame() { localStorage.removeItem(STORAGE_KEY); state = defaultState(); timeLeft = state.settings.discussionTimerDuration; render(); }

document.querySelector('#reset-button').addEventListener('click', resetGame);
render();
