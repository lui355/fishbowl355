const STARTER_TOPICS = ['octopus', 'time machine', 'karaoke', 'volcano', 'grandma', 'moonwalk', 'detective', 'pickleball'];
const STORAGE_KEY = 'fishbowl355-state';
let state = loadState();

function id() { return crypto.randomUUID(); }
function topic(text, overrides = {}) { return { id: id(), text, discussed: false, ...overrides }; }
function approvedTopics() { return state.topics; }
function remainingTopics() { return approvedTopics().filter((item) => !item.discussed); }
function randomRemainingTopic() {
  const remaining = remainingTopics();
  if (!remaining.length) return null;
  return remaining[Math.floor(Math.random() * remaining.length)];
}
function defaultState() {
  return {
    topics: STARTER_TOPICS.map((text) => topic(text)),
    currentTopicId: null,
    phase: 'setup',
  };
}
function normalizeState(saved) {
  if (!saved) return null;
  const savedTopics = Array.isArray(saved.topics) ? saved.topics : saved.words;
  if (!Array.isArray(savedTopics) || !savedTopics.length) return null;
  return {
    topics: savedTopics.map((item) => topic(item.text || String(item), { id: item.id || id(), discussed: Boolean(item.discussed) })),
    currentTopicId: saved.currentTopicId || null,
    phase: saved.phase === 'drawing' ? 'drawing' : 'setup',
  };
}
function loadState() {
  try {
    const normalized = normalizeState(JSON.parse(localStorage.getItem(STORAGE_KEY)));
    if (normalized) return normalized;
  } catch (error) {
    console.warn('Ignoring malformed saved topic list.', error);
  }
  return defaultState();
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function setState(patch) { state = { ...state, ...patch }; save(); render(); }
function currentTopic() { return state.topics.find((item) => item.id === state.currentTopicId) || null; }
function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}

function render() {
  renderTopicStatus();
  if (state.phase === 'setup') renderSetup();
  else renderDrawing();
}
function renderTopicStatus() {
  const total = approvedTopics().length;
  const remaining = remainingTopics().length;
  const discussed = total - remaining;
  document.querySelector('#scoreboard').innerHTML = `
    <article class="team-card active">
      <span>Remaining topics</span>
      <strong>${remaining} of ${total}</strong>
      <b>${remaining}</b>
    </article>
    <article class="team-card">
      <span>Discussed</span>
      <strong>Completed conversations</strong>
      <b>${discussed}</b>
    </article>`;
}
function renderSetup() {
  document.querySelector('#game-view').innerHTML = `
    <section class="setup-grid">
      <article class="card"><h2>🐠 Approved topics</h2><form id="topic-form" class="inline-form"><input id="topic-input" placeholder="Add a discussion topic" /><button type="submit">＋ Add</button></form><div class="chip-list">${state.topics.map((item) => `<button class="chip" data-remove-topic="${item.id}">${escapeHtml(item.text)} ×</button>`).join('')}</div></article>
      <article class="card rules"><h2>💬 Topic draw</h2><p>Draw one approved topic at a time. The host can mark the topic discussed after the conversation, or skip it to draw another remaining topic.</p><button id="start-drawing" ${state.topics.length < 1 ? 'disabled' : ''}>Start drawing topics</button></article>
    </section>`;
  document.querySelector('#topic-form').addEventListener('submit', addTopic);
  document.querySelector('#start-drawing').addEventListener('click', startDrawing);
  document.querySelectorAll('[data-remove-topic]').forEach((button) => button.addEventListener('click', () => removeTopic(button.dataset.removeTopic)));
}
function renderDrawing() {
  const remaining = remainingTopics();
  const activeTopic = currentTopic();
  if (!remaining.length) {
    document.querySelector('#game-view').innerHTML = `<section class="card centered"><div class="trophy">🎉</div><h2>All topics have been discussed.</h2><p>Add more approved topics or reset the bowl to keep the conversation going.</p><button id="back-to-topics">Edit topics</button></section>`;
    document.querySelector('#back-to-topics').addEventListener('click', () => setState({ phase: 'setup', currentTopicId: null }));
    return;
  }
  const topicToShow = activeTopic && !activeTopic.discussed ? activeTopic : randomRemainingTopic();
  if (topicToShow.id !== state.currentTopicId) {
    setState({ currentTopicId: topicToShow.id });
    return;
  }
  document.querySelector('#game-view').innerHTML = `<section class="card play-card"><div class="round-header"><div><p class="eyebrow">🎲 Drawn topic</p><h2>Discuss this topic</h2><p>${remaining.length} approved topic${remaining.length === 1 ? '' : 's'} remaining.</p></div></div><div class="word-card">${escapeHtml(topicToShow.text)}</div><div class="actions"><button class="success" id="mark-discussed">✓ Mark discussed</button><button class="ghost" id="skip-topic">Skip topic</button></div></section>`;
  document.querySelector('#mark-discussed').addEventListener('click', markDiscussed);
  document.querySelector('#skip-topic').addEventListener('click', skipTopic);
}

function addTopic(event) {
  event.preventDefault();
  const input = document.querySelector('#topic-input');
  const text = input.value.trim();
  if (text) setState({ topics: [...state.topics, topic(text)] });
}
function removeTopic(topicId) {
  const topics = state.topics.filter((item) => item.id !== topicId);
  setState({ topics, currentTopicId: state.currentTopicId === topicId ? null : state.currentTopicId });
}
function startDrawing() { setState({ phase: 'drawing', currentTopicId: randomRemainingTopic()?.id || null }); }
function markDiscussed() {
  const activeTopic = currentTopic();
  if (!activeTopic) return;
  const topics = state.topics.map((item) => item.id === activeTopic.id ? { ...item, discussed: true } : item);
  const remaining = topics.filter((item) => !item.discussed);
  const nextTopic = remaining[Math.floor(Math.random() * remaining.length)];
  setState({ topics, currentTopicId: nextTopic?.id || null });
}
function skipTopic() {
  const remaining = remainingTopics().filter((item) => item.id !== state.currentTopicId);
  if (!remaining.length) return;
  setState({ currentTopicId: remaining[Math.floor(Math.random() * remaining.length)].id });
}
function resetGame() { localStorage.removeItem(STORAGE_KEY); state = defaultState(); render(); }

document.querySelector('#reset-button').addEventListener('click', resetGame);
render();
