const ROUND_NAMES = ['Describe', 'Act', 'One Word'];
const ROUND_HELP = [
  'Describe the topic without saying the exact phrase or obvious variants.',
  'Act out the topic silently. No speaking, mouthing, or sound effects.',
  'Say exactly one word to spark conversation among participants.',
];
const STARTER_TOPICS = ['octopus', 'time machine', 'karaoke', 'volcano', 'grandma', 'moonwalk', 'detective', 'pickleball'];
const STORAGE_KEY = 'topic-draw-state';
let timerId;
let timeLeft = 60;
let state = loadState();

function id() { return crypto.randomUUID(); }
function shuffle(list) { return [...list].sort(() => Math.random() - 0.5); }
function topic(text) { return { id: id(), text, discussed: false }; }
function normalizeTopic(item) { return { id: item.id || id(), text: item.text, discussed: Boolean(item.discussed || item.guessed) }; }
function defaultState() {
  return {
    topics: STARTER_TOPICS.map(topic),
    round: 0,
    drawSeconds: 60,
    currentTopicId: null,
    phase: 'setup',
    discussedCount: 0,
  };
}
function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const savedTopics = saved?.topics || saved?.words;
    if (savedTopics?.length) {
      return {
        ...defaultState(),
        ...saved,
        topics: savedTopics.map(normalizeTopic),
        drawSeconds: saved.drawSeconds || saved.turnSeconds || 60,
        currentTopicId: saved.currentTopicId || saved.currentWordId || null,
        discussedCount: saved.discussedCount || 0,
      };
    }
  } catch (error) {
    console.warn('Ignoring malformed saved discussion.', error);
  }
  return defaultState();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setState(patch) { state = { ...state, ...patch }; save(); render(); }
function remainingTopics() { return state.topics.filter((item) => !item.discussed); }
function currentTopic() { return state.topics.find((item) => item.id === state.currentTopicId) || remainingTopics()[0]; }
function isComplete() { return state.phase === 'complete' || state.round >= ROUND_NAMES.length; }
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}

function render() {
  clearInterval(timerId);
  if (isComplete()) renderComplete();
  else if (state.phase === 'setup') renderSetup();
  else if (state.phase === 'between') renderBetween();
  else renderPlay();
}
function renderSetup() {
  document.querySelector('#game-view').innerHTML = `
    <section class="setup-grid">
      <article class="card"><h2>🫙 Submitted topics</h2><p class="card-copy">Invite participants to add anonymous prompts, questions, or themes for the host to draw from the bowl.</p><form id="topic-form" class="inline-form"><input id="topic-input" placeholder="Add an anonymous discussion prompt" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.topics.map((item) => `<button class="chip" data-remove-topic="${item.id}">${escapeHtml(item.text)} ×</button>`).join('')}</div></article>
      <article class="card rules"><h2>⏱ Host guide</h2><ol>${ROUND_NAMES.map((round, index) => `<li><strong>${round}:</strong> ${ROUND_HELP[index]}</li>`).join('')}</ol><label>Draw window <input id="draw-seconds" type="number" min="15" max="180" value="${state.drawSeconds}" /> seconds</label><button id="start-drawing" ${state.topics.length < 3 ? 'disabled' : ''}>Open submissions</button></article>
    </section>`;
  document.querySelector('#topic-form').addEventListener('submit', addTopic);
  document.querySelector('#draw-seconds').addEventListener('change', (event) => setState({ drawSeconds: Number(event.target.value) }));
  document.querySelector('#start-drawing').addEventListener('click', startDrawing);
  document.querySelectorAll('[data-remove-topic]').forEach((button) => button.addEventListener('click', () => removeTopic(button.dataset.removeTopic)));
}
function renderBetween() {
  document.querySelector('#game-view').innerHTML = `<section class="card centered"><p class="eyebrow">🫙 Discussion Bowl</p><h2>Ready for another prompt?</h2><p>Round ${state.round + 1}: ${ROUND_NAMES[state.round]}. ${ROUND_HELP[state.round]}</p><button id="start-draw">Start drawing</button></section>`;
  document.querySelector('#start-draw').addEventListener('click', startDraw);
}
function renderComplete() {
  document.querySelector('#game-view').innerHTML = `<section class="card centered"><div class="trophy">🫙</div><h2>Discussion complete!</h2><p>Participants discussed ${state.discussedCount} submitted topics.</p><button id="play-again">Open a new bowl</button></section>`;
  document.querySelector('#play-again').addEventListener('click', resetDiscussion);
}
function renderPlay() {
  const item = currentTopic();
  document.querySelector('#game-view').innerHTML = `<section class="card play-card"><div class="round-header"><div><p class="eyebrow">Round ${state.round + 1}</p><h2>${ROUND_NAMES[state.round]}</h2><p>${ROUND_HELP[state.round]}</p></div><div class="timer" id="timer">${timeLeft}s</div></div><div class="topic-card">${escapeHtml(item.text)}</div><p>${remainingTopics().length} submitted topics left in this round · Host is guiding participant discussion.</p><div class="actions"><button class="success" id="draw-topic">Draw topic</button><button class="ghost" id="mark-discussed">Mark discussed</button><button class="danger-btn" id="skip">Skip</button></div></section>`;
  document.querySelector('#draw-topic').addEventListener('click', drawTopic);
  document.querySelector('#mark-discussed').addEventListener('click', markDiscussed);
  document.querySelector('#skip').addEventListener('click', skip);
  timerId = setInterval(tick, 1000);
}

