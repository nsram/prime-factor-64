import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const files = new Map([
  ['index.html', 'text/html'],
  ['prime-factor-64.html', 'text/html'],
  ['fog-sweep-64.html', 'text/html'],
  ['learning-guide.html', 'text/html'],
  ['prime-factor-64-history.html', 'text/html'],
  ['fog-sweep-64-history.html', 'text/html'],
  ['practice-progress.js', 'text/javascript'],
  ['styles.css', 'text/css'],
  ['prime-factor-64-icon.png', 'image/png'],
  ['fog-sweep-64-icon.png', 'image/png'],
]);

createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const name = path === '/prime-factor-64/' ? 'index.html' : path.slice('/prime-factor-64/'.length);
  const type = path.startsWith('/prime-factor-64/') && files.get(name);
  if (!type) {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL('../../' + name, import.meta.url));
    response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(500).end();
  }
}).listen(Number(process.env.PF64_TEST_PORT ?? 4173), '127.0.0.1');
