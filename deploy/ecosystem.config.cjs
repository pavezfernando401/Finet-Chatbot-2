// PM2: `pm2 start deploy/ecosystem.config.cjs` from the repo root.
// See docs/despliegue-vps.md.
//
// .cjs because the package is ESM and PM2 loads this file with require().
const path = require('node:path');

module.exports = {
  apps: [
    {
      name: 'finet-chatbot',
      // The repo root, so Nest finds the .env there.
      cwd: path.join(__dirname, '..'),
      script: 'dist/main.js',
      // One process only: conversations live in its memory, and a second
      // instance would split them.
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '400M',
      // Shutdown hooks need a moment to close cleanly.
      kill_timeout: 10000,
      env: { NODE_ENV: 'production' },
    },
  ],
};
