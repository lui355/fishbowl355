const appView = document.querySelector('#app-view');
const statusView = document.querySelector('#app-status');
const homeButton = document.querySelector('#home-button');
const query = new URLSearchParams(window.location.search);
const sessionIdFromUrl = query.get('session');
const participantMode = query.get('mode') === 'submit';
let session = null;
let currentTopic = null;
let pollTimer = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (match) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[match]));
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Request failed');
  return payload;
}

function setStatus(message, type = 'info') {
  statusView.textContent = message;
  statusView.className = `status ${type}`;
}

function clearStatus() {
  statusView.textContent = '';
  statusView.className = 'status';
}

function joinUrl(id = session?.id) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('session', id);
  url.searchParams.set('mode', 'submit');
  return url.toString();
}

function hostUrl(id = session?.id) {
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('session', id);
  return url.toString();
}

function qrUrl(url) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(url)}`;
}

function startPolling() {
  clearInterval(pollTimer);
  if (!session?.id || participantMode) return;
  pollTimer = setInterval(() => loadHostSession(session.id, false), 2500);
}

async function createSession(event) {
  event.preventDefault();
  clearStatus();
  const form = new FormData(event.target);
  try {
    session = await api('/api/sessions', {
      method: 'POST',
      body: JSON.stringify({ title: form.get('title'), instructions: form.get('instructions') }),
    });
    history.replaceState(null, '', hostUrl(session.id));
    renderHost();
    startPolling();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function loadHostSession(id, showLoading = true) {
  if (showLoading) setStatus('Loading session…');
  try {
    session = await api(`/api/sessions/${id}`);
    clearStatus();
    renderHost();
    startPolling();
  } catch (error) {
    setStatus(error.message, 'error');
    renderHome();
  }
}

async function loadParticipantSession(id) {
  setStatus('Loading submission page…');
  try {
    session = await api(`/api/sessions/${id}/public`);
    clearStatus();
    renderParticipant();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function renderHome() {
  clearInterval(pollTimer);
  appView.innerHTML = `
    <section class="card setup-card">
      <p class="eyebrow">Create a session</p>
      <h2>Host a Topic Draw</h2>
      <p>Participants scan your QR code and anonymously submit discussion topics from their phones.</p>
      <form id="create-session" class="stacked-form">
        <label>Session title<input name="title" maxlength="80" value="Topic Draw" /></label>
        <label>Participant instructions<textarea name="instructions" maxlength="240">Submit a question or topic for the group to discuss. Your submission is anonymous.</textarea></label>
        <button type="submit">Create session</button>
      </form>
    </section>`;
  document.querySelector('#create-session').addEventListener('submit', createSession);
}

function renderHost() {
  const topics = session.topics || [];
  const drawable = topics.filter((topic) => ['approved', 'skipped'].includes(topic.status));
  const discussed = topics.filter((topic) => topic.status === 'discussed');
  const removed = topics.filter((topic) => topic.status === 'removed');
  appView.innerHTML = `
    <section class="host-grid">
      <article class="card join-card">
        <p class="eyebrow">Session ${escapeHtml(session.id)}</p>
        <h2>${escapeHtml(session.title)}</h2>
        <p>${escapeHtml(session.instructions)}</p>
        <img class="qr-code" src="${qrUrl(joinUrl())}" alt="QR code for participant submission link" />
        <div class="copy-row"><input id="join-link" readonly value="${joinUrl()}" /><button id="copy-link">Copy</button></div>
      </article>
      <article class="card stats-card">
        <h2>Host controls</h2>
        <div class="stats"><span><b>${topics.length}</b>Total</span><span><b>${drawable.length}</b>Available</span><span><b>${discussed.length}</b>Discussed</span><span><b>${removed.length}</b>Removed</span></div>
        <div class="actions">
          <button id="open-submissions" ${session.phase === 'collecting' ? 'disabled' : ''}>Open submissions</button>
          <button id="close-submissions" ${session.phase !== 'collecting' ? 'disabled' : ''}>Close submissions</button>
          <button id="draw-topic" ${drawable.length === 0 ? 'disabled' : ''}>Draw topic</button>
        </div>
      </article>
      ${renderCurrentTopic()}
      <article class="card topic-list-card">
        <h2>Moderate submissions</h2>
        ${topics.length ? `<div class="topic-list">${topics.map(renderTopicRow).join('')}</div>` : '<p class="empty">No topics yet. Keep the QR code on screen while people submit.</p>'}
      </article>
    </section>`;
  document.querySelector('#copy-link').addEventListener('click', copyJoinLink);
  document.querySelector('#open-submissions').addEventListener('click', () => updateSessionPhase('collecting'));
  document.querySelector('#close-submissions').addEventListener('click', () => updateSessionPhase('drawing'));
  document.querySelector('#draw-topic').addEventListener('click', drawTopic);
  document.querySelectorAll('[data-status]').forEach((button) => button.addEventListener('click', () => updateTopic(button.dataset.topicId, button.dataset.status)));
}

function renderCurrentTopic() {
  const active = currentTopic || (session.topics || []).find((topic) => topic.id === session.currentTopicId);
  if (!active) {
    return `<article class="card draw-card"><p class="eyebrow">Randomizer</p><h2>Ready to draw</h2><p>Close submissions when the room is ready, then draw a topic for discussion.</p></article>`;
  }
  return `<article class="card draw-card active-draw"><p class="eyebrow">Discuss this</p><div class="drawn-topic">${escapeHtml(active.text)}</div><div class="actions"><button data-topic-id="${active.id}" data-status="discussed">Mark discussed</button><button class="ghost" data-topic-id="${active.id}" data-status="skipped">Skip / put back</button><button class="danger-btn" data-topic-id="${active.id}" data-status="removed">Remove</button></div></article>`;
}

function renderTopicRow(topic) {
  return `<div class="topic-row ${topic.status}"><p>${escapeHtml(topic.text)}</p><span>${topic.status}</span><div><button data-topic-id="${topic.id}" data-status="approved">Approve</button><button class="ghost" data-topic-id="${topic.id}" data-status="removed">Remove</button></div></div>`;
}

async function copyJoinLink() {
  const value = document.querySelector('#join-link').value;
  await navigator.clipboard.writeText(value);
  setStatus('Participant link copied.', 'success');
}

async function updateSessionPhase(phase) {
  try {
    session = await api(`/api/sessions/${session.id}`, { method: 'PATCH', body: JSON.stringify({ phase }) });
    currentTopic = null;
    renderHost();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function updateTopic(topicId, status) {
  try {
    session = await api(`/api/sessions/${session.id}/topics/${topicId}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    if (currentTopic?.id === topicId && status !== 'approved') currentTopic = null;
    renderHost();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

