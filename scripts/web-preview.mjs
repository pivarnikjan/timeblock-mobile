// Runs the app in a browser for a quick look at the screens (no Google sign-in
// there — load the demo plan from Settings). expo-sqlite's web build needs a
// cross-origin isolated page, which Expo's dev server does not set up, so this
// starts it on PORT + 1 and serves it on PORT with the two headers added.
//
//   npm run web            → http://localhost:8081
//   PORT=9000 npm run web  → http://localhost:9000
import { spawn } from 'node:child_process';
import http from 'node:http';
import net from 'node:net';

const port = Number(process.env.PORT ?? 8081);
const upstream = port + 1;

const expo = spawn(process.execPath, ['node_modules/expo/bin/cli', 'start', '--web', '--port', String(upstream)], {
  stdio: 'inherit',
  env: { ...process.env, BROWSER: 'none' },
});
expo.on('exit', (code) => process.exit(code ?? 0));

const ISOLATION = {
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-embedder-policy': 'credentialless',
};

const server = http.createServer((req, res) => {
  const forward = http.request(
    { host: '127.0.0.1', port: upstream, path: req.url, method: req.method, headers: req.headers },
    (answer) => {
      res.writeHead(answer.statusCode ?? 502, { ...answer.headers, ...ISOLATION });
      answer.pipe(res);
    },
  );
  forward.on('error', () => {
    res.writeHead(502, { 'content-type': 'text/plain' });
    res.end('Expo is still starting — reload in a moment.');
  });
  req.pipe(forward);
});

// Metro's live-reload socket.
server.on('upgrade', (req, socket, head) => {
  const target = net.connect(upstream, '127.0.0.1', () => {
    target.write(`${req.method} ${req.url} HTTP/${req.httpVersion}\r\n`);
    for (let i = 0; i < req.rawHeaders.length; i += 2) target.write(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}\r\n`);
    target.write('\r\n');
    target.write(head);
    target.pipe(socket).pipe(target);
  });
  target.on('error', () => socket.destroy());
  socket.on('error', () => target.destroy());
});

server.listen(port, () => console.log(`\nTimeBlock web preview: http://localhost:${port}\n`));
