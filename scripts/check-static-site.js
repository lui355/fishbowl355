const fs = require('fs');
const http = require('http');
const requiredFiles = ['index.html', 'server.js', 'src/app.js', 'src/styles.css'];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const contents = fs.readFileSync(file, 'utf8');
  if (!contents.trim()) throw new Error(`${file} is empty`);
}
const serverSource = fs.readFileSync('server.js', 'utf8');
if (!serverSource.includes("/api/sessions")) throw new Error('Session API routes are missing');
if (!http.createServer) throw new Error('Node http module is unavailable');
console.log('Topic Draw app files and server entrypoint are present.');