async function drawTopic() {
  try {
    const payload = await api(`/api/sessions/${session.id}/draw`, { method: 'POST' });
    session = payload.session;
    currentTopic = payload.topic;
    renderHost();
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

function renderParticipant(successMessage = '') {
  const closed = session.phase !== 'collecting';
  appView.innerHTML = `
    <section class="card participant-card">
      <p class="eyebrow">Anonymous submission</p>
      <h2>${escapeHtml(session.title)}</h2>
      <p>${escapeHtml(session.instructions)}</p>
      ${successMessage ? `<p class="success-message">${escapeHtml(successMessage)}</p>` : ''}
      <form id="submit-topic" class="stacked-form">
        <label>Your topic or question<textarea name="text" maxlength="${session.settings.maxTopicLength}" placeholder="What should the group discuss?" ${closed ? 'disabled' : ''}></textarea></label>
        <button type="submit" ${closed ? 'disabled' : ''}>Submit anonymously</button>
      </form>
      ${closed ? '<p class="empty">Submissions are closed for this session.</p>' : '<p class="privacy-note">No name is collected with your topic.</p>'}
    </section>`;
  document.querySelector('#submit-topic').addEventListener('submit', submitTopic);
}

async function submitTopic(event) {
  event.preventDefault();
  const form = new FormData(event.target);
  try {
    await api(`/api/sessions/${session.id}/topics`, { method: 'POST', body: JSON.stringify({ text: form.get('text') }) });
    event.target.reset();
    renderParticipant('Thanks — your topic was added to the bowl.');
  } catch (error) {
    setStatus(error.message, 'error');
  }
}

homeButton.addEventListener('click', () => {
  history.replaceState(null, '', window.location.pathname);
  session = null;
  currentTopic = null;
  clearStatus();
  renderHome();
});

if (sessionIdFromUrl && participantMode) loadParticipantSession(sessionIdFromUrl);
else if (sessionIdFromUrl) loadHostSession(sessionIdFromUrl);
else renderHome();
