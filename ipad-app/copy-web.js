// Copies the game into www/ so Capacitor can bundle it into the iPad app.
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, '..'), dest = path.join(__dirname, 'www');
const items = ['index.html', 'game.js', 'words.js', 'voice.js', 'manifest.json', 'icons', 'audio'];
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
for (const it of items) fs.cpSync(path.join(src, it), path.join(dest, it), { recursive: true });
console.log('Copied game into', dest);
