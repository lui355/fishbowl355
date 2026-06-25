const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 5173;
const PUBLIC_ROOT = process.cwd();
const sessions = new Map();

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

function createSessionCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

function createTopic(text) {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    status: 'approved',
    createdAt: new Date().toISOString(),
  };
}

function createSession(body = {}) {
  const now = new Date().toISOString();
  const id = createSessionCode();
  const session = {
    id,
    title: String(body.title || 'Topic Draw').trim().slice(0, 80) || 'Topic Draw',
    instructions: String(body.instructions || 'Submit a question or topic for the group to discuss.').trim().slice(0, 240),
    phase: 'collecting',
    currentTopicId: null,
    createdAt: now,
    settings: {
      maxTopicLength: 180,
      allowMultipleSubmissions: true,
      moderationEnabled: true,
      discussionTimeLimit: 0,
    },
    topics: [],
  };
  sessions.set(id, session);
  return session;
}

function publicSession(session) {
  return {
    id: session.id,
    title: session.title,
    instructions: session.instructions,
    phase: session.phase,
    settings: session.settings,
  };
}

function json(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) request.destroy();
    });
    request.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function sendStatic(request, response, url) {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const requestedPath = path.normalize(path.join(PUBLIC_ROOT, pathname));
  if (!requestedPath.startsWith(PUBLIC_ROOT)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.readFile(requestedPath, (error, file) => {
    if (error) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }
    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(requestedPath)] || 'application/octet-stream' });
    response.end(file);
  });
}

async function handleApi(request, response, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (request.method === 'POST' && url.pathname === '/api/sessions') {
      return json(response, 201, createSession(await readJson(request)));
    }

    const sessionId = parts[2];
    const session = sessions.get(sessionId);
    if (parts[0] !== 'api' || parts[1] !== 'sessions' || !session) {
      return json(response, 404, { error: 'Session not found' });
    }

    if (request.method === 'GET' && parts.length === 3) {
      return json(response, 200, session);
    }

    if (request.method === 'GET' && parts[3] === 'public') {
      return json(response, 200, publicSession(session));
    }

    if (request.method === 'PATCH' && parts.length === 3) {
      const body = await readJson(request);
      if (body.phase && ['collecting', 'drawing', 'complete'].includes(body.phase)) session.phase = body.phase;
      if (typeof body.title === 'string') session.title = body.title.trim().slice(0, 80) || session.title;
      if (typeof body.instructions === 'string') session.instructions = body.instructions.trim().slice(0, 240);
      return json(response, 200, session);
    }

    if (request.method === 'POST' && parts[3] === 'topics') {
      if (session.phase !== 'collecting') return json(response, 409, { error: 'Submissions are closed' });
      const body = await readJson(request);
      const text = String(body.text || '').trim().slice(0, session.settings.maxTopicLength);
      if (!text) return json(response, 400, { error: 'Topic is required' });
      const topic = createTopic(text);
      session.topics.push(topic);
      return json(response, 201, { topic, session: publicSession(session) });
    }

    const topic = session.topics.find((item) => item.id === parts[4]);
    if (request.method === 'PATCH' && parts[3] === 'topics' && topic) {
      const body = await readJson(request);
      if (['approved', 'removed', 'discussed', 'skipped'].includes(body.status)) topic.status = body.status;
      if (typeof body.text === 'string') topic.text = body.text.trim().slice(0, session.settings.maxTopicLength) || topic.text;
      return json(response, 200, session);
    }

    if (request.method === 'POST' && parts[3] === 'draw') {
      const drawable = session.topics.filter((topic) => ['approved', 'skipped'].includes(topic.status));
      if (!drawable.length) return json(response, 409, { error: 'No topics available to draw' });
      const topic = drawable[Math.floor(Math.random() * drawable.length)];
      session.currentTopicId = topic.id;
      session.phase = 'drawing';
      return json(response, 200, { session, topic });
    }

    return json(response, 404, { error: 'Route not found' });
  } catch (error) {
    return json(response, 400, { error: 'Invalid request', detail: error.message });
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    handleApi(request, response, url);
    return;
  }
  sendStatic(request, response, url);
});

server.listen(PORT, () => {
  console.log(`Topic Draw is running at http://localhost:${PORT}`);
});
