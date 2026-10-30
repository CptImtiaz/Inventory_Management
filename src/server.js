// Standalone server (VPS, Docker, local). On Vercel, api/index.js is used instead.
const fs = require('fs');
const http = require('http');
const https = require('https');
const { app, ready, useTls } = require('./app');
const { startArchiver } = require('./archiver');

(async () => {
  await ready();
  startArchiver();
  const port = Number(process.env.PORT || (useTls ? 443 : 3000));
  const server = useTls
    ? https.createServer({ cert: fs.readFileSync(process.env.TLS_CERT), key: fs.readFileSync(process.env.TLS_KEY) }, app)
    : http.createServer(app);
  server.listen(port, () => console.log(`IMS running on ${useTls ? 'https' : 'http'}://localhost:${port}`));
})().catch(e => { console.error(e); process.exit(1); });