function addTopic(event) {
  event.preventDefault();
  const input = document.querySelector('#topic-input');
  const text = input.value.trim();
  if (text) setState({ topics: [...state.topics, topic(text)] });
}
function removeTopic(topicId) { setState({ topics: state.topics.filter((item) => item.id !== topicId) }); }
function startDrawing() {
  const topics = shuffle(state.topics).map((item) => ({ ...item, discussed: false }));
  timeLeft = state.drawSeconds;
  setState({ phase: 'playing', topics, round: 0, currentTopicId: topics[0].id, discussedCount: 0 });
}
function startDraw() { timeLeft = state.drawSeconds; setState({ phase: 'playing', currentTopicId: remainingTopics()[0]?.id }); }
function skip() { timeLeft = state.drawSeconds; setState({ phase: 'between' }); }
function tick() {
  timeLeft -= 1;
  const timer = document.querySelector('#timer');
  if (timer) {
    timer.textContent = `${timeLeft}s`;
    timer.classList.toggle('danger', timeLeft <= 10);
  }
  if (timeLeft <= 0) skip();
}
function markDiscussed() {
  const activeTopic = currentTopic();
  const topics = state.topics.map((item) => item.id === activeTopic.id ? { ...item, discussed: true } : item);
  const nextTopics = topics.filter((item) => !item.discussed);
  if (nextTopics.length === 0) {
    const nextRound = state.round + 1;
    timeLeft = state.drawSeconds;
    setState({ round: nextRound, topics: shuffle(topics).map((item) => ({ ...item, discussed: false })), phase: nextRound >= ROUND_NAMES.length ? 'complete' : 'between', currentTopicId: null, discussedCount: state.discussedCount + 1 });
  } else {
    setState({ topics, currentTopicId: nextTopics[0].id, discussedCount: state.discussedCount + 1 });
  }
}
function drawTopic() {
  const topics = remainingTopics();
  if (topics.length < 2) return;
  const index = topics.findIndex((item) => item.id === currentTopic().id);
  setState({ currentTopicId: topics[(index + 1) % topics.length].id });
}
function resetDiscussion() { localStorage.removeItem(STORAGE_KEY); state = defaultState(); timeLeft = state.drawSeconds; render(); }

document.querySelector('#reset-button').addEventListener('click', resetDiscussion);
render();
