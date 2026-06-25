const fs = require('fs');

const config = {
  firebase: {
    apiKey: process.env.FISHBOWL_FIREBASE_API_KEY || '',
    authDomain: process.env.FISHBOWL_FIREBASE_AUTH_DOMAIN || '',
    projectId: process.env.FISHBOWL_FIREBASE_PROJECT_ID || '',
    storageBucket: process.env.FISHBOWL_FIREBASE_STORAGE_BUCKET || '',
    messagingSenderId: process.env.FISHBOWL_FIREBASE_MESSAGING_SENDER_ID || '',
    appId: process.env.FISHBOWL_FIREBASE_APP_ID || '',
  },
  publicUrl: process.env.FISHBOWL_PUBLIC_URL || '',
};

fs.writeFileSync('src/env.js', `window.FISHBOWL_CONFIG = ${JSON.stringify(config, null, 2)};\n`);
console.log('Generated src/env.js');
