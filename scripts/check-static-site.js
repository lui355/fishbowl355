const fs = require('fs');
const requiredFiles = ['index.html', 'server.js', 'src/app.js', 'src/styles.css'];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) throw new Error(`Missing ${file}`);
  const contents = fs.readFileSync(file, 'utf8');
  if (!contents.trim()) throw new Error(`${file} is empty`);
}
console.log('Fishbowl app and server files are present.');
