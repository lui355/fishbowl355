const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 5173;
const PUBLIC_DIR = __dirname;
const sessions = new Map();

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
    });
    req.on('error', reject);
  });
}
function publicSession(session) {
  return {
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    submissionsOpen: session.submissionsOpen,
  };
}
function topicView(topic) {
  return { id: topic.id, sessionId: topic.sessionId, text: topic.text, createdAt: topic.createdAt, status: topic.status };
}
function createSession() {
  const sessionId = crypto.randomBytes(4).toString('hex');
  const session = { sessionId, createdAt: new Date().toISOString(), submissionsOpen: true, topics: [] };
  sessions.set(sessionId, session);
  return session;
}
function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) return json(res, 403, { error: 'Forbidden' });
  fs.readFile(filePath, (error, contents) => {
    if (error) return json(res, 404, { error: 'Not found' });
    const ext = path.extname(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(contents);
  });
}
async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  try {
    if (req.method === 'POST' && url.pathname === '/api/sessions') return json(res, 201, { session: publicSession(createSession()) });
    if (parts[0] !== 'api' || parts[1] !== 'sessions' || !parts[2]) return json(res, 404, { error: 'Not found' });
    const session = sessions.get(parts[2]);
    if (!session) return json(res, 404, { error: 'Session not found' });
    if (req.method === 'GET' && parts.length === 3) return json(res, 200, { session: publicSession(session) });
    if (req.method === 'POST' && parts[3] === 'topics' && parts.length === 4) {
      if (!session.submissionsOpen) return json(res, 409, { error: 'Submissions are closed' });
      const body = await readBody(req);
      const text = String(body.text || '').trim();
      if (!text) return json(res, 400, { error: 'Topic text is required' });
      if (text.length > 80) return json(res, 400, { error: 'Topic text must be 80 characters or fewer' });
      const topic = { id: crypto.randomUUID(), sessionId: session.sessionId, text, createdAt: new Date().toISOString(), status: 'new' };
      session.topics.push(topic);
      return json(res, 201, { topic: topicView(topic) });
    }
    if (req.method === 'GET' && parts[3] === 'topics' && parts.length === 4) return json(res, 200, { topics: session.topics.map(topicView) });
    if (req.method === 'PATCH' && parts[3] === 'topics' && parts[4]) {
      const body = await readBody(req);
      if (!['new', 'discussed', 'skipped'].includes(body.status)) return json(res, 400, { error: 'Unsupported topic status' });
      const topic = session.topics.find((item) => item.id === parts[4]);
      if (!topic) return json(res, 404, { error: 'Topic not found' });
      topic.status = body.status;
      return json(res, 200, { topic: topicView(topic) });
    }
    if (req.method === 'PATCH' && parts[3] === 'submissions' && parts.length === 4) {
      const body = await readBody(req);
      session.submissionsOpen = body.open === true;
      return json(res, 200, { session: publicSession(session) });
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    return json(res, 400, { error: error.message });
  }
}

http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) return handleApi(req, res);
  return serveStatic(req, res);
}).listen(PORT, () => console.log(`Fishbowl server listening on http://localhost:${PORT}`));
